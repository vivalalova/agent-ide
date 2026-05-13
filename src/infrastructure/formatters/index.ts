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

// ========== Query（唯讀類命令）==========
export {
  QueryCommand,
  type QueryResult,
  type QuerySummary,
  type SearchResult,
  type SearchMatch,
  type CyclesResult,
  type ImpactResult,
  type CycleInfo,
  type ImpactInfo,
  type FindReferencesResult,
  type ReferenceItem,
  type ReferenceType,
  type DefinitionLocation,
  type CallHierarchyResult,
  type CallHierarchyDirection,
  type IncomingCallItem,
  type OutgoingCallItem,
  type FunctionDefinitionInfo
} from './query-types.js';

export {
  QueryFormat,
  QueryFormatter,
  createQueryFormatter,
  type QueryFormatterOptions
} from './query-formatter.js';
