/**
 * TypeScript Parser 特定型別定義
 */
import type { AST, ASTNode, Position, Range, Symbol } from '../../shared/types/index.js';
import { SymbolType } from '../../shared/types/index.js';
import * as ts from 'typescript';
/**
 * TypeScript AST 節點包裝器
 * 包裝 TypeScript Compiler API 的 Node
 */
export interface TypeScriptASTNode extends ASTNode {
    readonly tsNode: ts.Node;
    readonly sourceFile: ts.SourceFile;
}
/**
 * TypeScript AST 包裝器
 */
export interface TypeScriptAST extends AST {
    readonly root: TypeScriptASTNode;
    readonly tsSourceFile: ts.SourceFile;
    readonly program?: ts.Program;
    readonly diagnostics?: ts.Diagnostic[];
}
/**
 * TypeScript Symbol 資訊
 */
export interface TypeScriptSymbol extends Symbol {
    readonly tsSymbol?: ts.Symbol;
    readonly tsNode: ts.Node;
    readonly typeInfo?: string;
    readonly signature?: string;
}
/**
 * TypeScript 解析選項
 */
export interface TypeScriptParseOptions {
    readonly target?: ts.ScriptTarget;
    readonly module?: ts.ModuleKind;
    readonly jsx?: ts.JsxEmit;
    readonly strict?: boolean;
    readonly esModuleInterop?: boolean;
    readonly allowJs?: boolean;
    readonly declaration?: boolean;
    readonly experimentalDecorators?: boolean;
    readonly emitDecoratorMetadata?: boolean;
}
/**
 * TypeScript 編譯器配置
 */
export interface TypeScriptCompilerOptions {
    readonly compilerOptions: ts.CompilerOptions;
    readonly include?: string[];
    readonly exclude?: string[];
}
/**
 * 預設的 TypeScript 編譯器選項
 */
export declare const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions;
/**
 * TypeScript 語法種類映射
 * 將 TypeScript SyntaxKind 映射到我們的 ASTNode 類型
 */
export declare const SYNTAX_KIND_MAP: Partial<Record<ts.SyntaxKind, string>>;
/**
 * TypeScript 符號類型映射
 */
export declare const SYMBOL_TYPE_MAP: Partial<Record<ts.SyntaxKind, SymbolType>>;
/**
 * TypeScript 修飾符映射
 */
export declare const MODIFIER_MAP: Partial<Record<ts.SyntaxKind, string>>;
/**
 * 位置轉換工具函式
 */
export declare function tsPositionToPosition(sourceFile: ts.SourceFile, pos: number): Position;
/**
 * 範圍轉換工具函式
 */
export declare function tsNodeToRange(node: ts.Node, sourceFile: ts.SourceFile): Range;
/**
 * 位置轉換為 TypeScript 位置
 */
export declare function positionToTsPosition(sourceFile: ts.SourceFile, position: Position): number;
/**
 * 獲取節點的修飾符
 */
export declare function getNodeModifiers(node: ts.Node): string[];
/**
 * 獲取節點的名稱
 */
export declare function getNodeName(node: ts.Node): string | undefined;
/**
 * 檢查節點是否為符號宣告
 */
export declare function isSymbolDeclaration(node: ts.Node): boolean;
/**
 * 檢查節點是否為 import/export 語句
 */
export declare function isDependencyNode(node: ts.Node): boolean;
/**
 * 獲取依賴路徑
 */
export declare function getDependencyPath(node: ts.Node): string | undefined;
/**
 * 檢查路徑是否為相對路徑
 */
export declare function isRelativePath(path: string): boolean;
/**
 * 獲取導入的符號
 */
export declare function getImportedSymbols(node: ts.ImportDeclaration): string[];
/**
 * 創建 TypeScript AST 節點
 */
export declare function createTypeScriptASTNode(tsNode: ts.Node, sourceFile: ts.SourceFile): TypeScriptASTNode;
/**
 * 驗證識別符名稱
 */
export declare function isValidIdentifier(name: string): boolean;
/**
 * 錯誤類別
 */
export declare class TypeScriptParseError extends Error {
    readonly diagnostics?: ts.Diagnostic[] | undefined;
    constructor(message: string, diagnostics?: ts.Diagnostic[] | undefined);
}
/**
 * 創建解析錯誤
 */
export declare function createParseError(message: string, diagnostics?: ts.Diagnostic[]): TypeScriptParseError;
//# sourceMappingURL=types.d.ts.map