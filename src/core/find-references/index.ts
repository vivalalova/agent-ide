/**
 * 符號引用查找模組
 * 提供跨檔案符號引用查找功能
 *
 * 注意：核心實作位於 @core/foundations/symbol-finder
 * 本模組提供 CLI 介面的簡化包裝
 */

// 主引擎
export { ReferenceFinderEngine, createReferenceFinderEngine } from './reference-finder-engine.js';

// 型別定義（從 types.ts 重新匯出）
export {
  SymbolReferenceType,
  ClassMemberType,
  symbolToKey,
  serializeSymbolKey,
  deserializeSymbolKey
} from './types.js';

export type {
  SymbolReference,
  CallSite,
  CallSiteArgument,
  ClassMember,
  SymbolDefinition,
  SymbolKey
} from './types.js';

// 向後相容：重新匯出 SymbolFinder 和 createSymbolFinder
export { SymbolFinder, createSymbolFinder } from '@core/foundations/symbol-finder/index.js';
