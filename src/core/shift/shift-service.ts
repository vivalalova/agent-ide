/**
 * Shift 服務 - 協調行移動操作
 */

import * as path from 'node:path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { LineExtractor } from '@core/shift/line-extractor.js';
import { FileGenerator } from '@core/shift/file-generator.js';
import type { ShiftOptions, ShiftResult, ShiftValidationError } from '@core/shift/types.js';
import { ShiftOperationType, createShiftResult, createShiftValidationError } from '@core/shift/types.js';

/**
 * Shift 服務類別
 */
export class ShiftService {
  private readonly lineExtractor: LineExtractor;
  private readonly fileGenerator: FileGenerator;
  private readonly fileSystem: IFileSystem;

  constructor(fileSystem: IFileSystem) {
    this.lineExtractor = new LineExtractor();
    this.fileGenerator = new FileGenerator(fileSystem);
    this.fileSystem = fileSystem;
  }

  /**
   * 執行行移動操作
   * @param options - 移動選項
   * @returns 移動結果
   */
  async shift(options: ShiftOptions): Promise<ShiftResult> {
    try {
      // 驗證選項
      const validationErrors = await this.validateOptions(options);
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
    const content = await this.readFile(sourceFile);

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
      await this.writeFile(sourceFile, insertionResult.content);
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
    const { sourceFile, targetFile, fromLine, toLine, position, preview } = options;

    if (!targetFile) {
      throw new Error('跨檔案移動需要指定目標檔案');
    }

    // 讀取來源檔案內容
    const sourceContent = await this.readFile(sourceFile);

    // 驗證來源檔案的行號範圍
    if (!this.lineExtractor.validateLineRange(sourceContent, fromLine, toLine)) {
      throw new Error(`來源檔案無效的行號範圍：${fromLine}-${toLine}`);
    }

    // 提取要移動的行
    const extractionResult = this.lineExtractor.extractLines(sourceContent, fromLine, toLine);

    // 處理目標檔案
    const targetFileExists = await this.fileExists(targetFile);
    let finalTargetPath = targetFile;
    let operationType = ShiftOperationType.BETWEEN_FILES;

    if (!targetFileExists) {
      // 目標檔案不存在，生成唯一檔名
      const sourceExt = path.extname(sourceFile);
      const targetDir = path.dirname(targetFile);
      const targetBasePath = path.join(targetDir, path.parse(targetFile).name);

      const generationResult = await this.fileGenerator.generateUniqueFilename(
        targetBasePath,
        sourceExt
      );

      finalTargetPath = generationResult.filePath;
      operationType = ShiftOperationType.TO_NEW_FILE;
    }

    // 讀取或初始化目標檔案內容
    const targetContent = targetFileExists ? await this.readFile(finalTargetPath) : '';

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

    // 預覽模式或實際寫入
    if (!preview) {
      await this.writeFile(sourceFile, extractionResult.remainingContent);
      await this.writeFile(finalTargetPath, insertionResult.content);
    }

    const message = preview
      ? `預覽：從 ${path.basename(sourceFile)} 移動到 ${path.basename(finalTargetPath)}`
      : `成功從 ${path.basename(sourceFile)} 移動到 ${path.basename(finalTargetPath)}`;

    return createShiftResult(
      true,
      operationType,
      { ...options, targetFile: finalTargetPath },
      message,
      {
        movedLines: extractionResult.extractedLines,
        sourceContent: extractionResult.remainingContent,
        targetContent: insertionResult.content
      }
    );
  }

  /**
   * 驗證選項
   * @param options - 移動選項
   * @returns 驗證錯誤列表
   */
  private async validateOptions(options: ShiftOptions): Promise<ShiftValidationError[]> {
    const errors: ShiftValidationError[] = [];

    // 檢查來源檔案是否存在
    if (!(await this.fileExists(options.sourceFile))) {
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
  private async readFile(filePath: string): Promise<string> {
    try {
      return await this.fileSystem.readFile(filePath, 'utf-8') as string;
    } catch (error) {
      throw new Error(`無法讀取檔案 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 寫入檔案內容
   * @param filePath - 檔案路徑
   * @param content - 檔案內容
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const directory = path.dirname(filePath);
      await this.fileGenerator.ensureDirectoryExists(directory);
      await this.fileSystem.writeFile(filePath, content);
    } catch (error) {
      throw new Error(`無法寫入檔案 ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 檢查檔案是否存在
   * @param filePath - 檔案路徑
   * @returns 是否存在
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      return await this.fileSystem.exists(filePath);
    } catch {
      return false;
    }
  }
}
