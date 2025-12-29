/**
 * 符號引用查找模組型別定義
 * 從 @core/foundations/symbol-finder 重新匯出核心型別
 */

// 從 symbol-finder 重新匯出型別
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
} from '@core/foundations/symbol-finder/index.js';
