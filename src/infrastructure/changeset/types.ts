/**
 * Changeset 型別定義
 * 統一的變更集型別，用於描述程式碼變更操作
 */

import type { Range } from '@shared/types/core.js';

/**
 * 文字編輯操作類型
 */
export enum TextEditOperationType {
  Rename = 'rename',
  Move = 'move',
  Delete = 'delete',
  Insert = 'insert',
  Modify = 'modify'
}

/**
 * 檔案操作類型
 */
export enum FileOperationType {
  Create = 'create',
  Delete = 'delete',
  Move = 'move'
}

/**
 * Changeset 命令類型
 */
export enum ChangesetCommand {
  Rename = 'rename',
  Move = 'move',
  Deadcode = 'deadcode',
  ChangeSignature = 'change-signature',
  MoveMember = 'move-member'
}

/**
 * 備份項目類型
 */
export enum BackupType {
  Text = 'text',
  Create = 'create',
  Delete = 'delete',
  Move = 'move'
}

/**
 * 文字替換操作 - 統一的變更基本單位
 */
export interface TextEdit {
  /**
   * 要替換的範圍
   * 使用 1-based 索引（行號和列號都從 1 開始）
   * 與 TypeScript AST 的 0-based 索引不同，轉換時需要 +1
   */
  readonly range: Range;
  /** 新的文字內容 */
  readonly newText: string;
  /** 變更描述（可選） */
  readonly description?: string;
}

/**
 * 單一檔案的變更集合
 */
export interface FileTextChange {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 文字編輯操作列表 */
  readonly edits: readonly TextEdit[];
  /** 操作類型（可選） */
  readonly operationType?: TextEditOperationType;
  /** 額外的元資料（可選） */
  readonly metadata?: Record<string, unknown>;
}

/**
 * 檔案系統操作
 */
export interface FileOperation {
  /** 操作類型 */
  readonly type: FileOperationType;
  /** 來源路徑 */
  readonly sourcePath: string;
  /** 目標路徑（move 和 create 時使用） */
  readonly targetPath?: string;
  /** 檔案內容（create 時使用） */
  readonly content?: string;
}

/**
 * 完整變更集
 */
export interface Changeset {
  /** 文字變更列表 */
  readonly textChanges: readonly FileTextChange[];
  /** 檔案操作列表 */
  readonly fileOperations: readonly FileOperation[];
  /** 變更描述 */
  readonly description: string;
  /** 執行的命令 */
  readonly command: ChangesetCommand;
  /** 是否成功 */
  readonly success: boolean;
  /** 錯誤訊息列表（可選） */
  readonly errors?: readonly string[];
  /** 警告訊息列表（可選） */
  readonly warnings?: readonly string[];
}

/**
 * 變更應用結果
 */
export interface ApplyResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 已修改的檔案列表 */
  readonly modifiedFiles: readonly string[];
  /** 已建立的檔案列表 */
  readonly createdFiles: readonly string[];
  /** 已刪除的檔案列表 */
  readonly deletedFiles: readonly string[];
  /** 已移動的檔案列表 */
  readonly movedFiles: ReadonlyArray<{ from: string; to: string }>;
  /** 錯誤訊息列表（可選） */
  readonly errors?: readonly string[];
  /** 備份項目列表（用於 undo 功能，非 dry-run 時提供） */
  readonly backups?: readonly BackupEntry[];
}

/**
 * 應用選項
 */
export interface ApplyOptions {
  /** 是否為預覽模式（不實際執行） */
  readonly dryRun?: boolean;
  /** 是否使用原子操作 */
  readonly atomic?: boolean;
  /** 發生錯誤時是否回滾 */
  readonly rollbackOnError?: boolean;
}

/**
 * 備份項目（內部使用）
 */
export interface BackupEntry {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 原始內容（null 表示檔案原本不存在） */
  readonly originalContent: string | null;
  /** 備份類型 */
  readonly type: BackupType;
  /** 目標路徑（move 時使用） */
  readonly targetPath?: string;
}
