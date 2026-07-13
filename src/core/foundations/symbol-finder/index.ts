/**
 * 符號查找器模組
 * 提供跨檔案符號查找能力
 */

// 型別定義
export {
  SymbolReferenceType,
  ClassMemberType,
  type SymbolReference,
  type CallSite,
  type CallSiteArgument,
  type ClassMember,
  type SymbolDefinition,
  type SymbolKey,
  symbolToKey,
  serializeSymbolKey,
  deserializeSymbolKey
} from './types.js';

// 主類別
export { SymbolFinder, createSymbolFinder } from './symbol-finder.js';

// 工具類別（供進階使用）
export { TextMatcher, createTextMatcher } from './text-matcher.js';
export { CallSiteParser, createCallSiteParser } from './call-site-parser.js';
export { createIdentifierBoundaryRegex } from './identifier-matcher.js';
