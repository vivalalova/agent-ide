/**
 * Formatters 模組導出
 * 提供統一的 dry-run 預覽格式化功能
 */

export {
  PreviewCommand,
  PreviewFormat,
  ChangeLineType,
  type ChangeLine,
  type DiffHunk,
  type FileChange,
  type PreviewSummary,
  type ConflictInfo,
  type PreviewResult,
  type PreviewFormatterOptions,
  type PreviewInput,
  type FileChangeInput,
  type LineChange
} from './types.js';

export { generatePreviewResult } from './diff-generator.js';

export { PreviewFormatter, createPreviewFormatter } from './preview-formatter.js';

export {
  convertRenamePreview,
  convertMovePreview,
  convertShiftPreview,
  convertRefactorPreview
} from './preview-converter.js';
