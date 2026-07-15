/**
 * Change Signature Engine
 * 參數重構核心引擎
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset, TextEdit } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
import { SignatureParser } from './signature-parser.js';
import { SignatureValidator } from './signature-validator.js';
import { SignatureTransformer } from './signature-transformer.js';
import { CallSiteUpdater } from './call-site-updater.js';
import type {
  ChangeSignatureOptions,
  ChangeSignatureResult,
  FunctionSignature,
  ParameterDefinition,
  CallSiteUpdate,
  SignatureChange
} from './types.js';
import {
  ChangeSignatureErrorCode,
  isAddParameterChange,
  isRemoveParameterChange,
  isReorderParametersChange,
  isRenameParameterChange
} from './types.js';
import { resolveParameterIndex } from './utils.js';
import { SymbolFinder, FileUtils, createFileUtils } from '@core/foundations/index.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS, PathUtils } from '@core/move/path-utils.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';

/**
 * 中介檔（barrel）的單層 re-export 轉發資訊
 */
interface ReexportForward {
  /** re-export 的來源模組路徑（`from '<spec>'`） */
  readonly moduleSpecifier: string;
  /** 具名轉發的原始符號名稱；undefined 表示 `export * from` 轉發全部具名匯出（不含 default） */
  readonly exportedName?: string;
}

/**
 * 單一檔案中對目標符號的本地繫結
 */
interface TargetFileBindings {
  /**
   * 以「識別字」直接呼叫目標的本地名稱集合：目標定義檔中的函式名本身，
   * 以及具名／別名／default import 的本地繫結名（`import { combine as merge }` → `merge`）。
   */
  readonly localNames: Set<string>;
  /**
   * namespace import 的 receiver 名稱集合（`import * as lib` → `lib`），
   * 呼叫形如 `<receiver>.<functionName>(...)`。
   */
  readonly namespaceReceivers: Set<string>;
}

/** tsconfig 路徑解析設定（pathAliases 期望已解析為絕對路徑，見 tsconfig-loader） */
export interface ChangeSignaturePathConfig {
  readonly pathAliases?: PathAliasInput;
  readonly baseUrl?: string;
}

/**
 * Change Signature Engine
 */
export class ChangeSignatureEngine {
  private readonly fileUtils: FileUtils;
  private readonly signatureParser: SignatureParser;
  private readonly symbolFinder: SymbolFinder;
  private readonly validator: SignatureValidator;
  private readonly transformer: SignatureTransformer;
  private readonly callSiteUpdater: CallSiteUpdater;
  private readonly pathUtils: PathUtils;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem,
    pathConfig?: ChangeSignaturePathConfig
  ) {
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
    this.signatureParser = new SignatureParser(parserRegistry, fileSystem);
    this.symbolFinder = new SymbolFinder(parserRegistry, fileSystem);
    this.validator = new SignatureValidator();
    this.transformer = new SignatureTransformer();
    this.callSiteUpdater = new CallSiteUpdater(fileSystem, parserRegistry);
    // 重用 file-move 的 PathUtils 解析 import specifier（相對路徑、tsconfig paths 別名、
    // baseUrl、index 檔慣例），與 move / move-member 同一把尺（Single Source of Truth）
    this.pathUtils = new PathUtils(
      new ImportResolver({
        pathAliases: pathConfig?.pathAliases ?? {},
        baseUrl: pathConfig?.baseUrl,
        supportedExtensions: ALLOWED_EXTENSIONS
      })
    );
  }

  /**
   * 執行 Change Signature
   */
  async changeSignature(options: ChangeSignatureOptions): Promise<ChangeSignatureResult> {
    // 1. 解析原始簽名
    const originalSignature = await this.signatureParser.parseSignature(
      options.filePath,
      options.functionName
    );

    if (!originalSignature) {
      return this.createErrorResult(
        ChangeSignatureErrorCode.FunctionNotFound,
        `找不到函式: ${options.functionName}`
      );
    }

    // 1b. overload 簽章群偵測（T3）：同 scope 有多個同名 function-like 宣告且含無 body 的
    // overload 簽章時，任何簽章變更只會命中其中一個宣告（findFunctionNode 前序取第一個），
    // 且 reorder/add 對各異參數列的 overload 群語意不明確 → 偵測即拒絕，不做「聰明地」全群改寫。
    // 偵測邏輯放定位層，不改共用 findFunctionNode 的回傳語意（deadcode 亦依賴之），防跨模組回歸。
    const overloadDeclarationLines = await this.detectOverloadSignatureGroup(originalSignature);
    if (overloadDeclarationLines) {
      const positions = overloadDeclarationLines
        .map(line => `${originalSignature.location.filePath}:${line}`)
        .join(', ');
      return this.createErrorResult(
        ChangeSignatureErrorCode.OverloadSignatureGroup,
        `不支援 overload 簽章群的簽章變更：${options.functionName} 有 ${overloadDeclarationLines.length} 個同名宣告（${positions}）`
      );
    }

    // 2. 驗證變更
    const validationErrors = this.validator.validateChanges(originalSignature, options.changes);
    if (validationErrors.length > 0) {
      return this.createErrorResult(
        validationErrors[0].code,
        validationErrors[0].message
      );
    }

    const removedParameterUsageError = await this.validateRemovedParameterBodyReferences(originalSignature, options.changes);
    if (removedParameterUsageError) {
      return this.createErrorResult(
        ChangeSignatureErrorCode.RequiredParameterInUse,
        removedParameterUsageError
      );
    }

    // 2b. 參數 rename 時，先於 transform 前修正其他參數預設值字串中對該參數的引用
    // （AST 位置改寫，見 rewriteOtherParameterDefaultsForRename），讓後續由結構欄位
    // 重建的定義文字天然帶有正確引用，避免另外產生會與定義區塊整體重寫互相重疊的 text edit。
    const signatureForTransform = await this.rewriteOtherParameterDefaultsForRename(originalSignature, options.changes);

    // 3. 計算新簽名
    const newSignature = this.transformer.applyChangesToSignature(signatureForTransform, options.changes);

    // 3b. 驗證變更後的最終參數順序：rest 參數必須位於最後。此檢查作用於 transformer
    // 算出的最終列表，無論觸發原因是 reorder、add 或其他變更組合皆一併涵蓋，不需在
    // 各變更類型分支各自模擬一套順序邏輯（Single Source of Truth：與 transformer 同一份計算）。
    const restOrderError = this.validator.validateRestParameterIsLast(newSignature.parameters);
    if (restOrderError) {
      return this.createErrorResult(restOrderError.code, restOrderError.message);
    }

    // 4. 取得所有呼叫點
    // 純 rename / change-type（不含 add/remove/reorder）不改變呼叫點的參數映射，
    // 對呼叫點而言語意等價 → 跳過掃描與重寫，避免產生純重新排版（如 `fn(a,b)` -> `fn(a, b)`）的噪音 diff。
    const requiresCallSiteRewrite = this.changesRequireCallSiteRewrite(options.changes);
    let callSites: CallSite[] = [];

    if (requiresCallSiteRewrite) {
      // 當檔案路徑是絕對路徑且不在 projectRoot 內時，自動推斷 projectRoot
      let effectiveProjectRoot = options.projectRoot;
      if (path.isAbsolute(options.filePath) && !options.filePath.startsWith(effectiveProjectRoot)) {
        effectiveProjectRoot = path.dirname(options.filePath);
        // 嘗試向上找到 package.json 所在目錄
        let searchDir = effectiveProjectRoot;
        while (searchDir !== path.dirname(searchDir)) {
          const packageJsonPath = path.join(searchDir, 'package.json');
          try {
            const exists = await this.fileSystem.exists(packageJsonPath);
            if (exists) {
              effectiveProjectRoot = searchDir;
              break;
            }
          } catch {
            // graceful-degradation: 無法存取此目錄的 package.json，繼續向上搜索
          }
          searchDir = path.dirname(searchDir);
        }
      }

      const projectFiles = options.targetFiles ?? await this.getProjectFiles(effectiveProjectRoot);

      // T2：constructor 目標的呼叫點是 `new ClassName(...)`（NewExpression），以「類別名」定位，
      // 與一般函式的名稱比對同保真度；非 constructor 目標維持以函式名定位一般呼叫點。
      const constructorClassName = (originalSignature.name === 'constructor' && originalSignature.className)
        ? originalSignature.className
        : undefined;
      const isConstructorTarget = constructorClassName !== undefined;
      const searchName = constructorClassName ?? options.functionName;

      // 限縮呼叫點掃描範圍：僅「語意上可能引用目標」的檔案。逐檔解析出目標符號的本地繫結
      // （named／alias／default import 的本地名、namespace import 的 receiver，以及遞迴 barrel
      // re-export 轉發），避免全專案掃同名而誤改跨檔同名符號。
      const bindings = await this.resolveTargetBindings(
        projectFiles,
        options.filePath,
        searchName
      );

      if (isConstructorTarget || originalSignature.isMethod) {
        // constructor／method 目標維持既有「以目標名全域掃描 + 型別安全性拒絕」路徑：
        // 僅取「以本地名 === 目標名」繫結的檔案（不含 alias／namespace），與舊行為對齊。
        const relevantFiles = [...bindings.keys()].filter(
          file => bindings.get(file)?.localNames.has(searchName)
        );
        // constructor 目標才 opt-in 掃描 new-expression，避免變更其他消費端（如 call-hierarchy）行為。
        const allCallSites = await this.symbolFinder.findCallSites(
          searchName,
          relevantFiles,
          { includeNewExpressions: isConstructorTarget }
        );

        if (isConstructorTarget) {
          // `new ns.ClassName(...)`（帶 receiver）需型別解析才能確認指向同一類別，無此基礎設施 → 拒絕。
          const qualifiedNewCallSites = allCallSites.filter(cs => cs.isNewExpression && cs.isMethodCall);
          if (qualifiedNewCallSites.length > 0) {
            return this.createErrorResult(
              ChangeSignatureErrorCode.MethodCallSiteUnsupported,
              `偵測到 ${qualifiedNewCallSites.length} 個限定式建構子呼叫點（new receiver.Class(...)），` +
              `無型別解析無法安全重寫：${this.formatCallSitePositions(qualifiedNewCallSites)}`
            );
          }
          callSites = allCallSites.filter(cs => cs.isNewExpression === true && !cs.isMethodCall);
        } else {
          // T1：目標「本身是 class 方法」時，同名的方法呼叫點（`calc.add(1, 2)`）確為對目標的引用，
          // 但重寫需 receiver 型別解析才能避免把無關類別的同名方法（各種 `.add()`）一起改壞；本工具
          // 無型別解析基礎設施。故偵測到即拒絕，不再靜默丟棄——靜默丟棄會造成定義改了、方法呼叫點
          // 沒動的毀損（success:true 但呼叫端停在舊引數順序）。
          const methodCallSites = allCallSites.filter(cs => cs.isMethodCall);
          if (methodCallSites.length > 0) {
            return this.createErrorResult(
              ChangeSignatureErrorCode.MethodCallSiteUnsupported,
              `偵測到 ${methodCallSites.length} 個方法呼叫點，方法呼叫點重寫不受支援（需 receiver 型別解析）：` +
              `${this.formatCallSitePositions(methodCallSites)}`
            );
          }
          callSites = allCallSites.filter(cs => !cs.isMethodCall);
        }
      } else {
        // 目標是頂層函數／變數函數：逐檔以「該檔實際繫結目標的本地名」定位呼叫點——
        // 直接／具名／別名 import 以本地識別字呼叫（`combine(...)`、別名 `merge(...)`），
        // namespace import 以 `<receiver>.<functionName>(...)` 呼叫。以本地名精確比對，
        // 天然排除無關同名符號（不需再靠 method-call 全域過濾，該過濾會誤殺 namespace 呼叫）。
        callSites = await this.collectTopLevelFunctionCallSites(bindings, options.functionName);
      }

      // 呼叫點含 spread 引數（如 `f(...values)`）時，CallSiteUpdater 依「定位索引」重新映射
      // 引數（add/remove/reorder 皆會改變定位映射，見 changesRequireCallSiteRewrite），但單一
      // spread 引數在原始碼中只佔一個 AST 引數位置、實際可能展開對應多個宣告參數，其真正數量
      // 與內容只能在執行期得知，無法靜態決定要搬到哪個新位置——連「只在尾端新增參數」也一樣會壞
      // （spread 涵蓋不到的後續必要參數位置會被誤判成「省略」而補 undefined，見 call-site-updater
      // mapCallSiteArguments 對 `param.optional || param.defaultValue !== undefined` 的省略判斷）。
      // 純 rename／change-type 不需要呼叫點重寫（見 changesRequireCallSiteRewrite），不會走到此檢查。
      const spreadCallSiteError = this.findSpreadCallSiteError(callSites);
      if (spreadCallSiteError) {
        return this.createErrorResult(
          ChangeSignatureErrorCode.SpreadArgumentCallSite,
          spreadCallSiteError
        );
      }
    }

    // 5. 生成定義更新
    const definitionUpdate = await this.generateDefinitionUpdate(
      options.filePath,
      originalSignature,
      newSignature
    );

    // 6. 生成呼叫點更新
    const callSiteUpdates = requiresCallSiteRewrite
      ? await this.callSiteUpdater.generateCallSiteUpdates(
        callSites,
        originalSignature,
        newSignature,
        options.changes
      )
      : [];

    // 7. 計算影響的檔案
    const affectedFiles = new Set<string>();
    affectedFiles.add(definitionUpdate.filePath);
    for (const update of callSiteUpdates) {
      affectedFiles.add(update.filePath);
    }

    return {
      success: true,
      originalSignature,
      newSignature,
      definitionUpdate,
      callSiteUpdates,
      // 本方法從不直接寫入檔案：實際寫入統一經由 generateChangeset() 產生的
      // Changeset + ChangeApplicator 完成（見 CLI 呼叫路徑），故恆為 false。
      executed: false,
      stats: {
        callSitesUpdated: callSiteUpdates.length,
        filesAffected: affectedFiles.size
      }
    };
  }

  /**
   * 生成參數簽名變更的 Changeset
   * 使用 preview 模式收集變更，轉換為統一的 Changeset 格式
   *
   * @param options - 變更選項（強制使用 preview 模式）
   * @returns Changeset 物件
   */
  async generateChangeset(options: ChangeSignatureOptions): Promise<Changeset> {
    const builder = createChangesetBuilder().forCommand(ChangesetCommand.ChangeSignature);

    // 使用現有邏輯（preview 模式）收集變更
    const result = await this.changeSignature({
      ...options,
      preview: true
    });

    if (!result.success) {
      return builder
        .addError(result.error ?? 'Change signature failed')
        .withDescription(result.error ?? 'Change signature failed')
        .build();
    }

    // 轉換 definitionUpdate
    const { filePath, originalCode, newCode, location } = result.definitionUpdate;

    if (!this.areParametersEquivalent(
      result.originalSignature.parameters,
      result.newSignature.parameters
    )) {
      builder.addTextChange(filePath, [{
        range: {
          start: location.range.start,
          end: location.range.end
        },
        newText: newCode,
        description: `Update definition: ${originalCode.trim()} -> ${newCode.trim()}`
      }], TextEditOperationType.Modify);
    }

    const parameterRenameEdits = await this.generateParameterRenameBodyEdits(
      result.originalSignature,
      options.changes
    );
    if (parameterRenameEdits.length > 0) {
      builder.addTextChange(filePath, parameterRenameEdits, TextEditOperationType.Modify);
    }

    // 轉換 callSiteUpdates
    // 按檔案分組，合併同一檔案的多個變更
    const updatesByFile = new Map<string, CallSiteUpdate[]>();
    for (const update of result.callSiteUpdates) {
      const existing = updatesByFile.get(update.filePath);
      if (existing) {
        existing.push(update);
      } else {
        updatesByFile.set(update.filePath, [update]);
      }
    }

    for (const [updateFilePath, updates] of updatesByFile) {
      const effectiveUpdates = updates.filter(update => update.originalCode !== update.newCode);
      if (effectiveUpdates.length === 0) {
        continue;
      }

      // 跳過與 definitionUpdate 同一檔案（避免重複）
      // 已經在上面處理過了，呼叫點和定義可能在同一行
      const edits = effectiveUpdates.map(update => this.createCallSiteTextEdit(update));

      builder.addTextChange(updateFilePath, edits, TextEditOperationType.Modify);
    }

    // 設定描述
    const originalParams = result.originalSignature.parameters.map(p => p.name).join(', ');
    const newParams = result.newSignature.parameters.map(p => p.name).join(', ');
    builder.withDescription(
      `Changed signature of ${result.originalSignature.name}: (${originalParams}) -> (${newParams})`
    );

    return builder.build();
  }

  private createCallSiteTextEdit(update: CallSiteUpdate): TextEdit {
    // 直接使用呼叫點的精確範圍（函式名第一個字元到右括號之後），
    // newText 為重建後的呼叫運算式。如此同一行的不同呼叫會產生互不重疊的 edit。
    return {
      range: {
        start: update.location.range.start,
        end: update.location.range.end
      },
      newText: update.newCode,
      description: `Update call: ${update.originalCode.trim()} -> ${update.newCode.trim()}`
    };
  }

  /**
   * 檢查呼叫點清單中是否有引數為 spread element（如 `...values`）。
   * 只需文字前綴判斷：CallSiteArgument.value 是引數節點的原始原始碼文字（見
   * call-site-parser.ts extractArguments／parseArgumentsMultiline），
   * `...` 只會出現在 spread/rest 引數的開頭，不會是其他合法運算式文字的前三個字元
   * （optional chaining 是 `?.`，字串/樣板字面量以引號開頭），故無誤判風險。
   * 回傳第一個命中的呼叫點對應的錯誤訊息；無命中回傳 null。
   */
  private findSpreadCallSiteError(callSites: readonly CallSite[]): string | null {
    for (const callSite of callSites) {
      const hasSpreadArgument = callSite.arguments.some(arg => arg.value.startsWith('...'));
      if (hasSpreadArgument) {
        return `呼叫點 ${callSite.functionName}(...) 於 ${callSite.location.filePath}:${callSite.location.range.start.line} 含 spread 引數，` +
          '無法靜態重新映射定位引數，change-signature 的新增/移除/重排參數操作已中止';
      }
    }
    return null;
  }

  /**
   * 判斷變更集合是否需要重寫呼叫點。
   * 呼叫點的參數映射（順序/數量）只受 Add/Remove/Reorder 影響（見 CallSiteUpdater.createParameterMapping）；
   * 純 rename、change-type（或兩者組合）不改變呼叫點的引數順序或數量，跳過呼叫點掃描與重寫。
   * 混合變更（如 rename + reorder）因含 Reorder 仍會回傳 true。
   */
  private changesRequireCallSiteRewrite(changes: readonly SignatureChange[]): boolean {
    return changes.some(change =>
      isAddParameterChange(change) || isRemoveParameterChange(change) || isReorderParametersChange(change)
    );
  }

  private areParametersEquivalent(
    left: readonly ParameterDefinition[],
    right: readonly ParameterDefinition[]
  ): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((parameter, index) => {
      const other = right[index];
      return parameter.name === other.name &&
        parameter.type === other.type &&
        parameter.defaultValue === other.defaultValue &&
        parameter.optional === other.optional &&
        parameter.rest === other.rest;
    });
  }

  private async validateRemovedParameterBodyReferences(
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
   * 參數 rename 時，AST 位置改寫「其他參數」預設值（initializer）中對該參數的引用
   * （如 `timeout = config.defaultTimeout` 內的 `config` 改名時，同步改寫此處引用）。
   * 在呼叫 transformer 之前於輸入資料上修正 defaultValue 字串，讓
   * generateDefinitionUpdate 重建的參數列表文字天然帶有正確引用；不額外對這段文字
   * 產生 text edit，避免與定義區塊整體重寫（同一段參數列表文字）互相重疊。
   * 遮蔽規則與 body 引用改寫共用同一個底層走訪（visitNodeForReferences）。
   */
  private async rewriteOtherParameterDefaultsForRename(
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
      this.getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.findFunctionLikeDeclaration(sourceFile, signature);
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

  private async generateParameterRenameBodyEdits(
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
      this.getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.findFunctionLikeDeclaration(sourceFile, signature);
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
      const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

      // 物件 shorthand 屬性（如 `return { userId }`）：識別字同時是屬性鍵與值側引用。
      // 直接替換會連屬性鍵一起改掉，因此展開為 `key: newName`，保留對外屬性鍵、只更新值側引用。
      const isShorthand = ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node;
      const newText = isShorthand ? `${node.text}: ${newName}` : newName;

      edits.push({
        range: {
          start: { line: start.line + 1, column: start.character + 1 },
          end: { line: end.line + 1, column: end.character + 1 }
        },
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
      this.getScriptKind(signature.location.filePath)
    );
    const targetFunction = this.findFunctionLikeDeclaration(sourceFile, signature);
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
    const shadowed = this.collectScopeShadowedNames(node);
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

  /**
   * 收集某作用域節點「自身」宣告的名稱（用於遮蔽判定），按節點種類分流：
   * 函式層與區塊層分開計，讓區塊內宣告只遮蔽該區塊子樹。
   */
  private collectScopeShadowedNames(node: ts.Node): Set<string> {
    if (this.isFunctionLikeDeclaration(node)) {
      return this.collectFunctionLevelShadowedNames(node as ts.FunctionLikeDeclaration);
    }
    return this.collectBlockLevelDeclaredNames(node);
  }

  /**
   * 函式層遮蔽：參數名 + body 內 var 宣告（var 提升到函式層，整個函式子樹被遮蔽）。
   * let/const/class/function 屬區塊層，由 collectBlockLevelDeclaredNames 於所屬
   * 區塊節點處理；不跨入更深層的巢狀函式作用域。
   */
  private collectFunctionLevelShadowedNames(func: ts.FunctionLikeDeclaration): Set<string> {
    const declared = new Set<string>();

    for (const parameter of func.parameters) {
      this.collectBindingNames(parameter.name, declared);
    }

    const body = 'body' in func ? func.body : undefined;
    if (!body) {
      return declared;
    }

    const scan = (node: ts.Node): void => {
      // 更深巢狀函式的宣告屬其自身作用域，不再往下掃
      if (this.isFunctionLikeDeclaration(node)) {
        return;
      }
      if (
        ts.isVariableDeclaration(node)
        && ts.isVariableDeclarationList(node.parent)
        && (node.parent.flags & ts.NodeFlags.BlockScoped) === 0
      ) {
        this.collectBindingNames(node.name, declared);
      }
      ts.forEachChild(node, scan);
    };

    ts.forEachChild(body, scan);
    return declared;
  }

  /**
   * 區塊層遮蔽：該作用域節點「直接」宣告的 let/const/class/function 名稱
   * （Block 的頂層語句、迴圈頭的 block-scoped 宣告、catch 變數），
   * 不遞迴更深區塊——更深區塊由各自節點在遍歷時處理。
   */
  private collectBlockLevelDeclaredNames(node: ts.Node): Set<string> {
    const declared = new Set<string>();

    if (ts.isBlock(node)) {
      for (const statement of node.statements) {
        if (
          ts.isVariableStatement(statement)
          && (statement.declarationList.flags & ts.NodeFlags.BlockScoped) !== 0
        ) {
          for (const declaration of statement.declarationList.declarations) {
            this.collectBindingNames(declaration.name, declared);
          }
        }
        if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
          declared.add(statement.name.text);
        }
      }
      return declared;
    }

    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      const initializer = node.initializer;
      if (
        initializer
        && ts.isVariableDeclarationList(initializer)
        && (initializer.flags & ts.NodeFlags.BlockScoped) !== 0
      ) {
        for (const declaration of initializer.declarations) {
          this.collectBindingNames(declaration.name, declared);
        }
      }
      return declared;
    }

    if (ts.isCatchClause(node) && node.variableDeclaration) {
      this.collectBindingNames(node.variableDeclaration.name, declared);
    }

    return declared;
  }

  /**
   * 從 binding name（識別字或解構樣式）收集所有繫結的識別字名稱
   */
  private collectBindingNames(name: ts.BindingName, target: Set<string>): void {
    if (ts.isIdentifier(name)) {
      target.add(name.text);
      return;
    }

    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        this.collectBindingNames(element.name, target);
      }
    }
  }

  /** 將呼叫點清單格式化為 `filePath:line` 的逗號分隔字串（供拒絕訊息列位置） */
  private formatCallSitePositions(callSites: readonly CallSite[]): string {
    return callSites
      .map(cs => `${cs.location.filePath}:${cs.location.range.start.line}`)
      .join(', ');
  }

  /**
   * 偵測目標是否屬於 overload 簽章群：同一 scope 內有 ≥2 個同名的 FunctionDeclaration／
   * MethodDeclaration，且其中存在無 body 者（overload 簽章；實作宣告才有 body）。
   * 回傳每個同名宣告的行號（1-based，供拒絕訊息列位置）；非 overload 群時回傳 null。
   *
   * overload 群的簽章與實作必為「同一父節點」（模組層 statements 或 class members）的直接子節點，
   * 故以定位到的目標節點之 parent 為 scope 邊界收集兄弟宣告，不會把不同 class／作用域的同名符號
   * 誤判為同群。findFunctionLikeDeclaration 以名稱＋行號定位（overload 情況為第一個簽章）。
   */
  private async detectOverloadSignatureGroup(signature: FunctionSignature): Promise<number[] | null> {
    const content = await this.fileUtils.readFile(signature.location.filePath);
    if (!content) {
      return null;
    }

    const sourceFile = ts.createSourceFile(
      signature.location.filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(signature.location.filePath)
    );
    const target = this.findFunctionLikeDeclaration(sourceFile, signature);
    if (!target || (!ts.isFunctionDeclaration(target) && !ts.isMethodDeclaration(target))) {
      return null;
    }

    const isSameNameFunctionLike = (
      node: ts.Node
    ): node is ts.FunctionDeclaration | ts.MethodDeclaration => {
      if (ts.isFunctionDeclaration(node)) {
        return node.name?.text === signature.name;
      }
      if (ts.isMethodDeclaration(node)) {
        return ts.isIdentifier(node.name) && node.name.text === signature.name;
      }
      return false;
    };

    const siblings: Array<ts.FunctionDeclaration | ts.MethodDeclaration> = [];
    ts.forEachChild(target.parent, (child) => {
      if (isSameNameFunctionLike(child)) {
        siblings.push(child);
      }
    });

    if (siblings.length < 2 || !siblings.some(node => node.body === undefined)) {
      return null;
    }

    return siblings.map(node =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    );
  }

  private findFunctionLikeDeclaration(
    sourceFile: ts.SourceFile,
    signature: FunctionSignature
  ): ts.FunctionLikeDeclaration | undefined {
    let found: ts.FunctionLikeDeclaration | undefined;

    const visit = (node: ts.Node): void => {
      if (found) {
        return;
      }

      if (this.isNamedFunctionLikeDeclaration(node, signature.name)) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        if (start.line + 1 === signature.location.range.start.line) {
          found = node;
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return found;
  }

  private isNamedFunctionLikeDeclaration(node: ts.Node, name: string): node is ts.FunctionLikeDeclaration {
    if (
      (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isFunctionExpression(node))
      && this.getFunctionLikeName(node) === name
    ) {
      return true;
    }

    if (ts.isArrowFunction(node)) {
      const parent = node.parent;
      return ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name) && parent.name.text === name;
    }

    return false;
  }

  private getFunctionLikeName(node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.FunctionExpression): string | undefined {
    const nodeName = node.name;
    if (!nodeName) {
      return undefined;
    }
    if (ts.isIdentifier(nodeName) || ts.isStringLiteral(nodeName) || ts.isNumericLiteral(nodeName)) {
      return nodeName.text;
    }
    return undefined;
  }

  private isFunctionLikeDeclaration(node: ts.Node): boolean {
    return ts.isFunctionDeclaration(node)
      || ts.isMethodDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isConstructorDeclaration(node)
      || ts.isGetAccessorDeclaration(node)
      || ts.isSetAccessorDeclaration(node);
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

  private getScriptKind(filePath: string): ts.ScriptKind {
    if (filePath.endsWith('.tsx')) {
      return ts.ScriptKind.TSX;
    }
    if (filePath.endsWith('.jsx')) {
      return ts.ScriptKind.JSX;
    }
    if (filePath.endsWith('.js')) {
      return ts.ScriptKind.JS;
    }
    return ts.ScriptKind.TS;
  }

  /**
   * 生成定義更新
   */
  private async generateDefinitionUpdate(
    filePath: string,
    originalSignature: FunctionSignature,
    newSignature: FunctionSignature
  ): Promise<{ filePath: string; originalCode: string; newCode: string; location: typeof originalSignature.location }> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      throw new Error(`無法讀取檔案: ${filePath}`);
    }

    const lines = content.split('\n');

    // 生成新的參數列表
    const newParamsString = this.generateParameterString(newSignature, filePath);

    // 宣告替換範圍完全錨定 AST 宣告節點座標：signature-parser 的 regex 元資訊路徑
    // 會把「同檔中先於宣告出現的同名呼叫點」誤當宣告起點（bare identifier 命中
    // class-method 交替分支），導致 offset 指向呼叫點、與 AST 參數括號組出跨越呼叫點到
    // 宣告的超大範圍，與呼叫點自身的重寫 edit 互相重疊。故 AST 命中時一律以 AST 宣告節點
    // 起點為替換起點；僅在 AST 無法定位（非 TS/JS 或解析失敗）時 fallback 回 regex offset + scanner。
    const astRange = this.findParameterListRangeWithAst(content, filePath, originalSignature);
    const signatureStartOffset = astRange?.declarationStartIndex
      ?? originalSignature.location.range.start.offset
      ?? this.positionToOffset(lines, originalSignature.location.range.start.line, originalSignature.location.range.start.column);
    const parameterRange = astRange?.range
      ?? this.findParameterListRangeWithScanner(content, signatureStartOffset);
    if (!parameterRange) {
      throw new Error(`找不到函式 ${originalSignature.name} 的參數結束括號`);
    }
    let originalCode: string;
    let newCode: string;
    let replacementEndOffset: number;

    if ('parameterStartIndex' in parameterRange) {
      // 裸單參數箭頭函式沒有參數列表括號；只能替換 AST 精確指出的參數，
      // 不可讓 scanner fallback 跨到後續呼叫點的括號。
      const { parameterStartIndex, parameterEndIndex } = parameterRange;
      const replacement = newSignature.parameters.length === 1
        ? newParamsString
        : `(${newParamsString})`;
      originalCode = content.slice(signatureStartOffset, parameterEndIndex);
      newCode = content.slice(signatureStartOffset, parameterStartIndex) + replacement;
      replacementEndOffset = parameterEndIndex;
    } else {
      const { openParenIndex, closeParenIndex } = parameterRange;
      originalCode = content.slice(signatureStartOffset, closeParenIndex + 1);
      newCode = content.slice(signatureStartOffset, openParenIndex + 1) +
        newParamsString +
        ')';
      replacementEndOffset = closeParenIndex + 1;
    }

    return {
      filePath,
      originalCode,
      newCode,
      location: {
        filePath,
        range: {
          start: this.offsetToPosition(content, signatureStartOffset),
          end: this.offsetToPosition(content, replacementEndOffset)
        }
      }
    };
  }

  private findParameterListRangeWithAst(
    content: string,
    filePath: string,
    signature: FunctionSignature
  ): {
    declarationStartIndex: number;
    range: {
      openParenIndex: number;
      closeParenIndex: number;
    } | {
      parameterStartIndex: number;
      parameterEndIndex: number;
    };
  } | null {
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      this.getScriptKind(filePath)
    );
    const targetFunction = this.findFunctionLikeDeclaration(sourceFile, signature);
    if (!targetFunction) {
      return null;
    }

    const declarationStart = targetFunction.getStart(sourceFile);
    const openParenIndex = this.findOpenParenBeforeParameters(content, declarationStart, targetFunction.parameters.pos);
    const closeParenIndex = this.findCloseParenAfterParameters(content, targetFunction.parameters.end);

    if (openParenIndex >= 0 && closeParenIndex >= 0) {
      return { declarationStartIndex: declarationStart, range: { openParenIndex, closeParenIndex } };
    }

    // 裸單參數箭頭函式（`x => ...`）的 AST 參數節點本身就是可替換的完整範圍。
    // 這裡必須直接回傳該範圍，否則 scanner 會把宣告後的呼叫點括號誤認為參數列表。
    if (ts.isArrowFunction(targetFunction) && targetFunction.parameters.length === 1 && openParenIndex < 0) {
      const parameter = targetFunction.parameters[0];
      return {
        declarationStartIndex: declarationStart,
        range: {
          parameterStartIndex: parameter.getStart(sourceFile),
          parameterEndIndex: parameter.getEnd()
        }
      };
    }

    return null;
  }

  private findOpenParenBeforeParameters(content: string, declarationStart: number, parametersStart: number): number {
    for (let i = parametersStart - 1; i >= declarationStart; i--) {
      const char = content[i];
      if (char === '(') {
        return i;
      }
      if (!/\s/.test(char)) {
        const fallbackIndex = content.lastIndexOf('(', parametersStart);
        return fallbackIndex >= declarationStart ? fallbackIndex : -1;
      }
    }

    return -1;
  }

  private findCloseParenAfterParameters(content: string, parametersEnd: number): number {
    for (let i = parametersEnd; i < content.length; i++) {
      const char = content[i];
      if (char === ')') {
        return i;
      }
      if (!/\s/.test(char)) {
        return -1;
      }
    }

    return -1;
  }

  private findParameterListRangeWithScanner(
    content: string,
    signatureStartOffset: number
  ): { openParenIndex: number; closeParenIndex: number } | null {
    const openParenIndex = content.indexOf('(', signatureStartOffset);
    if (openParenIndex < 0) {
      return null;
    }

    const closeParenIndex = this.findMatchingParenInContent(content, openParenIndex);
    if (closeParenIndex < 0) {
      return null;
    }

    return { openParenIndex, closeParenIndex };
  }

  private positionToOffset(lines: readonly string[], line: number, column: number): number {
    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return offset + column - 1;
  }

  private offsetToPosition(content: string, offset: number): { line: number; column: number } {
    const beforeOffset = content.slice(0, offset);
    const line = beforeOffset.split('\n').length;
    const lastNewline = beforeOffset.lastIndexOf('\n');
    const column = lastNewline < 0 ? offset + 1 : offset - lastNewline;

    return { line, column };
  }

  private findMatchingParenInContent(content: string, openIndex: number): number {
    let depth = 1;
    let quote: '"' | '\'' | '`' | null = null;
    let inBlockComment = false;
    let inLineComment = false;
    let inRegexLiteral = false;
    let inRegexCharClass = false;

    for (let i = openIndex + 1; i < content.length; i++) {
      const char = content[i];
      const next = content[i + 1];

      if (inRegexLiteral) {
        if (char === '\\') {
          i++;
        } else if (char === '[') {
          inRegexCharClass = true;
        } else if (char === ']') {
          inRegexCharClass = false;
        } else if (char === '/' && !inRegexCharClass) {
          inRegexLiteral = false;
        }
        continue;
      }

      if (inLineComment) {
        if (char === '\n') {
          inLineComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (quote) {
        if (char === '\\') {
          i++;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (char === '/' && this.isRegexLiteralStart(content, i, openIndex)) {
        inRegexLiteral = true;
        inRegexCharClass = false;
        continue;
      }

      if (char === '"' || char === '\'' || char === '`') {
        quote = char;
        continue;
      }

      if (char === '(') { depth++; }
      else if (char === ')') {
        depth--;
        if (depth === 0) { return i; }
      }
    }

    return -1;
  }

  private isRegexLiteralStart(content: string, slashIndex: number, scanStartIndex: number): boolean {
    for (let i = slashIndex - 1; i > scanStartIndex; i--) {
      const char = content[i];
      if (/\s/.test(char)) {
        continue;
      }

      if (char === '>' && content[i - 1] === '=') {
        return true;
      }

      return '=(:,[!&|?{};'.includes(char);
    }

    return false;
  }

  /**
   * 生成參數字串
   */
  private generateParameterString(signature: FunctionSignature, filePath: string): string {
    const isTypeScript = FileUtils.isTypeScript(filePath);

    return signature.parameters.map(param => {
      let result = '';

      if (param.rest) {
        result += '...';
      }

      result += param.name;

      if (param.optional && param.defaultValue === undefined) {
        result += '?';
      }

      if (param.type && isTypeScript) {
        result += `: ${param.type}`;
      }

      if (param.defaultValue !== undefined) {
        result += ` = ${param.defaultValue}`;
      }

      return result;
    }).join(', ');
  }

  /**
   * 逐檔解析出「對目標符號的本地繫結」，回傳 file -> 繫結資訊 的 map。
   * 涵蓋：目標定義檔本身（本地名 = 目標名）、具名／別名／default import 的本地名、
   * namespace import 的 receiver，以及透過遞迴 barrel re-export（多層 `export { name } from`
   * 未 alias 改名，或 `export * from`）間接 import 到目標符號的檔案。
   *
   * 界線（記載於此）：import specifier 解析涵蓋相對路徑與 tsconfig paths 別名／baseUrl
   * （交由 PathUtils，與 move / move-member 同一把尺）；node_modules 套件不在判定範圍內；
   * re-export 轉發遞迴多層並以 visited set 防環，具名轉發需未 alias 改名（`export { f as g }`
   * 視為不同符號、不算轉發）。以「本地繫結名」精確定位呼叫點——不再靠 method-call 全域過濾，
   * 故 namespace import 的 `ns.fn(...)` 呼叫得以被納入（見 collectTopLevelFunctionCallSites）。
   */
  private async resolveTargetBindings(
    files: readonly string[],
    targetFilePath: string,
    name: string
  ): Promise<Map<string, TargetFileBindings>> {
    const targetAbsolute = path.resolve(targetFilePath);
    const bindings = new Map<string, TargetFileBindings>();
    const targetHasDefaultExport = await this.hasDefaultExportName(targetAbsolute, name);
    // per-run cache：同一次呼叫內，同一個中介檔（barrel）的 re-export 轉發只解析一次，
    // 避免多個 consumer 檔重複讀取/解析同一個中介檔
    const reexportCache = new Map<string, readonly ReexportForward[]>();

    const ensure = (file: string): TargetFileBindings => {
      let entry = bindings.get(file);
      if (!entry) {
        entry = { localNames: new Set<string>(), namespaceReceivers: new Set<string>() };
        bindings.set(file, entry);
      }
      return entry;
    };

    for (const file of files) {
      if (path.resolve(file) === targetAbsolute) {
        // 目標定義檔：以自身函式名做識別字呼叫（涵蓋同檔內的呼叫點）
        ensure(file).localNames.add(name);
        continue;
      }

      const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(file));
      if (!parser?.getImportDeclarations) {
        continue;
      }
      const content = await this.fileUtils.readFile(file);
      if (!content) {
        continue;
      }

      const declarations = parser.getImportDeclarations(content) ?? [];
      for (const declaration of declarations) {
        if (declaration.isTypeOnly) {
          continue; // type-only import 不會產生 runtime 呼叫點
        }

        // 具名 import：以「匯出名 === 目標名」判定是否指向目標，本地繫結名為 alias ?? name
        // （`import { combine as merge }` → 匯出名 combine、本地名 merge）
        for (const spec of declaration.namedImports) {
          if (spec.isTypeOnly) {
            continue;
          }
          if (spec.name !== name && spec.name !== 'default') {
            continue;
          }
          const requestedExportName = spec.name === 'default' ? 'default' : name;
          const moduleExposesTarget = await this.moduleExposesTargetFunction(
            file,
            declaration.moduleSpecifier,
            name,
            targetAbsolute,
            files,
            reexportCache,
            targetHasDefaultExport,
            requestedExportName
          );
          if (moduleExposesTarget) {
            ensure(file).localNames.add(spec.alias ?? spec.name);
          }
        }

        // default import 綁定的是模組 default export，本地名稱可以任意命名；
        // 目標可以直接來自定義檔，也可以經 `export { default } from` barrel 轉發。
        if (declaration.defaultImport !== undefined && await this.moduleExposesTargetFunction(
          file,
          declaration.moduleSpecifier,
          name,
          targetAbsolute,
          files,
          reexportCache,
          targetHasDefaultExport,
          'default'
        )) {
          ensure(file).localNames.add(declaration.defaultImport ?? name);
        }

        // namespace import：`import * as ns` → `ns.<name>(...)` 呼叫
        if (declaration.namespaceImport && await this.moduleExposesTargetFunction(
          file,
          declaration.moduleSpecifier,
          name,
          targetAbsolute,
          files,
          reexportCache,
          targetHasDefaultExport,
          name
        )) {
          ensure(file).namespaceReceivers.add(declaration.namespaceImport);
        }
      }
    }

    return bindings;
  }

  /**
   * 收集頂層函數／變數函數目標的呼叫點：逐檔以該檔實際繫結目標的本地名定位。
   * - localNames：以識別字呼叫（`combine(...)`、別名 `merge(...)`），取非 method、非 new 呼叫點。
   * - namespaceReceivers：`<receiver>.<functionName>(...)`，取 receiver 相符的 method 呼叫點。
   * 以 (檔案:行:列) 去重，避免同一呼叫點被多個本地名重複收集。
   */
  private async collectTopLevelFunctionCallSites(
    bindings: Map<string, TargetFileBindings>,
    functionName: string
  ): Promise<CallSite[]> {
    const collected: CallSite[] = [];
    const seen = new Set<string>();

    const add = (callSite: CallSite): void => {
      const { filePath, range } = callSite.location;
      const key = `${filePath}:${range.start.line}:${range.start.column}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      collected.push(callSite);
    };

    for (const [file, binding] of bindings) {
      for (const localName of binding.localNames) {
        const sites = await this.symbolFinder.findCallSitesInFile(file, localName);
        for (const site of sites) {
          if (!site.isMethodCall && site.isNewExpression !== true) {
            add(site);
          }
        }
      }

      if (binding.namespaceReceivers.size > 0) {
        const sites = await this.symbolFinder.findCallSitesInFile(file, functionName);
        for (const site of sites) {
          if (site.isMethodCall && site.isNewExpression !== true && site.receiver !== undefined
              && binding.namespaceReceivers.has(site.receiver)) {
            add(site);
          }
        }
      }
    }

    return collected;
  }

  /**
   * 判斷某個 import specifier 是否讓 consumer 取得「源自目標檔」的 name 匯出：
   * specifier 直接解析到目標檔，或透過（遞迴）barrel re-export 轉發 name 回目標檔。
   */
  private async moduleExposesTargetFunction(
    consumerFilePath: string,
    moduleSpecifier: string,
    name: string,
    targetAbsolute: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>,
    targetHasDefaultExport: boolean,
    requestedExportName: string
  ): Promise<boolean> {
    if (this.importSpecifierResolvesToTarget(consumerFilePath, moduleSpecifier, targetAbsolute)) {
      return requestedExportName !== 'default' || targetHasDefaultExport;
    }
    return this.resolvesToTargetViaReexport(
      consumerFilePath,
      moduleSpecifier,
      name,
      targetAbsolute,
      allFiles,
      reexportCache,
      targetHasDefaultExport,
      requestedExportName,
      new Set<string>()
    );
  }

  /**
   * 遞迴 re-export 判定：import specifier 解析到專案內某個「中介檔」（barrel）時，
   * 讀取其匯出宣告，若以 named（未 alias 改名）或 star 形式轉發 name，
   * 再確認該轉發的來源 specifier 直接解析回目標檔，或（遞迴）經更深一層 barrel 轉發回目標檔。
   * visited set 以中介檔絕對路徑去重，防止 re-export 成環時無限遞迴。
   */
  private async resolvesToTargetViaReexport(
    consumerFilePath: string,
    moduleSpecifier: string,
    name: string,
    targetAbsolute: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>,
    targetHasDefaultExport: boolean,
    requestedExportName: string,
    visited: Set<string>
  ): Promise<boolean> {
    const intermediateFile = allFiles.find(candidate =>
      this.importSpecifierResolvesToTarget(consumerFilePath, moduleSpecifier, path.resolve(candidate))
    );
    if (!intermediateFile) {
      return false;
    }

    const intermediateKey = path.resolve(intermediateFile);
    if (visited.has(intermediateKey)) {
      return false;
    }
    visited.add(intermediateKey);

    const forwards = await this.getReexportForwards(intermediateFile, reexportCache);
    for (const forward of forwards) {
      // `export *` 不轉發 default；其餘具名轉發必須對上實際 import 的匯出名。
      if (forward.exportedName === undefined && requestedExportName === 'default') {
        continue;
      }
      if (forward.exportedName !== undefined && forward.exportedName !== requestedExportName) {
        continue;
      }
      if (
        this.importSpecifierResolvesToTarget(intermediateFile, forward.moduleSpecifier, targetAbsolute)
        && (requestedExportName !== 'default' || targetHasDefaultExport)
      ) {
        return true;
      }
      if (await this.resolvesToTargetViaReexport(
        intermediateFile,
        forward.moduleSpecifier,
        name,
        targetAbsolute,
        allFiles,
        reexportCache,
        targetHasDefaultExport,
        requestedExportName,
        visited
      )) {
        return true;
      }
    }

    return false;
  }

  /**
   * 取得中介檔的 re-export 轉發清單（含 per-run cache，避免重複讀取/解析同一檔案）
   */
  private async getReexportForwards(
    filePath: string,
    cache: Map<string, readonly ReexportForward[]>
  ): Promise<readonly ReexportForward[]> {
    const cached = cache.get(filePath);
    if (cached) {
      return cached;
    }

    const forwards = await this.parseReexportForwards(filePath);
    cache.set(filePath, forwards);
    return forwards;
  }

  /**
   * 解析檔案中的 re-export 轉發宣告：`export { name } from '<spec>'`
   * （未 alias 改名）與 `export * from '<spec>'`。
   * 與呼叫點解析（call-site-parser.ts）相同的取捨：直接以 TS AST 解析語法結構，
   * 不依賴副檔名（TS parser 亦可解析 .js 檔案的語法）。
   */
  private async parseReexportForwards(filePath: string): Promise<ReexportForward[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const forwards: ReexportForward[] = [];
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
        continue;
      }

      const moduleSpecifier = statement.moduleSpecifier;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
        continue; // 非 re-export（純 local export，無 from 子句）
      }

      if (!statement.exportClause) {
        // `export * from '<spec>'`：轉發全部匯出
        forwards.push({ moduleSpecifier: moduleSpecifier.text });
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          // 只收未被 alias 改名者：`export { f as g }` 不算轉發同一符號
          if (!element.isTypeOnly && !element.propertyName) {
            forwards.push({ moduleSpecifier: moduleSpecifier.text, exportedName: element.name.text });
          }
        }
      }
      // `export * as ns from '<spec>'`（NamespaceExport）不在單層轉發判定範圍內：
      // 消費端須以 `ns.fn(...)` method call 呼叫，已被既有 method call 過濾排除
    }

    return forwards;
  }

  /**
   * 判斷目標檔是否以 default export 暴露指定名稱的函式／類別。
   * default import 的本地名稱與宣告名稱可以不同，因此不能用 import 名稱比對取代這項判定。
   */
  private async hasDefaultExportName(filePath: string, name: string): Promise<boolean> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return false;
    }

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && statement.name?.text === name
        && ts.canHaveModifiers(statement)
        && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        return true;
      }

      if (
        ts.isExportAssignment(statement)
        && !statement.isExportEquals
        && ts.isIdentifier(statement.expression)
        && statement.expression.text === name
      ) {
        return true;
      }

      if (
        ts.isExportDeclaration(statement)
        && !statement.moduleSpecifier
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
        && statement.exportClause.elements.some(element =>
          element.name.text === 'default' && element.propertyName?.text === name
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 判斷 import specifier 是否解析到目標檔。
   * 解析交由 PathUtils（相對路徑、tsconfig paths 別名、baseUrl），
   * pathsMatch 處理省略副檔名與 index 檔慣例；node_modules 套件 specifier
   * 的解析結果不會命中專案內目標檔、自然排除（界線見 resolveTargetBindings）。
   */
  private importSpecifierResolvesToTarget(
    importerFilePath: string,
    moduleSpecifier: string,
    targetAbsolute: string
  ): boolean {
    const resolved = this.pathUtils.resolveImportPath(moduleSpecifier, importerFilePath);
    return this.pathUtils.pathsMatch(resolved, targetAbsolute);
  }

  /**
   * 取得專案檔案
   */
  private async getProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];
    await this.collectFiles(projectRoot, files);
    return files;
  }

  /**
   * 遞迴收集檔案
   */
  private async collectFiles(dirPath: string, files: string[]): Promise<void> {
    const entries = await this.fileSystem.readDirectory(dirPath);

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳過 node_modules、build 輸出目錄和隱藏目錄
      const skipDirs = ['node_modules', 'dist', 'build', 'coverage', '.git'];
      if (skipDirs.includes(entry.name) || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory) {
        await this.collectFiles(fullPath, files);
      } else if (entry.isFile && this.isSupportedFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  /**
   * 檢查是否為支援的檔案類型
   */
  private isSupportedFile(filename: string): boolean {
    return FileUtils.isSupportedLanguage(filename);
  }

  /**
   * 建立錯誤結果
   */
  private createErrorResult(_code: ChangeSignatureErrorCode, message: string): ChangeSignatureResult {
    // 錯誤情況下必須提供佔位簽名資訊
    const emptyRange = { start: { line: 0, column: 0, offset: 0 }, end: { line: 0, column: 0, offset: 0 } };
    const emptyLocation = { filePath: '', range: emptyRange };
    const emptySignature: FunctionSignature = {
      name: '',
      parameters: [],
      location: emptyLocation,
      isMethod: false,
      modifiers: []
    };
    return {
      success: false,
      error: message,
      originalSignature: emptySignature,
      newSignature: emptySignature,
      definitionUpdate: { filePath: '', originalCode: '', newCode: '', location: emptyLocation },
      callSiteUpdates: [],
      executed: false,
      stats: {
        callSitesUpdated: 0,
        filesAffected: 0
      }
    };
  }
}

/**
 * 建立 ChangeSignatureEngine 實例
 */
export function createChangeSignatureEngine(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): ChangeSignatureEngine {
  return new ChangeSignatureEngine(parserRegistry, fileSystem);
}
