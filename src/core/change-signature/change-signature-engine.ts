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
import { ChangeSignatureErrorCode, isRemoveParameterChange, isRenameParameterChange } from './types.js';
import { resolveParameterIndex } from './utils.js';
import { SymbolFinder, FileUtils, createFileUtils } from '@core/foundations/index.js';

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
    parserRegistry: ParserRegistry,
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

    // 只查找獨立函式呼叫（非 method call）
    const allCallSites = await this.symbolFinder.findCallSites(options.functionName, projectFiles);
    const callSites = allCallSites.filter(cs => !cs.isMethodCall);

    // 5. 生成定義更新
    const definitionUpdate = await this.generateDefinitionUpdate(
      options.filePath,
      originalSignature,
      newSignature
    );

    // 6. 生成呼叫點更新
    const callSiteUpdates = await this.callSiteUpdater.generateCallSiteUpdates(
      callSites,
      originalSignature,
      newSignature,
      options.changes
    );

    // 7. 執行或預覽
    if (!options.preview) {
      await this.applyChanges(definitionUpdate, callSiteUpdates);
    }

    // 8. 計算影響的檔案
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
      executed: !options.preview,
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
    const originalLines = update.originalCode.split('\n');
    const startLine = update.location.range.start.line;
    const endLine = startLine + originalLines.length - 1;
    const lastLine = originalLines[originalLines.length - 1] ?? '';

    return {
      range: {
        start: { line: startLine, column: 1 },
        end: { line: endLine, column: lastLine.length + 1 }
      },
      newText: update.newCode,
      description: `Update call: ${update.originalCode.trim()} -> ${update.newCode.trim()}`
    };
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

    const visit = (node: ts.Node): void => {
      if (node !== body && this.isFunctionLikeDeclaration(node)) {
        return;
      }

      if (ts.isIdentifier(node)) {
        const newName = renameMap.get(node.text);
        if (newName && !this.shouldSkipParameterIdentifier(node)) {
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

          edits.push({
            range: {
              start: { line: start.line + 1, column: start.character + 1 },
              end: { line: end.line + 1, column: end.character + 1 }
            },
            newText: newName,
            description: `Rename parameter reference ${node.text} -> ${newName}`
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(body, visit);
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

    const visit = (node: ts.Node): void => {
      if (node !== body && this.isFunctionLikeDeclaration(node)) {
        return;
      }

      if (ts.isIdentifier(node) && names.has(node.text) && !this.shouldSkipParameterIdentifier(node)) {
        usedNames.add(node.text);
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(body, visit);
    return Array.from(usedNames);
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
   * 執行變更
   */
  private async applyChanges(
    definitionUpdate: { filePath: string; originalCode: string; newCode: string },
    callSiteUpdates: readonly CallSiteUpdate[]
  ): Promise<void> {
    // 按檔案分組
    const fileUpdates = new Map<string, Array<{ originalCode: string; newCode: string; line: number }>>();

    // 加入定義更新
    if (!fileUpdates.has(definitionUpdate.filePath)) {
      fileUpdates.set(definitionUpdate.filePath, []);
    }
    const defUpdates = fileUpdates.get(definitionUpdate.filePath);
    defUpdates?.push({
      originalCode: definitionUpdate.originalCode,
      newCode: definitionUpdate.newCode,
      line: 0 // 會在下面重新計算
    });

    // 加入呼叫點更新
    for (const update of callSiteUpdates) {
      if (!fileUpdates.has(update.filePath)) {
        fileUpdates.set(update.filePath, []);
      }
      const callUpdates = fileUpdates.get(update.filePath);
      callUpdates?.push({
        originalCode: update.originalCode,
        newCode: update.newCode,
        line: update.location.range.start.line
      });
    }

    // 套用到每個檔案
    for (const [filePath, updates] of fileUpdates) {
      let content = await this.fileUtils.readFile(filePath);
      if (!content) { continue; }

      // 從後往前替換，避免行號偏移
      const sortedUpdates = updates.sort((a, b) => b.line - a.line);

      for (const update of sortedUpdates) {
        content = content.replace(update.originalCode, update.newCode);
      }

      await this.fileSystem.writeFile(filePath, content);
    }
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
