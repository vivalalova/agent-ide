/**
 * 符號引用查找模組
 * 提供跨檔案符號引用查找功能
 *
 * 注意：核心實作 SymbolFinder 位於 @core/shared/symbol-finder.ts
 * 本模組提供 CLI 介面的簡化包裝
 */

// 從 shared 重新匯出符號查找相關功能
export {
  SymbolFinder,
  createSymbolFinder,
  SymbolReferenceType,
  ClassMemberType
} from '@core/shared/symbol-finder/index.js';

export type {
  SymbolReference,
  CallSite,
  CallSiteArgument,
  ClassMember,
  SymbolDefinition
} from '@core/shared/symbol-finder/index.js';
