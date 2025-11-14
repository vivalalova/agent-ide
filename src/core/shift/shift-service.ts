/**
 * Shift 服務 - 協調行移動操作
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LineExtractor } from './line-extractor.js';
import { FileGenerator } from './file-generator.js';
import type { ShiftOptions, ShiftResult, ShiftValidationError } from './types.js';
import { ShiftOperationType, createShiftResult, createShiftValidationError } from './types.js';

/**
 * Shift 服務類別
 */
export class ShiftService {
  private readonly lineExtractor: LineExtractor;
  private readonly fileGenerator: FileGenerator;

  constructor() {
    this.lineExtractor = new LineExtractor();
    this.fileGenerator = new FileGenerator();
  }

  /**
   * 執行行移動操作
   * @param options - 移動選項
   * @returns 移動結果
   */
  async shift(options: ShiftOptions): Promise<ShiftResult> {
    try {
      // 驗證選項
      const validationErrors = this.validateOptions(options);
      if (validationErrors.length > 0) {
        const errorMessages = validationErrors.map(e => e.message).join('; ');
        return createShiftResult(
          false,
          ShiftOperationType.WITHIN_FILE,
          options,
          '驗證失敗',
          { error: errorMessages }
        );
      }

      // 決定操作類型並執行
      const isSameFile = !options.targetFile || options.targetFile === options.sourceFile;

      if (isSameFile) {
        return this.shiftWithinFile(options);
      }

      return this.shiftBetweenFiles(options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return createShiftResult(
        false,
        ShiftOperationType.WITHIN_FILE,
        options,
        '執行失敗',
        { error: errorMessage }
      );
    }
  }

  /**
   * 單檔案內行移動
   * @param options - 移動選項
   * @returns 移動結果
   */
  private async shiftWithinFile(options: ShiftOptions): Promise<ShiftResult> {
    const { sourceFile, fromLine, toLine, position, preview } = options;

    // 讀取檔案內容
    const content = this.readFile(sourceFile);

    // 驗證行號和位置
    if (!this.lineExtractor.validateLineRange(content, fromLine, toLine)) {
      throw new Error(`無效的行號範圍：${fromLine}-${toLine}`);
    }

    if (!this.lineExtractor.validatePosition(content, position)) {
      throw new Error(`無效的插入位置：${position}`);
    }

    // 檢查是否需要移動（位置在移動範圍內）
    if (position > fromLine && position <= toLine + 1) {
      return createShiftResult(
        true,
        ShiftOperationType.WITHIN_FILE,
        options,
        '目標位置在移動範圍內，無需移動'
      );
    }

    // 提取要移動的行
    const extractionResult = this.lineExtractor.extractLines(content, fromLine, toLine);

    // 調整插入位置（如果插入位置在移動範圍之後）
    const adjustedPosition = position > toLine ? position - extractionResult.linesCount : position;

    // 在新位置插入行
    const insertionResult = this.lineExtractor.insertLines(
      extractionResult.remainingContent,
      extractionResult.extractedLines,
      adjustedPosition
    );

    // 預覽模式或實際寫入
    if (!preview) {
      this.writeFile(sourceFile, insertionResult.content);
    }

    return createShiftResult(
      true,
      ShiftOperationType.WITHIN_FILE,
      options,
      preview ? '預覽：單檔案內行移動' : '成功移動行',
      {
        movedLines: extractionResult.extractedLines,
        sourceContent: insertionResult.content
      }
    );
  }

  /**
   * 跨檔案行移動
   * @param options - 移動選項
   * @returns 移動結果
   */
  private async shiftBetweenFiles(options: ShiftOptions): Promise<ShiftResult> {
    const { sourceFile, targetFile, fromLine, toLine, position, preview, updateReferences = true } = options;

    if (!targetFile) {
      throw new Error('跨檔案移動需要指定目標檔案');
    }

    // 檢查目標文件名是否包含副檔名
    const targetExt = path.extname(targetFile);
    if (!targetExt) {
      throw new Error('目標檔案必須包含副檔名（例如：.ts, .js, .swift）');
    }

    // 讀取來源檔案內容
    const sourceContent = this.readFile(sourceFile);

    // 驗證來源檔案的行號範圍
    if (!this.lineExtractor.validateLineRange(sourceContent, fromLine, toLine)) {
      throw new Error(`來源檔案無效的行號範圍：${fromLine}-${toLine}`);
    }

    // 提取要移動的行
    const extractionResult = this.lineExtractor.extractLines(sourceContent, fromLine, toLine);

    // 處理目標檔案
    const targetFileExists = this.fileExists(targetFile);
    const operationType = targetFileExists ? ShiftOperationType.BETWEEN_FILES : ShiftOperationType.TO_NEW_FILE;

    // 讀取或初始化目標檔案內容
    const targetContent = targetFileExists ? this.readFile(targetFile) : '';

    // 驗證目標檔案的插入位置
    if (!this.lineExtractor.validatePosition(targetContent, position)) {
      throw new Error(`目標檔案無效的插入位置：${position}`);
    }

    // 在目標檔案插入行
    const insertionResult = this.lineExtractor.insertLines(
      targetContent,
      extractionResult.extractedLines,
      position
    );

    // 更新引用
    let updatedSourceContent = extractionResult.remainingContent;
    let referencesUpdated = false;
    const updatedReferences: string[] = [];

    if (updateReferences && !preview) {
      const referenceUpdate = this.updateSourceReferences(
        sourceFile,
        targetFile,
        extractionResult.remainingContent
      );
      updatedSourceContent = referenceUpdate.content;
      referencesUpdated = referenceUpdate.updated;
      if (referenceUpdate.importStatement) {
        updatedReferences.push(referenceUpdate.importStatement);
      }
    }

    // 預覽模式或實際寫入
    if (!preview) {
      this.writeFile(sourceFile, updatedSourceContent);
      this.writeFile(targetFile, insertionResult.content);
    }

    const message = preview
      ? `預覽：從 ${path.basename(sourceFile)} 移動到 ${path.basename(targetFile)}`
      : `成功從 ${path.basename(sourceFile)} 移動到 ${path.basename(targetFile)}`;

    return createShiftResult(
      true,
      operationType,
      { ...options, targetFile },
      message,
      {
        movedLines: extractionResult.extractedLines,
        sourceContent: updatedSourceContent,
        targetContent: insertionResult.content,
        referencesUpdated,
        updatedReferences
      }
    );
  }

  /**
   * 更新來源檔案的引用
   * @param sourceFile - 來源檔案路徑
   * @param targetFile - 目標檔案路徑
   * @param sourceContent - 來源檔案內容
   * @returns 更新結果
   */
  private updateSourceReferences(
    sourceFile: string,
    targetFile: string,
    sourceContent: string
  ): { content: string; updated: boolean; importStatement?: string } {
    // 計算相對路徑
    const sourceDir = path.dirname(sourceFile);
    let relativePath = path.relative(sourceDir, targetFile);

    // 移除副檔名
    const ext = path.extname(relativePath);
    if (ext) {
      relativePath = relativePath.slice(0, -ext.length);
    }

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    relativePath = relativePath.replace(/\\/g, '/');

    // 根據檔案類型生成 import 語句
    const sourceExt = path.extname(sourceFile);
    let importStatement = '';

    if (sourceExt === '.ts' || sourceExt === '.tsx' || sourceExt === '.js' || sourceExt === '.jsx') {
      // TypeScript/JavaScript: 添加到檔案頂部（在現有 import 之後）
      importStatement = `// TODO: import from '${relativePath}';`;

      const lines = sourceContent.split('\n');
      let insertIndex = 0;

      // 找到最後一個 import 語句的位置
      let inMultilineComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 處理多行註解狀態
        if (inMultilineComment) {
          if (line.includes('*/')) {
            inMultilineComment = false;
          }
          continue;
        }

        // 檢查多行註解開始
        if (line.startsWith('/*')) {
          if (!line.includes('*/')) {
            inMultilineComment = true;
          }
          continue;
        }

        // 跳過單行註解和空行
        if (!line || line.startsWith('//')) {
          continue;
        }

        // 檢查是否為 import 或 export from 語句
        if (line.startsWith('import ') || (line.startsWith('export ') && line.includes('from'))) {
          insertIndex = i + 1;
        } else if (insertIndex > 0) {
          // 遇到第一個非 import/export 的實際代碼，停止
          break;
        }
      }

      // 插入 import 語句
      lines.splice(insertIndex, 0, importStatement);
      return {
        content: lines.join('\n'),
        updated: true,
        importStatement
      };
    } else if (sourceExt === '.swift') {
      // Swift: 添加註解提示（Swift 使用模組系統，不是基於檔案的 import）
      importStatement = `// TODO: 確認是否需要 import 對應的模組`;

      const lines = sourceContent.split('\n');
      let insertIndex = 0;

      // 找到最後一個 import 語句的位置
      let inMultilineComment = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 處理多行註解狀態
        if (inMultilineComment) {
          if (line.includes('*/')) {
            inMultilineComment = false;
          }
          continue;
        }

        // 檢查多行註解開始
        if (line.startsWith('/*')) {
          if (!line.includes('*/')) {
            inMultilineComment = true;
          }
          continue;
        }

        // 跳過單行註解和空行
        if (!line || line.startsWith('//')) {
          continue;
        }

        // 檢查是否為 import 語句
        if (line.startsWith('import ')) {
          insertIndex = i + 1;
        } else if (insertIndex > 0) {
          break;
        }
      }

      lines.splice(insertIndex, 0, importStatement);
      return {
        content: lines.join('\n'),
        updated: true,
        importStatement
      };
    }

    // 不支援的檔案類型，不更新
    return {
      content: sourceContent,
      updated: false
    };
  }

  /**
   * 驗證選項
   * @param options - 移動選項
   * @returns 驗證錯誤列表
   */
  private validateOptions(options: ShiftOptions): ShiftValidationError[] {
    const errors: ShiftValidationError[] = [];

    // 檢查來源檔案是否存在
    if (!this.fileExists(options.sourceFile)) {
      errors.push(
        createShiftValidationError(
          'source_not_found',
          `來源檔案不存在：${options.sourceFile}`,
          options.sourceFile
        )
      );
    }

    // 檢查行號範圍
    if (options.fromLine < 1) {
      errors.push(
        createShiftValidationError(
          'invalid_line_range',
          `起始行號必須 >= 1，實際值：${options.fromLine}`,
          options.sourceFile,
          options.fromLine
        )
      );
    }

    if (options.toLine < options.fromLine) {
      errors.push(
        createShiftValidationError(
          'invalid_line_range',
          `結束行號 (${options.toLine}) 不可小於起始行號 (${options.fromLine})`,
          options.sourceFile,
          options.toLine
        )
      );
    }

    // 檢查插入位置
    if (options.position < 1) {
      errors.push(
        createShiftValidationError(
          'invalid_position',
          `插入位置必須 >= 1，實際值：${options.position}`,
          options.targetFile || options.sourceFile,
          options.position
        )
      );
    }

    return errors;
  }

  /**
   * 讀取檔案內容
   * @param filePath - 檔案路徑
   * @returns 檔案內容
   */
  private readFile(filePath: string): string {
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`無法讀取檔案 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 寫入檔案內容
   * @param filePath - 檔案路徑
   * @param content - 檔案內容
   */
  private writeFile(filePath: string, content: string): void {
    try {
      const directory = path.dirname(filePath);
      this.fileGenerator.ensureDirectoryExists(directory);
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      throw new Error(`無法寫入檔案 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 檢查檔案是否存在
   * @param filePath - 檔案路徑
   * @returns 是否存在
   */
  private fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }
}
