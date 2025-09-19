/**
 * 核心型別系統統一匯出
 */

// 核心型別
export * from './core';

// Symbol 相關型別
export * from './symbol';

// AST 相關型別
export * from './ast';

// 重新匯出常用型別以便於使用
export type {
  Position,
  Range,
  Location
} from './core';

// enum 需要正常匯出
export {
  SymbolType,
  ReferenceType,
  DependencyType
} from './symbol';

export type {
  Scope,
  Symbol,
  Reference,
  Dependency
} from './symbol';

export type {
  ASTNode,
  ASTMetadata,
  AST
} from './ast';