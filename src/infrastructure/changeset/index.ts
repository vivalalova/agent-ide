/**
 * Changeset 模組導出
 * 提供統一的變更集管理和應用功能
 */

// 型別定義
export type {
  TextEdit,
  FileTextChange,
  FileOperation,
  Changeset,
  ApplyResult,
  ApplyOptions,
  BackupEntry
} from './types.js';

// Enum 定義
export {
  TextEditOperationType,
  FileOperationType,
  ChangesetCommand,
  BackupType
} from './types.js';

// 轉換器
export { convertChangesetToPreviewInput } from './changeset-converter.js';

// 建構器
export { ChangesetBuilder, createChangesetBuilder } from './changeset-builder.js';

// 應用器
export { ChangeApplicator } from './change-applicator.js';
