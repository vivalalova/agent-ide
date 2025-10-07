/**
 * JavaScript Parser 特定型別定義
 */
import type { AST, ASTNode, Position, Range, Symbol } from '../../shared/types/index.js';
import { SymbolType } from '../../shared/types/index.js';
import * as babel from '@babel/types';
import type { ParseResult } from '@babel/parser';
/**
 * JavaScript AST 節點包裝器
 * 包裝 Babel AST 節點
 */
export interface JavaScriptASTNode extends ASTNode {
    readonly babelNode: babel.Node;
    readonly sourceFile: string;
}
/**
 * JavaScript AST 包裝器
 */
export interface JavaScriptAST extends AST {
    readonly root: JavaScriptASTNode;
    readonly babelAST: ParseResult<babel.File>;
    readonly sourceCode: string;
}
/**
 * JavaScript Symbol 資訊
 */
export interface JavaScriptSymbol extends Symbol {
    readonly babelNode: babel.Node;
    readonly isExported?: boolean;
    readonly isImported?: boolean;
}
/**
 * JavaScript 解析選項
 */
export interface JavaScriptParseOptions {
    readonly sourceType?: 'script' | 'module' | 'unambiguous';
    readonly allowImportExportEverywhere?: boolean;
    readonly allowAwaitOutsideFunction?: boolean;
    readonly allowReturnOutsideFunction?: boolean;
    readonly allowNewTargetOutsideFunction?: boolean;
    readonly allowSuperOutsideMethod?: boolean;
    readonly allowUndeclaredExports?: boolean;
    readonly attachComments?: boolean;
    readonly strictMode?: boolean;
    readonly ranges?: boolean;
    readonly tokens?: boolean;
    readonly preserveComments?: boolean;
    readonly plugins?: BabelPlugin[];
}
/**
 * Babel 插件類型
 */
export type BabelPlugin = 'jsx' | 'typescript' | 'decorators' | 'classProperties' | 'classPrivateProperties' | 'classPrivateMethods' | 'classStaticBlock' | 'privateIn' | 'functionBind' | 'asyncGenerators' | 'bigInt' | 'decorators-legacy' | 'doExpressions' | 'dynamicImport' | 'exportDefaultFrom' | 'exportNamespaceFrom' | 'functionSent' | 'importMeta' | 'nullishCoalescingOperator' | 'numericSeparator' | 'objectRestSpread' | 'optionalCatchBinding' | 'optionalChaining' | 'partialApplication' | 'throwExpressions' | 'topLevelAwait' | 'v8intrinsic' | [string, any];
/**
 * 預設的 JavaScript 解析選項
 */
export declare const DEFAULT_PARSE_OPTIONS: JavaScriptParseOptions;
/**
 * Babel 節點類型映射
 * 將 Babel 節點類型映射到我們的 ASTNode 類型
 */
export declare const BABEL_NODE_TYPE_MAP: Partial<Record<string, string>>;
/**
 * Babel 符號類型映射
 */
export declare const BABEL_SYMBOL_TYPE_MAP: Partial<Record<string, SymbolType>>;
/**
 * 位置轉換工具函式
 */
export declare function babelLocationToPosition(location: babel.SourceLocation): Range;
/**
 * 位置轉換為 Babel 位置
 */
export declare function positionToBabelLocation(position: Position): babel.SourceLocation;
/**
 * 獲取節點的名稱
 */
export declare function getNodeName(node: babel.Node): string | undefined;
/**
 * 檢查節點是否為符號宣告
 */
export declare function isSymbolDeclaration(node: babel.Node): boolean;
/**
 * 檢查節點是否為依賴相關節點
 */
export declare function isDependencyNode(node: babel.Node): boolean;
/**
 * 獲取依賴路徑
 */
export declare function getDependencyPath(node: babel.Node): string | undefined;
/**
 * 檢查路徑是否為相對路徑
 */
export declare function isRelativePath(path: string): boolean;
/**
 * 獲取導入的符號
 */
export declare function getImportedSymbols(node: babel.ImportDeclaration): string[];
/**
 * 創建 JavaScript AST 節點
 */
export declare function createJavaScriptASTNode(babelNode: babel.Node, sourceFile: string): JavaScriptASTNode;
/**
 * 驗證識別符名稱
 */
export declare function isValidIdentifier(name: string): boolean;
/**
 * 檢查是否為保留字
 */
export declare function isReservedWord(name: string): boolean;
/**
 * 錯誤類別
 */
export declare class JavaScriptParseError extends Error {
    readonly babelError?: Error | undefined;
    readonly location?: babel.SourceLocation | undefined;
    constructor(message: string, babelError?: Error | undefined, location?: babel.SourceLocation | undefined);
}
/**
 * 創建解析錯誤
 */
export declare function createParseError(message: string, babelError?: Error, location?: babel.SourceLocation): JavaScriptParseError;
/**
 * 獲取檔案的預設 Babel 插件
 */
export declare function getPluginsForFile(filePath: string): BabelPlugin[];
/**
 * 獲取作用域類型
 */
export declare function getScopeType(node: babel.Node): string;
//# sourceMappingURL=types.d.ts.map