/**
 * 參數引用掃描
 * 掃描函式 body／參數預設值中對指定參數名稱的識別字引用，供移除參數前的使用檢查、
 * --add 預設值安全性檢查，以及參數 rename 時 body／其他參數預設值的引用改寫共用。
 */

import * as ts from 'typescript';
import { tsNodeToRange } from '@plugins/typescript/types.js';
import type { TextEdit } from '@infrastructure/changeset/index.js';
import type {
  FunctionSignature,
  SignatureChange
} from './types.js';
import {
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isRenameParameterChange
} from './types.js';
import { resolveParameterIndex } from './utils.js';
import type { FileUtils } from '@core/foundations/index.js';
import type { SignatureTransformer } from './signature-transformer.js';
import type { FunctionDeclarationLocator } from './function-declaration-locator.js';
import { collectScopeShadowedNames } from './scope-shadow-analyzer.js';
import { getScriptKind } from './script-kind.js';

export class ParameterReferenceScanner {
  constructor(
    private readonly fileUtils: FileUtils,
    private readonly transformer: SignatureTransformer,
    private readonly functionLocator: FunctionDeclarationLocator
  ) {}

  async validateRemovedParameterBodyReferences(
    signature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Promise<string | null> {
    const removedNames: string[] = [];

    for (const change of changes) {
      if (!isRemoveParameterChange(change)) {
        continue;
      }

      const index = resolveParameterIndex(signature.parameters, change.parameterNameOrIndex);
      const parameter = index >= 0 ? signature.parameters[index] : undefined;
      if (parameter) {
        removedNames.push(parameter.name);
      }
    }

    if (removedNames.length === 0) {
      return null;
    }

    const references = await this.findParameterReferencesBySource(signature, new Set(removedNames));
    if (references.inBody.length === 0 && references.inParameterDefaults.length === 0) {
      return null;
    }

    const messages: string[] = [];
    if (references.inBody.length > 0) {
      messages.push(`無法移除參數 ${references.inBody.join(', ')}：仍在函式 body 中使用`);
    }
    if (references.inParameterDefaults.length > 0) {
      messages.push(`無法移除參數 ${references.inParameterDefaults.join(', ')}：仍被其他參數的預設值引用`);
    }
    return messages.join('；');
  }

  /**
   * 偵測 --add 新參數的預設值是否引用同函式其他既有參數，且該值未經 --call-site-value
   * 明確指定（此時 CLI 層 callSiteValue 會退回與 defaultValue 相同文字，見
   * `change-signature.command.ts` 的 parseAddParameter：
   * `callSiteValue: explicitCallSiteValue ?? normalizedDefaultValue`）。
   *
   * 命中即代表這段運算式文字會被 CallSiteUpdater 逐字塞進每個呼叫點（見
   * call-site-updater.ts 對 add 的填值邏輯 `change.callSiteValue ?? change.defaultValue`），
   * 但呼叫點是具體引數、並無同函式參數作用域，該識別字懸空（TS2304）。
   *
   * 每個 change 依「此 change 之前所有 change 依序套用後」的當下參數列表判斷（與
   * SignatureValidator.validateChanges 同一套 splice 邏輯），排除新參數自身名稱。
   */
  validateAddParameterCallSiteSafety(
    signature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): { code: ChangeSignatureErrorCode; message: string } | null {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!isAddParameterChange(change) || change.defaultValue === undefined) {
        continue;
      }

      // callSiteValue 與 defaultValue 文字不同，代表使用者已透過 --call-site-value
      // 明確指定呼叫點值，該值是否引用其他參數是使用者自負責任的選擇，不在此攔截。
      if (change.callSiteValue !== change.defaultValue) {
        continue;
      }

      const currentSignature = this.transformer.applyChangesToSignature(signature, changes.slice(0, i));
      const otherParameterNames = new Set(
        currentSignature.parameters
          .map(parameter => parameter.name)
          .filter(name => name !== change.name)
      );
      if (otherParameterNames.size === 0) {
        continue;
      }

      const referencedName = this.findReferencedParameterNameInExpression(change.defaultValue, otherParameterNames);
      if (referencedName) {
        return {
          code: ChangeSignatureErrorCode.AmbiguousDefaultValueCallSiteReference,
          message: `參數 ${change.name} 的預設值 "${change.defaultValue}" 引用同函式參數 ${referencedName}，` +
            '此運算式會逐字塞入每個呼叫點、但呼叫端沒有同名繫結；' +
            `請用 --call-site-value ${change.name}=<expression> 明確指定呼叫點使用的值`
        };
      }
    }

    return null;
  }

  /**
   * 把運算式文字放進參數預設值語法位置解析成 AST，透過既有識別字走訪
   * （visitNodeForReferences，與 rename／remove 共用同一套遮蔽規則與屬性存取／
   * 物件鍵排除規則）找出是否引用 names 內任一名稱。AST 為準，避免字串比對誤判
   * `a1`、`obj.a` 等非真實引用的情形。
   */
  private findReferencedParameterNameInExpression(
    expressionText: string,
    names: ReadonlySet<string>
  ): string | undefined {
    const sourceFile = ts.createSourceFile(
      'change-signature-add-default.ts',
      `function __agentIdeAddDefault(__value = ${expressionText}) {}`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    const functionDeclaration = sourceFile.statements[0];
    if (!functionDeclaration || !ts.isFunctionDeclaration(functionDeclaration)) {
      return undefined;
    }
    const initializer = functionDeclaration.parameters[0]?.initializer;
    if (!initializer) {
      return undefined;
    }

    let referencedName: string | undefined;
    this.visitNodeForReferences(initializer, names, (node) => {
      referencedName ??= node.text;
    });
    return referencedName;
  }

  /**
   * 參數 rename 時，AST 位置改寫「其他參數」預設值（initializer）中對該參數的引用
   * （如 `timeout = config.defaultTimeout` 內的 `config` 改名時，同步改寫此處引用）。
   * 在呼叫 transformer 之前於輸入資料上修正 defaultValue 字串，讓
   * generateDefinitionUpdate 重建的參數列表文字天然帶有正確引用；不額外對這段文字
   * 產生 text edit，避免與定義區塊整體重寫（同一段參數列表文字）互相重疊。
   * 遮蔽規則與 body 引用改寫共用同一個底層走訪（visitNodeForReferences）。
   */
  async rewriteOtherParameterDefaultsForRename(
    signature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Promise<FunctionSignature> {
    const renameMap = new Map<string, string>();

    for (const change of changes) {
      if (!isRenameParameterChange(change)) {
        continue;
      }

      const index = resolveParameterIndex(signature.parameters, change.parameterNameOrIndex);
      const parameter = index >= 0 ? signature.parameters[index] : undefined;
      if (parameter && parameter.name !== change.newName) {
        renameMap.set(parameter.name, change.newName);
      }
    }

    if (renameMap.size === 0) {
      return signature;
    }

    const content = await this.fileUtils.readFile(signature.location.filePath);
    if (!content) {
      return signature;
    }

    const sourceFile = ts.createSourceFile(
      signature.location.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.functionLocator.findFunctionLikeDeclaration(sourceFile, signature);
    if (!targetFunction) {
      return signature;
    }

    const names = new Set(renameMap.keys());
    let changed = false;
    const parameters = signature.parameters.map((parameter, index) => {
      const initializer = targetFunction.parameters[index]?.initializer;
      if (!initializer) {
        return parameter;
      }

      const rewritten = this.rewriteExpressionTextForRename(initializer, sourceFile, names, renameMap);
      if (rewritten === parameter.defaultValue) {
        return parameter;
      }

      changed = true;
      return { ...parameter, defaultValue: rewritten };
    });

    return changed ? { ...signature, parameters } : signature;
  }

  /**
   * 以識別字節點位置（相對 expression 自身起點）切割重組字串，改寫其中對
   * renameMap 內名稱的引用。禁用整段字串替換（如 String.replace）：那會誤傷
   * 同名子字串（字串常量、註解、其他識別字前綴等），位置導向的切割重組才精確對應
   * 實際識別字節點；物件 shorthand 屬性（如 `b = { a }`）展開為 `key: newName`，
   * 與 body 改寫（generateParameterRenameBodyEdits）同一慣例。
   */
  private rewriteExpressionTextForRename(
    expression: ts.Expression,
    sourceFile: ts.SourceFile,
    names: ReadonlySet<string>,
    renameMap: ReadonlyMap<string, string>
  ): string {
    const originalText = expression.getText(sourceFile);
    const expressionStart = expression.getStart(sourceFile);

    const matches: Array<{ start: number; end: number; replacement: string }> = [];
    this.visitNodeForReferences(expression, names, (node) => {
      const newName = renameMap.get(node.text);
      if (!newName) {
        return;
      }
      const isShorthand = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
      matches.push({
        start: node.getStart(sourceFile) - expressionStart,
        end: node.getEnd() - expressionStart,
        replacement: isShorthand ? `${node.text}: ${newName}` : newName
      });
    });

    if (matches.length === 0) {
      return originalText;
    }

    matches.sort((a, b) => a.start - b.start);

    let result = '';
    let cursor = 0;
    for (const match of matches) {
      result += originalText.slice(cursor, match.start);
      result += match.replacement;
      cursor = match.end;
    }
    result += originalText.slice(cursor);

    return result;
  }

  async generateParameterRenameBodyEdits(
    signature: FunctionSignature,
    changes: readonly SignatureChange[]
  ): Promise<TextEdit[]> {
    const renameMap = new Map<string, string>();

    for (const change of changes) {
      if (!isRenameParameterChange(change)) {
        continue;
      }

      const index = resolveParameterIndex(signature.parameters, change.parameterNameOrIndex);
      const parameter = index >= 0 ? signature.parameters[index] : undefined;
      if (parameter && parameter.name !== change.newName) {
        renameMap.set(parameter.name, change.newName);
      }
    }

    if (renameMap.size === 0) {
      return [];
    }

    const content = await this.fileUtils.readFile(signature.location.filePath);
    if (!content) {
      return [];
    }

    const sourceFile = ts.createSourceFile(
      signature.location.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.functionLocator.findFunctionLikeDeclaration(sourceFile, signature);
    const body = targetFunction && 'body' in targetFunction ? targetFunction.body : undefined;

    if (!body) {
      return [];
    }

    const edits: TextEdit[] = [];

    // 僅掃描 body：其他參數預設值中的引用已在 rewriteOtherParameterDefaultsForRename
    // （transform 前）處理為 defaultValue 字串修正，這裡若再對同一段文字產生 text edit，
    // 會與 generateDefinitionUpdate 對整個參數列表的整段重寫互相重疊。
    this.forEachBodyIdentifierReference(body, new Set(renameMap.keys()), (node) => {
      const newName = renameMap.get(node.text);
      if (!newName) {
        return;
      }
      // 物件 shorthand 屬性（如 `return { userId }`）：識別字同時是屬性鍵與值側引用。
      // 直接替換會連屬性鍵一起改掉，因此展開為 `key: newName`，保留對外屬性鍵、只更新值側引用。
      const isShorthand = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
      const newText = isShorthand ? `${node.text}: ${newName}` : newName;

      edits.push({
        range: tsNodeToRange(node, sourceFile),
        newText,
        description: `Rename parameter reference ${node.text} -> ${newName}`
      });
    });

    return edits;
  }

  /**
   * 掃描函式 body 與所有參數自身預設值（initializer）表達式內、對指定名稱集合的
   * 識別字引用，依來源分類回呼（body / parameter-default）。涵蓋「參數預設值引用
   * 其他參數」的情況（如 `timeout = config.defaultTimeout` 對 config 的引用）；
   * findParameterReferencesBySource（移除參數前檢查是否仍被引用）以此為單一來源，
   * body 與 initializer 兩種掃描範圍不再各自維護一套走訪邏輯。
   */
  private forEachParameterReference(
    targetFunction: ts.FunctionLikeDeclaration,
    names: ReadonlySet<string>,
    onReference: (node: ts.Identifier, source: 'body' | 'parameter-default') => void
  ): void {
    const body = 'body' in targetFunction ? targetFunction.body : undefined;
    if (body) {
      this.forEachBodyIdentifierReference(body, names, (node) => onReference(node, 'body'));
    }

    for (const parameter of targetFunction.parameters) {
      if (parameter.initializer) {
        this.visitNodeForReferences(parameter.initializer, names, (node) => onReference(node, 'parameter-default'));
      }
    }
  }

  private async findParameterReferencesBySource(
    signature: FunctionSignature,
    names: ReadonlySet<string>
  ): Promise<{ inBody: string[]; inParameterDefaults: string[] }> {
    const empty = { inBody: [] as string[], inParameterDefaults: [] as string[] };

    const content = await this.fileUtils.readFile(signature.location.filePath);
    if (!content) {
      return empty;
    }

    const sourceFile = ts.createSourceFile(
      signature.location.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.functionLocator.findFunctionLikeDeclaration(sourceFile, signature);
    if (!targetFunction) {
      return empty;
    }

    const inBody = new Set<string>();
    const inParameterDefaults = new Set<string>();

    this.forEachParameterReference(targetFunction, names, (node, source) => {
      (source === 'body' ? inBody : inParameterDefaults).add(node.text);
    });

    return { inBody: Array.from(inBody), inParameterDefaults: Array.from(inParameterDefaults) };
  }

  /**
   * 遍歷函式 body 內對指定名稱集合的識別字引用，並回呼每個命中的引用節點。
   *
   * 與舊行為（無條件跳過所有巢狀函式）不同：預設會遞迴進入巢狀函式（閉包），
   * 只有當某巢狀函式「遮蔽」了某個目標名稱時，才對該子樹略過該名稱。
   * 遮蔽判定：巢狀函式宣告同名參數，或其作用域內以 const/let/var/function/class 重新宣告同名。
   * rename（改名閉包內引用）與 remove（偵測參數是否仍被使用）兩處共用此遍歷。
   */
  private forEachBodyIdentifierReference(
    body: ts.Node,
    names: ReadonlySet<string>,
    onReference: (node: ts.Identifier) => void
  ): void {
    ts.forEachChild(body, (child) => this.visitNodeForReferences(child, names, onReference));
  }

  /**
   * 識別字引用走訪的共用底層實作：檢查節點自身是否為命中的識別字，並依作用域遮蔽
   * 規則遞迴子節點。body 掃描（forEachBodyIdentifierReference）與 initializer 掃描
   * （forEachParameterReference、rewriteExpressionTextForRename）皆以此為單一實作，
   * 避免各自重複一套走訪＋遮蔽邏輯（Single Source of Truth）。
   */
  private visitNodeForReferences(
    node: ts.Node,
    liveNames: ReadonlySet<string>,
    onReference: (node: ts.Identifier) => void
  ): void {
    if (liveNames.size === 0) {
      return;
    }

    // 進入會建立作用域的節點時，移除被「該作用域自身宣告」遮蔽的名稱後再遞迴子樹。
    // 遮蔽按作用域粒度計：函式層＝參數 + body 內 var（提升）；區塊層（Block／迴圈頭／
    // catch）＝該層直接的 let/const/class/function 宣告，只遮該子樹——不得把區塊內
    // 宣告當整函式遮蔽，否則閉包對外層參數的引用會被漏算（rename 漏改、remove 誤放行）
    let childLiveNames = liveNames;
    const shadowed = collectScopeShadowedNames(node);
    if (shadowed.size > 0) {
      childLiveNames = new Set([...liveNames].filter(name => !shadowed.has(name)));
    }

    if (
      ts.isIdentifier(node)
      && liveNames.has(node.text)
      && !this.shouldSkipParameterIdentifier(node)
    ) {
      onReference(node);
    }

    ts.forEachChild(node, (child) => this.visitChildForReferences(child, childLiveNames, onReference));
  }

  /**
   * 型別位置的子樹整棵跳過遞迴：TS 值／型別是兩個獨立命名空間，型別節點
   * （TypeReference、TypeLiteral、AsExpression／SatisfiesExpression／TypeAssertion
   * 的 .type、參數與變數宣告的型別標註等）內的識別字查找的是型別空間繫結，
   * 與同名參數（值空間繫結）無關——即使兩者剛好同名也不構成引用（R2-2）。
   * 唯一例外是 TypeQueryNode（`typeof x`）：語法上掛在型別位置，但 exprName
   * 語意上查詢的是值空間繫結，仍須繼續視為值引用遞迴，否則「參數只在
   * typeof 中被引用」會被誤判為未使用而放行移除，留下懸空引用。
   */
  private visitChildForReferences(
    child: ts.Node,
    liveNames: ReadonlySet<string>,
    onReference: (node: ts.Identifier) => void
  ): void {
    if (ts.isTypeNode(child)) {
      if (ts.isTypeQueryNode(child)) {
        this.visitNodeForReferences(child.exprName, liveNames, onReference);
      }
      return;
    }

    this.visitNodeForReferences(child, liveNames, onReference);
  }

  private shouldSkipParameterIdentifier(node: ts.Identifier): boolean {
    const parent = node.parent;
    if (!parent) {
      return false;
    }

    if (ts.isPropertyAccessExpression(parent) && parent.name === node) {
      return true;
    }

    if (ts.isPropertyAssignment(parent) && parent.name === node) {
      return true;
    }

    if (ts.isPropertyDeclaration(parent) && parent.name === node) {
      return true;
    }

    if (ts.isPropertySignature(parent) && parent.name === node) {
      return true;
    }

    if (ts.isMethodDeclaration(parent) && parent.name === node) {
      return true;
    }

    return false;
  }
}

export function createParameterReferenceScanner(
  fileUtils: FileUtils,
  transformer: SignatureTransformer,
  functionLocator: FunctionDeclarationLocator
): ParameterReferenceScanner {
  return new ParameterReferenceScanner(fileUtils, transformer, functionLocator);
}
