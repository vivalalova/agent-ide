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

/**
 * 中介檔（barrel）的單層 re-export 轉發資訊
 */
interface ReexportForward {
  /** re-export 的來源模組路徑（`from '<spec>'`） */
  readonly moduleSpecifier: string;
  /** 具名轉發的原始符號名稱；undefined 表示 `export * from` 轉發全部匯出 */
  readonly exportedName?: string;
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

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
    this.signatureParser = new SignatureParser(parserRegistry, fileSystem);
    this.symbolFinder = new SymbolFinder(parserRegistry, fileSystem);
    this.validator = new SignatureValidator();
    this.transformer = new SignatureTransformer();
    this.callSiteUpdater = new CallSiteUpdater(fileSystem, parserRegistry);
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

    // 3. 計算新簽名
    const newSignature = this.transformer.applyChangesToSignature(originalSignature, options.changes);

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

      // 限縮呼叫點掃描範圍：僅「語意上可能引用目標函式」的檔案——目標定義檔本身，
      // 以及直接 import 該符號自目標檔的檔案。避免全專案掃同名而誤改跨檔的同名自由函式。
      const relevantFiles = await this.filterFilesReferencingTarget(
        projectFiles,
        options.filePath,
        options.functionName
      );

      // 只查找獨立函式呼叫（非 method call）
      const allCallSites = await this.symbolFinder.findCallSites(options.functionName, relevantFiles);
      callSites = allCallSites.filter(cs => !cs.isMethodCall);
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

    const usedNames = await this.findBodyParameterReferences(signature, new Set(removedNames));
    if (usedNames.length === 0) {
      return null;
    }

    return `無法移除參數 ${usedNames.join(', ')}：仍在函式 body 中使用`;
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

  private async findBodyParameterReferences(
    signature: FunctionSignature,
    names: ReadonlySet<string>
  ): Promise<string[]> {
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

    const usedNames = new Set<string>();

    this.forEachBodyIdentifierReference(body, names, (node) => {
      usedNames.add(node.text);
    });

    return Array.from(usedNames);
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
    const visit = (node: ts.Node, liveNames: ReadonlySet<string>): void => {
      if (liveNames.size === 0) {
        return;
      }

      // 進入巢狀函式時，移除被該函式遮蔽的名稱後再遞迴其子樹
      let childLiveNames = liveNames;
      if (this.isFunctionLikeDeclaration(node)) {
        const shadowed = this.collectFunctionScopeDeclaredNames(node as ts.FunctionLikeDeclaration);
        if (shadowed.size > 0) {
          childLiveNames = new Set([...liveNames].filter(name => !shadowed.has(name)));
        }
      }

      if (
        ts.isIdentifier(node)
        && liveNames.has(node.text)
        && !this.shouldSkipParameterIdentifier(node)
      ) {
        onReference(node);
      }

      ts.forEachChild(node, (child) => visit(child, childLiveNames));
    };

    ts.forEachChild(body, (child) => visit(child, names));
  }

  /**
   * 收集某函式作用域「自身」宣告的名稱（用於遮蔽判定）：
   * 參數名 + 該作用域內 const/let/var/function/class 宣告，不跨入更深層的巢狀函式作用域。
   */
  private collectFunctionScopeDeclaredNames(func: ts.FunctionLikeDeclaration): Set<string> {
    const declared = new Set<string>();

    for (const parameter of func.parameters) {
      this.collectBindingNames(parameter.name, declared);
    }

    const body = 'body' in func ? func.body : undefined;
    if (!body) {
      return declared;
    }

    const scan = (node: ts.Node): void => {
      // 巢狀函式宣告的名稱綁定在「當前」作用域，但其 body 屬於更深作用域，不再往下掃
      if (node !== body && this.isFunctionLikeDeclaration(node)) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          declared.add(node.name.text);
        }
        return;
      }

      if (ts.isVariableDeclaration(node)) {
        this.collectBindingNames(node.name, declared);
      }
      if (ts.isFunctionDeclaration(node) && node.name) {
        declared.add(node.name.text);
      }
      if (ts.isClassDeclaration(node) && node.name) {
        declared.add(node.name.text);
      }

      ts.forEachChild(node, scan);
    };

    ts.forEachChild(body, scan);
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
    const signatureStartOffset = originalSignature.location.range.start.offset
      ?? this.positionToOffset(lines, originalSignature.location.range.start.line, originalSignature.location.range.start.column);
    const parameterRange = this.findParameterListRangeWithAst(content, filePath, originalSignature)
      ?? this.findParameterListRangeWithScanner(content, signatureStartOffset);
    if (!parameterRange) {
      throw new Error(`找不到函式 ${originalSignature.name} 的參數結束括號`);
    }
    const { openParenIndex, closeParenIndex } = parameterRange;

    const originalCode = content.slice(signatureStartOffset, closeParenIndex + 1);
    const newCode = content.slice(signatureStartOffset, openParenIndex + 1) +
      newParamsString +
      ')';

    return {
      filePath,
      originalCode,
      newCode,
      location: {
        filePath,
        range: {
          start: this.offsetToPosition(content, signatureStartOffset),
          end: this.offsetToPosition(content, closeParenIndex + 1)
        }
      }
    };
  }

  private findParameterListRangeWithAst(
    content: string,
    filePath: string,
    signature: FunctionSignature
  ): { openParenIndex: number; closeParenIndex: number } | null {
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
    if (openParenIndex < 0 || closeParenIndex < 0) {
      return null;
    }

    return { openParenIndex, closeParenIndex };
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

      if (param.optional && !param.defaultValue) {
        result += '?';
      }

      if (param.type && isTypeScript) {
        result += `: ${param.type}`;
      }

      if (param.defaultValue) {
        result += ` = ${param.defaultValue}`;
      }

      return result;
    }).join(', ');
  }

  /**
   * 過濾出「語意上可能引用目標函式」的檔案：目標定義檔本身，
   * 直接（named / default）import 目標符號自目標檔的檔案，
   * 以及透過單層 barrel re-export（`export { name } from '<spec>'` 未 alias 改名，
   * 或 `export * from '<spec>'`）間接 import 到目標符號的檔案。
   *
   * 界線（記載於此）：僅解析相對路徑 import；alias / node_modules 不在判定範圍內；
   * re-export 轉發僅涵蓋單層（consumer -> 一層中介檔 -> 目標檔），不遞迴多層 barrel，
   * 且中介檔的 re-export 若對符號改名（`export { f as g }`）視為不同符號、不算轉發。
   * 此為「寧可漏掃、不可誤傷」的取捨——避免把跨檔同名的不同符號呼叫點誤改。
   * 命名空間 import（`import * as ns`）與 `export * as ns from` 的呼叫/轉發形如
   * `ns.fn(...)`，屬 method call 已在後續被過濾，故不需納入。
   */
  private async filterFilesReferencingTarget(
    files: readonly string[],
    targetFilePath: string,
    functionName: string
  ): Promise<string[]> {
    const targetAbsolute = path.resolve(targetFilePath);
    const result: string[] = [];
    // per-run cache：同一次呼叫內，同一個中介檔（barrel）的 re-export 轉發只解析一次，
    // 避免多個 consumer 檔重複讀取/解析同一個中介檔
    const reexportCache = new Map<string, readonly ReexportForward[]>();

    for (const file of files) {
      if (path.resolve(file) === targetAbsolute) {
        result.push(file);
        continue;
      }
      if (await this.fileImportsSymbolFromTarget(file, targetAbsolute, functionName, files, reexportCache)) {
        result.push(file);
      }
    }

    return result;
  }

  /**
   * 判斷檔案是否以本地名稱 functionName 直接或透過單層 barrel re-export
   * import 目標檔匯出的符號。呼叫點以「本地繫結名稱」呼叫，且 findCallSites
   * 只比對 functionName，故僅需確認本地繫結名稱等於 functionName。
   */
  private async fileImportsSymbolFromTarget(
    filePath: string,
    targetAbsolute: string,
    functionName: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>
  ): Promise<boolean> {
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser?.getImportDeclarations) {
      return false;
    }

    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return false;
    }

    const declarations = parser.getImportDeclarations(content) ?? [];
    for (const declaration of declarations) {
      if (declaration.isTypeOnly) {
        continue; // type-only import 不會產生 runtime 呼叫點
      }

      const bindsLocalName =
        declaration.defaultImport === functionName
        || declaration.namedImports.some(spec => (spec.alias ?? spec.name) === functionName);
      if (!bindsLocalName) {
        continue;
      }

      if (this.importSpecifierResolvesToTarget(filePath, declaration.moduleSpecifier, targetAbsolute)) {
        return true;
      }

      if (await this.resolvesToTargetViaSingleLevelReexport(
        filePath,
        declaration.moduleSpecifier,
        functionName,
        targetAbsolute,
        allFiles,
        reexportCache
      )) {
        return true;
      }
    }

    return false;
  }

  /**
   * 單層 re-export 判定：import specifier 若解析到專案內某個「中介檔」
   * （非目標檔本身），讀取該中介檔的匯出宣告，檢查是否以 named（未被 alias
   * 改名）或 star 形式將目標檔的 functionName 轉發出來。僅單層，不遞迴。
   *
   * 模組路徑解析沿用 importSpecifierResolvesToTarget：先找出 consumer 的
   * import specifier 解析到的中介檔，再確認中介檔的 re-export specifier
   * 是否解析回目標檔。
   */
  private async resolvesToTargetViaSingleLevelReexport(
    consumerFilePath: string,
    moduleSpecifier: string,
    functionName: string,
    targetAbsolute: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>
  ): Promise<boolean> {
    const intermediateFile = allFiles.find(candidate =>
      this.importSpecifierResolvesToTarget(consumerFilePath, moduleSpecifier, path.resolve(candidate))
    );
    if (!intermediateFile) {
      return false;
    }

    const forwards = await this.getReexportForwards(intermediateFile, reexportCache);
    return forwards.some(forward => {
      if (forward.exportedName !== undefined && forward.exportedName !== functionName) {
        return false;
      }
      return this.importSpecifierResolvesToTarget(intermediateFile, forward.moduleSpecifier, targetAbsolute);
    });
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
   * 判斷相對路徑 import specifier 是否解析到目標檔（含省略副檔名與 index 檔慣例）。
   * 非相對路徑（alias / node_modules）一律回傳 false（界線見 filterFilesReferencingTarget）。
   */
  private importSpecifierResolvesToTarget(
    importerFilePath: string,
    moduleSpecifier: string,
    targetAbsolute: string
  ): boolean {
    if (!moduleSpecifier.startsWith('.')) {
      return false;
    }

    const resolvedBase = path.resolve(path.dirname(importerFilePath), moduleSpecifier);
    const sourceExtensionPattern = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
    const targetWithoutExtension = targetAbsolute.replace(sourceExtensionPattern, '');

    // 直接命中（specifier 含或不含副檔名）
    if (resolvedBase === targetAbsolute || resolvedBase === targetWithoutExtension) {
      return true;
    }

    // index 檔慣例：`import './dir'` 對應 `./dir/index.<ext>`
    if (
      sourceExtensionPattern.test(targetAbsolute)
      && path.basename(targetWithoutExtension) === 'index'
      && resolvedBase === path.dirname(targetAbsolute)
    ) {
      return true;
    }

    return false;
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
