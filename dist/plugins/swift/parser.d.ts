/**
 * Swift Parser 主要實作
 * 實作 ParserPlugin 介面，使用 web-tree-sitter 解析 Swift 程式碼
 */
import { ParserPlugin, CodeEdit, Definition, Usage, ValidationResult } from '../../infrastructure/parser/index.js';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
/**
 * Swift Parser 實作
 * 基於 web-tree-sitter 的 Swift 程式碼解析器
 */
export declare class SwiftParser implements ParserPlugin {
    readonly name = "swift";
    readonly version = "1.0.0";
    readonly supportedExtensions: readonly [".swift"];
    readonly supportedLanguages: readonly ["swift"];
    private initialized;
    private parser;
    private language;
    constructor();
    /**
     * 解析 Swift 程式碼
     */
    parse(code: string, filePath: string): Promise<AST>;
    /**
     * 基本的程式碼解析（暫時實作）
     */
    private parseCodeBasic;
    /**
     * 提取符號
     */
    extractSymbols(ast: AST): Promise<Symbol[]>;
    /**
     * 從節點提取符號
     */
    private extractSymbolsFromNode;
    /**
     * 從節點建立符號
     */
    private createSymbolFromNode;
    /**
     * 從節點提取名稱
     */
    private extractNameFromNode;
    /**
     * 將節點型別轉換為符號型別
     */
    private nodeTypeToSymbolType;
    /**
     * 查找符號引用
     */
    findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
    /**
     * 提取依賴關係
     */
    extractDependencies(ast: AST): Promise<Dependency[]>;
    /**
     * 從節點提取依賴關係
     */
    private extractDependenciesFromNode;
    /**
     * 提取 import 名稱
     */
    private extractImportName;
    /**
     * 重新命名符號
     */
    rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
    /**
     * 提取函式重構
     */
    extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;
    /**
     * 查找定義
     */
    findDefinition(ast: AST, position: Position): Promise<Definition | null>;
    /**
     * 查找使用位置
     */
    findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;
    /**
     * 驗證插件狀態
     */
    validate(): Promise<ValidationResult>;
    /**
     * 清理資源
     */
    dispose(): Promise<void>;
    private validateInput;
    private validateRenameInput;
    private findSymbolAtPosition;
    private isPositionInRange;
    /**
     * 從位置提取標識符名稱
     */
    private extractIdentifierAtPosition;
    private swiftSymbolTypeToDefinitionKind;
}
//# sourceMappingURL=parser.d.ts.map