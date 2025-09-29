/**
 * Symbol 相關型別定義
 * 包含 SymbolType、Symbol、Reference、Dependency 等型別
 */

import { Location } from './core.js';

/**
 * Symbol 類型列舉
 */
export enum SymbolType {
  Class = 'class',
  Interface = 'interface',
  Function = 'function',
  Variable = 'variable',
  Constant = 'constant',
  Type = 'type',
  Enum = 'enum',
  Module = 'module',
  Namespace = 'namespace'
}

/**
 * Scope 類型
 */
export type ScopeType = 'global' | 'module' | 'namespace' | 'class' | 'function' | 'block';

/**
 * 表示程式碼作用域
 */
export interface Scope {
  readonly type: ScopeType;
  readonly name: string | undefined;
  readonly parent: Scope | undefined;
}

/**
 * 表示程式碼符號
 */
export interface Symbol {
  readonly name: string;
  readonly type: SymbolType;
  readonly location: Location;
  readonly scope: Scope | undefined;
  readonly modifiers: readonly string[];
}

/**
 * Reference 類型列舉
 */
export enum ReferenceType {
  Definition = 'definition',
  Usage = 'usage',
  Declaration = 'declaration'
}

/**
 * 表示符號引用
 */
export interface Reference {
  readonly symbol: Symbol;
  readonly location: Location;
  readonly type: ReferenceType;
}

/**
 * Dependency 類型列舉
 */
export enum DependencyType {
  Import = 'import',
  Require = 'require',
  Include = 'include'
}

/**
 * 表示模組依賴
 */
export interface Dependency {
  readonly path: string;
  readonly type: DependencyType;
  readonly isRelative: boolean;
  readonly importedSymbols: readonly string[];
}

/**
 * 建立 Scope 的工廠函式
 */
export function createScope(
  type: ScopeType,
  name?: string,
  parent?: Scope
): Scope {
  const validTypes: ScopeType[] = ['global', 'module', 'namespace', 'class', 'function', 'block'];

  if (!validTypes.includes(type)) {
    throw new Error('無效的 scope 類型');
  }

  return {
    type,
    name: name || undefined,
    parent: parent || undefined
  };
}

/**
 * 建立 Symbol 的工廠函式
 */
export function createSymbol(
  name: string,
  type: SymbolType,
  location: Location,
  scope?: Scope,
  modifiers: string[] = []
): Symbol {
  if (!name.trim()) {
    throw new Error('Symbol 名稱不能為空');
  }

  // 檢查 modifiers 是否有重複
  const uniqueModifiers = new Set(modifiers);
  if (uniqueModifiers.size !== modifiers.length) {
    throw new Error('Modifiers 不能重複');
  }

  return {
    name,
    type,
    location,
    scope: scope || undefined,
    modifiers: [...modifiers]
  };
}

/**
 * 建立 Reference 的工廠函式
 */
export function createReference(
  symbol: Symbol,
  location: Location,
  type: ReferenceType
): Reference {
  return {
    symbol,
    location,
    type
  };
}

/**
 * 建立 Dependency 的工廠函式
 */
export function createDependency(
  path: string,
  type: DependencyType,
  isRelative: boolean,
  importedSymbols: string[] = []
): Dependency {
  if (!path.trim()) {
    throw new Error('Dependency 路徑不能為空');
  }

  // 檢查 importedSymbols 是否有重複
  const uniqueSymbols = new Set(importedSymbols);
  if (uniqueSymbols.size !== importedSymbols.length) {
    throw new Error('ImportedSymbols 不能重複');
  }

  return {
    path,
    type,
    isRelative,
    importedSymbols: [...importedSymbols]
  };
}

/**
 * Scope 型別守衛
 */
export function isScope(value: unknown): value is Scope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validTypes: ScopeType[] = ['global', 'module', 'namespace', 'class', 'function', 'block'];

  return (
    typeof obj.type === 'string' &&
    validTypes.includes(obj.type as ScopeType) &&
    (obj.name === undefined || typeof obj.name === 'string') &&
    (obj.parent === undefined || isScope(obj.parent))
  );
}

/**
 * Symbol 型別守衛
 */
export function isSymbol(value: unknown): value is Symbol {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.name === 'string' &&
    obj.name.trim().length > 0 &&
    Object.values(SymbolType).includes(obj.type as SymbolType) &&
    obj.location && typeof obj.location === 'object' &&
    (obj.scope === undefined || isScope(obj.scope)) &&
    Array.isArray(obj.modifiers)
  ) as boolean;
}

/**
 * Reference 型別守衛
 */
export function isReference(value: unknown): value is Reference {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    isSymbol(obj.symbol) &&
    obj.location && typeof obj.location === 'object' &&
    Object.values(ReferenceType).includes(obj.type as ReferenceType)
  ) as boolean;
}

/**
 * Dependency 型別守衛
 */
export function isDependency(value: unknown): value is Dependency {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.path === 'string' &&
    obj.path.trim().length > 0 &&
    Object.values(DependencyType).includes(obj.type as DependencyType) &&
    typeof obj.isRelative === 'boolean' &&
    Array.isArray(obj.importedSymbols)
  );
}

/**
 * 計算 Scope 的深度
 */
export function getScopeDepth(scope: Scope): number {
  let depth = 0;
  let currentScope: Scope | undefined = scope;

  while (currentScope?.parent) {
    depth++;
    currentScope = currentScope.parent;
  }

  return depth;
}

/**
 * 檢查兩個 Symbol 是否在同一 Scope
 */
export function isSameScope(symbol1: Symbol, symbol2: Symbol): boolean {
  if (!symbol1.scope && !symbol2.scope) {
    return true; // 都沒有 scope，視為相同
  }

  if (!symbol1.scope || !symbol2.scope) {
    return false; // 一個有 scope，一個沒有，不相同
  }

  return symbol1.scope === symbol2.scope;
}

/**
 * 取得 Scope 的完整路徑
 */
export function getScopePath(scope: Scope): string[] {
  const path: string[] = [];
  let currentScope: Scope | undefined = scope;

  while (currentScope) {
    if (currentScope.name) {
      path.unshift(currentScope.name);
    } else {
      path.unshift(currentScope.type);
    }
    currentScope = currentScope.parent;
  }

  return path;
}