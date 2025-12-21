/**
 * 符號查找器模組
 * Re-export 所有公開 API
 */

// 型別定義
export {
  SymbolReferenceType,
  ClassMemberType,
  type SymbolReference,
  type CallSite,
  type CallSiteArgument,
  type ClassMember,
  type SymbolDefinition
} from './types.js';

// 主類別
export { SymbolFinder, createSymbolFinder } from './symbol-finder.js';

// 輔助類別（供進階使用）
export { TextMatcher } from './text-matcher.js';
export { ArgumentsParser } from './arguments-parser.js';
export { CallSiteFinder } from './call-site-finder.js';
