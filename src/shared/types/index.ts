/**
 * 核心型別系統統一匯出
 */

// 核心型別
export * from './core.js';

// Symbol 相關型別
export * from './symbol.js';

// AST 相關型別
export * from './ast.js';

// 重新匯出常用型別以便於使用
export type {
  Position,
  Range,
  Location
} from './core.js';

// enum 需要正常匯出
export {
  SymbolType,
  ReferenceType,
  DependencyType
} from './symbol.js';

export type {
  Scope,
  Symbol,
  Reference,
  Dependency
} from './symbol.js';

export type {
  ASTNode,
  ASTMetadata,
  AST
} from './ast.js';