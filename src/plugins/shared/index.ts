/**
 * Plugins 共用模組
 *
 * 提供 TypeScript/JavaScript parser 共用的工具函數。
 */

// 錯誤處理
export { ParseError, createParseError } from './parse-error.js';

// 路徑工具
export { isRelativePath } from './path-utils.js';

// 識別符驗證
export {
  UNICODE_IDENTIFIER_PATTERN,
  isValidIdentifier,
  isValidIdentifierSyntax,
  isReservedWord,
  isTypeScriptReservedWord,
  isValidTypeScriptIdentifier
} from './identifier-validator.js';

// 保留字
export { JS_RESERVED_WORDS, TS_RESERVED_WORDS } from './reserved-words.js';
