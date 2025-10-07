/**
 * TypeScript Parser 主要實作
 * 實作 ParserPlugin 介面
 */
import * as ts from 'typescript';
import { ParserPlugin, CodeEdit, Definition, Usage, ValidationResult } from '../../infrastructure/parser/index.js';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
import { type Disposable } from '../../shared/utils/memory-monitor.js';
/**
 * TypeScript Parser 實作
 */
export declare class TypeScriptParser implements ParserPlugin, Disposable {
    readonly name = "typescript";
    readonly version = "1.0.0";
    readonly supportedExtensions: readonly [".ts", ".tsx", ".d.ts"];
    readonly supportedLanguages: readonly ["typescript", "tsx"];
    private symbolExtractor;
    private dependencyAnalyzer;
    private compilerOptions;
    private languageService;
    private languageServiceHost;
    private files;
    constructor(compilerOptions?: ts.CompilerOptions);
    /**
     * 解析 TypeScript 程式碼
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
     * 基本的符號引用查找（回退方法）
     */
    private findReferencesBasic;
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
    private getScriptKind;
    private getLanguageFromFilePath;
    private getSyntacticDiagnostics;
    private findNodeAtPosition;
    private isReferenceToSymbol;
    private getIdentifierFromSymbolNode;
    private getNodeScope;
    private isInSameScope;
    private isScopeNode;
    private getReferenceType;
    private isRenameableNode;
    private isDefinitionNode;
    private isDeclarationNode;
    private getDefinitionKind;
    private symbolTypeToDefinitionKind;
    private getReferenceUsageKind;
    private findSymbolAtPosition;
    private isPositionInRange;
    /**
     * 初始化 Language Service
     */
    private ensureLanguageServiceInitialized;
    /**
     * 更新檔案內容
     */
    private updateFile;
    /**
     * 取得符號在檔案中的位置
     */
    private getSymbolPosition;
    /**
     * 根據檔案名稱取得 SourceFile
     */
    private getSourceFileFromFileName;
    /**
     * 取得節點的作用域容器
     */
    private getScopeContainer;
    /**
     * 檢查節點是否在指定作用域鏈內
     */
    private isInScopeChain;
    /**
     * 檢查符號是否被遮蔽
     */
    private isShadowed;
}
//# sourceMappingURL=parser.d.ts.map