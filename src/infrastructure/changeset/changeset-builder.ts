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

  /** 已處理的檔案路徑，用於 O(1) 查詢重複操作 */
  private processedPaths = new Set<string>();

  /** 變更描述 */
  private description = '';

  /** 命令類型 */
  private command: ChangesetCommand = ChangesetCommand.Rename;

  /** 錯誤訊息列表 */
  private errors: string[] = [];

  /** 警告訊息列表 */
  private warnings: string[] = [];

  /** 命令特定的結構化統計資料 */
  private metadata: Record<string, unknown> | undefined;

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
      // 合併到現有的變更：以 range 為鍵去重，但必須連同 newText 一起判斷——
      // 同 range 同 newText 屬冪等重複，靜默去重為一筆；同 range 不同 newText 是真正的
      // 衝突變更，若靜默丟棄其一會造成變更遺失（C18），故直接拋錯 fast-fail，由呼叫端
      // 走既有錯誤路徑處理。O(n) 以 Map 查詢，同時涵蓋 incoming edits 彼此間的衝突。
      const newTextByRange = new Map<string, string>();
      for (const edit of existing.edits) {
        newTextByRange.set(this.rangeKey(edit.range), edit.newText);
      }

      const mergedEdits: TextEdit[] = [];
      for (const newEdit of edits) {
        const rangeKey = this.rangeKey(newEdit.range);
        const previousNewText = newTextByRange.get(rangeKey);
        if (previousNewText !== undefined) {
          if (previousNewText === newEdit.newText) {
            continue;
          }
          throw new Error(
            `衝突的 TextEdit：${filePath} 範圍 ${rangeKey} 已存在不同內容的變更`
            + `（既有 "${previousNewText}" vs 新增 "${newEdit.newText}"）`
          );
        }
        newTextByRange.set(rangeKey, newEdit.newText);
        mergedEdits.push(newEdit);
      }

      this.textChangesMap.set(filePath, {
        ...existing,
        edits: [...existing.edits, ...mergedEdits],
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
   * 產生 TextEdit range 的去重鍵（行列座標）
   */
  private rangeKey(range: TextEdit['range']): string {
    return `${range.start.line}:${range.start.column}-${range.end.line}:${range.end.column}`;
  }

  /**
   * 新增檔案建立操作
   * @param filePath - 檔案路徑
   * @param content - 檔案內容
   * @returns this - 支援鏈式調用
   */
  addFileCreate(filePath: string, content: string): this {
    if (this.processedPaths.has(filePath)) {
      const existing = this.fileOperations.find(
        op => op.sourcePath === filePath
      );
      if (existing) {
        this.warnings.push(
          `重複的檔案操作: 已存在對 ${filePath} 的 ${existing.type} 操作`
        );
      }
    }

    this.fileOperations.push({
      type: FileOperationType.Create,
      sourcePath: filePath,
      targetPath: filePath,
      content
    });
    this.processedPaths.add(filePath);
    return this;
  }

  /**
   * 新增檔案刪除操作
   * @param filePath - 檔案路徑
   * @returns this - 支援鏈式調用
   */
  addFileDelete(filePath: string): this {
    if (this.processedPaths.has(filePath)) {
      const existing = this.fileOperations.find(
        op => op.sourcePath === filePath
      );
      if (existing) {
        this.warnings.push(
          `重複的檔案操作: 已存在對 ${filePath} 的 ${existing.type} 操作`
        );
      }
    }

    this.fileOperations.push({
      type: FileOperationType.Delete,
      sourcePath: filePath
    });
    this.processedPaths.add(filePath);
    return this;
  }

  /**
   * 新增檔案移動操作
   * @param sourcePath - 來源路徑
   * @param targetPath - 目標路徑
   * @returns this - 支援鏈式調用
   */
  addFileMove(sourcePath: string, targetPath: string): this {
    if (this.processedPaths.has(sourcePath)) {
      const existing = this.fileOperations.find(
        op => op.sourcePath === sourcePath
      );
      if (existing) {
        this.warnings.push(
          `重複的檔案操作: 已存在對 ${sourcePath} 的 ${existing.type} 操作`
        );
      }
    }

    this.fileOperations.push({
      type: FileOperationType.Move,
      sourcePath,
      targetPath
    });
    this.processedPaths.add(sourcePath);
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
   * 設定命令特定的結構化統計資料
   * 供 CLI 層讀取權威計數（如刪除數、清理數），避免對 description/edits 字串反推
   * @param metadata - 結構化統計資料
   * @returns this - 支援鏈式調用
   */
  withMetadata(metadata: Record<string, unknown>): this {
    this.metadata = metadata;
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
      warnings: this.warnings.length > 0 ? this.warnings : undefined,
      metadata: this.metadata
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
