/**
 * Parser 共用模組
 * 提供 TypeScript 和 JavaScript Parser 共享的常數和輔助函數
 */

// 常數
export {
  LINE_TOLERANCE,
  COMMON_EXCLUDE_PATTERNS,
  TYPESCRIPT_EXCLUDE_PATTERNS,
  JAVASCRIPT_EXCLUDE_PATTERNS,
  NON_FACTORY_RETURN_TYPES,
  FACTORY_NAME_PREFIXES
} from './constants.js';

// 輔助函數
export {
  isLineMatch,
  isFactoryReturnType,
  calculateFactoryConfidence,
  createFactoryPatternInfo,
  parseJSDocContent,
  createDocumentation,
  createFormattedParameter,
  createEmptyRange,
  isRelativePath,
  UNICODE_IDENTIFIER_PATTERN,
  isValidUnicodeIdentifier,
  matchesAnyPattern
} from './parser-helpers.js';

export { computeContentHash } from '@shared/content-hash.js';

// 引用 className 過濾策略（TS/JS reference-finder 共用）
export {
  shouldExcludeByClassName,
  type ClassNameFilterRefInfo
} from './reference-class-filter.js';

// 驗證邏輯
export { validateParserInput, validateRenameInput } from './validators.js';
