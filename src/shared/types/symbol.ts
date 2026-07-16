/**
 * Symbol 相關型別定義
 * 包含 SymbolType、Symbol、Reference、Dependency 等型別
 */

import { Location } from '@shared/types/core.js';

/**
 * Symbol 類型列舉
 */
export enum SymbolType {
  Class = 'class',
  Interface = 'interface',
  Protocol = 'protocol',
  Struct = 'struct',
  Function = 'function',
  Variable = 'variable',
  Constant = 'constant',
  Property = 'property',
  Type = 'type',
  Enum = 'enum',
  Module = 'module',
  Namespace = 'namespace'
}

/**
 * Scope 類型
 */
export type ScopeType = 'global' | 'module' | 'namespace' | 'class' | 'interface' | 'function' | 'block';

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
  readonly attributes?: readonly string[];
  readonly superclass?: string;
  readonly implements?: readonly string[];
}

/**
 * Reference 類型列舉
 */
export enum ReferenceType {
  Definition = 'definition',
  Usage = 'usage',
  Declaration = 'declaration',
  Import = 'import'
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
  readonly isTypeOnly?: boolean;
}

/**
 * 建立 Scope 的工廠函式
 */
export function createScope(
  type: ScopeType,
  name?: string,
  parent?: Scope
): Scope {
  const validTypes: ScopeType[] = ['global', 'module', 'namespace', 'class', 'interface', 'function', 'block'];

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
  modifiers: string[] = [],
  attributes?: string[],
  superclass?: string,
  implementsProtocols?: string[]
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
    modifiers: [...modifiers],
    ...(attributes && attributes.length > 0 ? { attributes: [...attributes] } : {}),
    ...(superclass ? { superclass } : {}),
    ...(implementsProtocols && implementsProtocols.length > 0 ? { implements: [...implementsProtocols] } : {})
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
  const validTypes: ScopeType[] = ['global', 'module', 'namespace', 'class', 'interface', 'function', 'block'];

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
 * 判斷符號是否為「函式區域符號」——即無法被其他檔案引用、只存在於單一檔案內的符號。
 *
 * 單一權威定義（SSOT）：沿 scope 父鏈只要出現 function 或 block scope 即為區域符號。
 * 依賴 scope 語意為「宣告所在的 enclosing scope」（見 symbol-extractor visitNode）：
 * - 頂層 function / class / interface / const 等：enclosing scope 為 module/global，鏈中無
 *   function/block → 非區域，需跨檔處理引用。
 * - 函式內的區域變數 / 參數 / 巢狀函式：enclosing 鏈含 function → 區域，只需處理定義檔。
 * - class 方法：enclosing scope 為 class（其上為 module）→ 非區域（方法可被跨檔透過成員存取引用）。
 *
 * 呼叫端（rename.command、reference-updater）一律引用此定義，禁自行重寫判定邏輯。
 */
export function isFunctionLocalSymbol(symbol: Symbol): boolean {
  if (!symbol.location?.filePath) {
    return false;
  }

  let scope: Scope | undefined = symbol.scope;
  while (scope) {
    if (scope.type === 'function' || scope.type === 'block') {
      return true;
    }
    scope = scope.parent;
  }

  return false;
}

/**
 * 判斷是否為 parser 產生的 import-only binding 候選（例如 JS 檔案的 import specifier
 * 也會產生 type: variable 的 Symbol，但它並非真正的本地宣告）。
 *
 * 單一權威定義（SSOT）：呼叫端（symbol-target-resolver、rename.command、
 * call-hierarchy-analyzer 等）判斷候選是否為單純 import binding 時一律引用此定義，
 * 禁自行重寫判定邏輯。
 */
export function isImportedSymbol(symbol: Symbol): boolean {
  return (symbol as { readonly isImported?: boolean }).isImported === true;
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