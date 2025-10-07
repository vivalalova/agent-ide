/**
 * Symbol 相關型別定義
 * 包含 SymbolType、Symbol、Reference、Dependency 等型別
 */
import { Location } from './core.js';
/**
 * Symbol 類型列舉
 */
export declare enum SymbolType {
    Class = "class",
    Interface = "interface",
    Function = "function",
    Variable = "variable",
    Constant = "constant",
    Type = "type",
    Enum = "enum",
    Module = "module",
    Namespace = "namespace"
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
export declare enum ReferenceType {
    Definition = "definition",
    Usage = "usage",
    Declaration = "declaration"
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
export declare enum DependencyType {
    Import = "import",
    Require = "require",
    Include = "include"
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
export declare function createScope(type: ScopeType, name?: string, parent?: Scope): Scope;
/**
 * 建立 Symbol 的工廠函式
 */
export declare function createSymbol(name: string, type: SymbolType, location: Location, scope?: Scope, modifiers?: string[]): Symbol;
/**
 * 建立 Reference 的工廠函式
 */
export declare function createReference(symbol: Symbol, location: Location, type: ReferenceType): Reference;
/**
 * 建立 Dependency 的工廠函式
 */
export declare function createDependency(path: string, type: DependencyType, isRelative: boolean, importedSymbols?: string[]): Dependency;
/**
 * Scope 型別守衛
 */
export declare function isScope(value: unknown): value is Scope;
/**
 * Symbol 型別守衛
 */
export declare function isSymbol(value: unknown): value is Symbol;
/**
 * Reference 型別守衛
 */
export declare function isReference(value: unknown): value is Reference;
/**
 * Dependency 型別守衛
 */
export declare function isDependency(value: unknown): value is Dependency;
/**
 * 計算 Scope 的深度
 */
export declare function getScopeDepth(scope: Scope): number;
/**
 * 檢查兩個 Symbol 是否在同一 Scope
 */
export declare function isSameScope(symbol1: Symbol, symbol2: Symbol): boolean;
/**
 * 取得 Scope 的完整路徑
 */
export declare function getScopePath(scope: Scope): string[];
//# sourceMappingURL=symbol.d.ts.map