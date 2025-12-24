/**
 * Change Signature Service
 * 參數重構核心服務
 */

import * as path from 'path';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { Changeset } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder, ChangesetCommand, TextEditOperationType } from '@infrastructure/changeset/index.js';
import { SignatureParser } from './signature-parser.js';
import { SignatureValidator } from './signature-validator.js';
import { SignatureTransformer } from './signature-transformer.js';
import { CallSiteUpdater } from './call-site-updater.js';
import type {
  ChangeSignatureOptions,
  ChangeSignatureResult,
  FunctionSignature,
  CallSiteUpdate
} from './types.js';
import { ChangeSignatureErrorCode } from './types.js';
import { SymbolFinder, FileUtils, createFileUtils } from '@core/foundations/index.js';

/**
 * Change Signature Service
 */
export class ChangeSignatureService {
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

    // 3. 計算新簽名
    const newSignature = this.transformer.applyChangesToSignature(originalSignature, options.changes);

    // 4. 取得所有呼叫點
    const projectFiles = options.targetFiles ?? await this.getProjectFiles(options.projectRoot);
    const callSites = await this.symbolFinder.findCallSites(options.functionName, projectFiles);

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

    // originalCode 和 newCode 都是完整的一行內容
    // 因此 range 應該從行首（column 1）開始，到行尾結束
    const lineNumber = location.range.start.line;
    const originalLineLength = originalCode.length;

    builder.addTextChange(filePath, [{
      range: {
        start: { line: lineNumber, column: 1 },
        end: { line: lineNumber, column: originalLineLength + 1 }
      },
      newText: newCode,
      description: `Update definition: ${originalCode.trim()} -> ${newCode.trim()}`
    }], TextEditOperationType.Modify);

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
      // 跳過與 definitionUpdate 同一檔案（避免重複）
      // 已經在上面處理過了，呼叫點和定義可能在同一行
      const edits = updates.map(update => {
        // originalCode 和 newCode 都是完整的一行內容
        // 因此 range 應該從行首（column 1）開始，到行尾結束
        const lineStart = update.location.range.start.line;
        const callOriginalLength = update.originalCode.length;
        return {
          range: {
            start: { line: lineStart, column: 1 },
            end: { line: lineStart, column: callOriginalLength + 1 }
          },
          newText: update.newCode,
          description: `Update call: ${update.originalCode.trim()} -> ${update.newCode.trim()}`
        };
      });

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
    const startLine = originalSignature.location.range.start.line - 1;
    const originalLine = lines[startLine];

    // 生成新的參數列表
    const newParamsString = this.generateParameterString(newSignature, filePath);

    // 替換參數部分
    const funcNameIndex = originalLine.indexOf(originalSignature.name);
    const openParenIndex = originalLine.indexOf('(', funcNameIndex);
    const closeParenIndex = this.findMatchingParen(originalLine, openParenIndex);

    const newLine = originalLine.substring(0, openParenIndex + 1) +
      newParamsString +
      originalLine.substring(closeParenIndex);

    return {
      filePath,
      originalCode: originalLine,
      newCode: newLine,
      location: originalSignature.location
    };
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
    fileUpdates.get(definitionUpdate.filePath)!.push({
      originalCode: definitionUpdate.originalCode,
      newCode: definitionUpdate.newCode,
      line: 0 // 會在下面重新計算
    });

    // 加入呼叫點更新
    for (const update of callSiteUpdates) {
      if (!fileUpdates.has(update.filePath)) {
        fileUpdates.set(update.filePath, []);
      }
      fileUpdates.get(update.filePath)!.push({
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
   * 找到匹配的括號
   */
  private findMatchingParen(line: string, openIndex: number): number {
    let depth = 1;
    for (let i = openIndex + 1; i < line.length; i++) {
      if (line[i] === '(') { depth++; }
      else if (line[i] === ')') {
        depth--;
        if (depth === 0) { return i; }
      }
    }
    return line.length;
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
  private createErrorResult(code: ChangeSignatureErrorCode, message: string): ChangeSignatureResult {
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
 * 建立 ChangeSignatureService 實例
 */
export function createChangeSignatureService(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): ChangeSignatureService {
  return new ChangeSignatureService(parserRegistry, fileSystem);
}
