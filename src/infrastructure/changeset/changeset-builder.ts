/**
 * Changeset 建構器
 * 提供流式 API 建構變更集
 */

import {
  FileOperationType,
  ChangesetCommand,
  type Changeset,
  type FileTextChange,
  type FileOperation,
  type TextEdit
} from './types.js';

/**
 * Changeset 建構器 - 流式 API
 *
 * @example
 * ```typescript
 * const changeset = createChangesetBuilder()
 *   .forCommand('rename')
 *   .withDescription('Rename foo to bar')
 *   .addTextChange('/path/to/file.ts', [
 *     { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }, newText: 'bar' }
 *   ])
 *   .build();
 * ```
 */
export class ChangesetBuilder {
  /** 文字變更 Map（filePath → FileTextChange），加速查詢 */
  private textChangesMap = new Map<string, FileTextChange>();

  /** 檔案操作列表 */
  private fileOperations: FileOperation[] = [];

  /** 變更描述 */
  private description = '';

  /** 命令類型 */
  private command: ChangesetCommand = ChangesetCommand.Rename;

  /** 錯誤訊息列表 */
  private errors: string[] = [];

  /** 警告訊息列表 */
  private warnings: string[] = [];

  /**
   * 設定命令類型
   * @param command - 命令類型
   * @returns this - 支援鏈式調用
   */
  forCommand(command: ChangesetCommand): this {
    this.command = command;
    return this;
  }

  /**
   * 設定變更描述
   * @param description - 變更描述
   * @returns this - 支援鏈式調用
   */
  withDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * 新增檔案文字變更
   * 如果同檔案已存在變更，自動合併 edits
   *
   * @param filePath - 檔案路徑
   * @param edits - 文字編輯列表
   * @param operationType - 操作類型（可選）
   * @returns this - 支援鏈式調用
   */
  addTextChange(
    filePath: string,
    edits: TextEdit[],
    operationType?: FileTextChange['operationType']
  ): this {
    const existing = this.textChangesMap.get(filePath);

    if (existing) {
      // 合併到現有的變更，去除重複的 edits（根據 range 比對）
      const deduplicatedEdits = edits.filter(newEdit =>
        !existing.edits.some(existingEdit =>
          existingEdit.range.start.line === newEdit.range.start.line
          && existingEdit.range.start.column === newEdit.range.start.column
          && existingEdit.range.end.line === newEdit.range.end.line
          && existingEdit.range.end.column === newEdit.range.end.column
        )
      );

      this.textChangesMap.set(filePath, {
        ...existing,
        edits: [...existing.edits, ...deduplicatedEdits],
        operationType: operationType ?? existing.operationType
      });
    } else {
      // 新增變更
      this.textChangesMap.set(filePath, {
        filePath,
        edits,
        operationType
      });
    }

    return this;
  }

  /**
   * 新增檔案建立操作
   * @param filePath - 檔案路徑
   * @param content - 檔案內容
   * @returns this - 支援鏈式調用
   */
  addFileCreate(filePath: string, content: string): this {
    const existing = this.fileOperations.find(
      op => op.sourcePath === filePath
    );

    if (existing) {
      this.warnings.push(
        `重複的檔案操作: 已存在對 ${filePath} 的 ${existing.type} 操作`
      );
    }

    this.fileOperations.push({
      type: FileOperationType.Create,
      sourcePath: filePath,
      targetPath: filePath,
      content
    });
    return this;
  }

  /**
   * 新增檔案刪除操作
   * @param filePath - 檔案路徑
   * @returns this - 支援鏈式調用
   */
  addFileDelete(filePath: string): this {
    const existing = this.fileOperations.find(
      op => op.sourcePath === filePath
    );

    if (existing) {
      this.warnings.push(
        `重複的檔案操作: 已存在對 ${filePath} 的 ${existing.type} 操作`
      );
    }

    this.fileOperations.push({
      type: FileOperationType.Delete,
      sourcePath: filePath
    });
    return this;
  }

  /**
   * 新增檔案移動操作
   * @param sourcePath - 來源路徑
   * @param targetPath - 目標路徑
   * @returns this - 支援鏈式調用
   */
  addFileMove(sourcePath: string, targetPath: string): this {
    const existing = this.fileOperations.find(
      op => op.sourcePath === sourcePath
    );

    if (existing) {
      this.warnings.push(
        `重複的檔案操作: 已存在對 ${sourcePath} 的 ${existing.type} 操作`
      );
    }

    this.fileOperations.push({
      type: FileOperationType.Move,
      sourcePath,
      targetPath
    });
    return this;
  }

  /**
   * 新增錯誤訊息
   * @param error - 錯誤訊息
   * @returns this - 支援鏈式調用
   */
  addError(error: string): this {
    this.errors.push(error);
    return this;
  }

  /**
   * 新增警告訊息
   * @param warning - 警告訊息
   * @returns this - 支援鏈式調用
   */
  addWarning(warning: string): this {
    this.warnings.push(warning);
    return this;
  }

  /**
   * 建構 Changeset
   * @returns 完整的 Changeset 物件
   */
  build(): Changeset {
    return {
      textChanges: Array.from(this.textChangesMap.values()),
      fileOperations: this.fileOperations,
      description: this.description,
      command: this.command,
      success: this.errors.length === 0,
      errors: this.errors.length > 0 ? this.errors : undefined,
      warnings: this.warnings.length > 0 ? this.warnings : undefined
    };
  }
}

/**
 * 建立 ChangesetBuilder 實例
 * @returns 新的 ChangesetBuilder 實例
 *
 * @example
 * ```typescript
 * const changeset = createChangesetBuilder()
 *   .forCommand('move')
 *   .withDescription('Move file to new location')
 *   .addFileMove('/old/path.ts', '/new/path.ts')
 *   .build();
 * ```
 */
export function createChangesetBuilder(): ChangesetBuilder {
  return new ChangesetBuilder();
}
