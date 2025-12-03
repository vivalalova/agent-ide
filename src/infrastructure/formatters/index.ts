/**
 * Formatters 模組導出
 * 提供統一的 CLI 輸出格式化功能
 */

// ========== Preview（變更類命令）==========
export {
  PreviewCommand,
  PreviewFormat,
  ChangeLineType,
  type ChangeLine,
  type DiffHunk,
  type FileChange,
  type FileChangeSummary,
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
  convertRefactorPreview,
  type RenamePreviewOptions,
  type RefactorPreviewOptions
} from './preview-converter.js';

// ========== Query（唯讀類命令）==========
export {
  QueryCommand,
  IssueSeverity,
  AnalyzeType,
  type QueryResult,
  type QuerySummary,
  type QueryIssue,
  type SearchResult,
  type SearchMatch,
  type DepsResult,
  type CycleInfo,
  type ImpactInfo,
  type AnalyzeResult
} from './query-types.js';

export {
  QueryFormat,
  QueryFormatter,
  createQueryFormatter,
  type QueryFormatterOptions
} from './query-formatter.js';
