/**
 * JavaScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */
import { ParserPlugin, CodeEdit, Definition, Usage, ValidationResult } from '../../infrastructure/parser/index.js';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
import { JavaScriptParseOptions } from './types.js';
/**
 * JavaScript Parser 實作
 */
export declare class JavaScriptParser implements ParserPlugin {
    readonly name = "javascript";
    readonly version = "1.0.0";
    readonly supportedExtensions: readonly [".js", ".jsx", ".mjs", ".cjs"];
    readonly supportedLanguages: readonly ["javascript", "jsx"];
    private parseOptions;
    constructor(parseOptions?: Partial<JavaScriptParseOptions>);
    /**
     * 解析 JavaScript 程式碼
     */
    parse(code: string, filePath: string): Promise<AST>;
    /**
     * 提取符號
     */
    extractSymbols(ast: AST): Promise<Symbol[]>;
    /**
     * 查找符號引用
     */
    findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
    /**
     * 提取依賴關係
     */
    extractDependencies(ast: AST): Promise<Dependency[]>;
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
    private getParseOptionsForFile;
    private getLanguageFromFilePath;
    private getNodeRange;
    private extractFunctionSymbol;
    private extractClassSymbol;
    private extractVariableSymbol;
    private extractImportSymbol;
    private extractMethodSymbol;
    private extractPropertySymbol;
    private extractObjectMethodSymbol;
    private extractObjectPropertySymbol;
    private createSymbolFromNode;
    private extractImportDependency;
    private extractExportDependency;
    private extractCallExpressionDependency;
    private isReferenceToSymbol;
    private getReferenceType;
    private symbolTypeToDefinitionKind;
    private findSymbolAtPosition;
    private isPositionInRange;
}
//# sourceMappingURL=parser.d.ts.map