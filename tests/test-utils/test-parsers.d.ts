/**
 * 測試用 Parser 插件
 * 為所有測試提供統一的 Mock Parser 實作
 */
import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../src/infrastructure/parser/types';
/**
 * 基礎測試 Parser
 */
declare abstract class BaseTestParser implements ParserPlugin {
    abstract readonly name: string;
    abstract readonly version: string;
    abstract readonly supportedExtensions: readonly string[];
    abstract readonly supportedLanguages: readonly string[];
    extractDependencies(ast: AST): Promise<Dependency[]>;
    findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
    rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
    extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;
    findDefinition(ast: AST, position: Position): Promise<Definition | null>;
    findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;
    validate(): Promise<ValidationResult>;
    dispose(): Promise<void>;
}
/**
 * 測試用 TypeScript Parser
 */
export declare class TestTypeScriptParser extends BaseTestParser {
    readonly name = 'typescript';
    readonly version = '1.0.0-test';
    readonly supportedExtensions: readonly ['.ts', '.tsx'];
    readonly supportedLanguages: readonly ['typescript'];
    parse(code: string, filePath: string): Promise<AST>;
    extractSymbols(ast: AST): Promise<Symbol[]>;
}
/**
 * 測試用 JavaScript Parser
 */
export declare class TestJavaScriptParser extends BaseTestParser {
    readonly name = 'javascript';
    readonly version = '1.0.0-test';
    readonly supportedExtensions: readonly ['.js', '.jsx'];
    readonly supportedLanguages: readonly ['javascript'];
    parse(code: string, filePath: string): Promise<AST>;
    extractSymbols(ast: AST): Promise<Symbol[]>;
}
/**
 * 註冊測試 Parsers
 */
export declare function registerTestParsers(): void;
/**
 * 清理測試 Parsers
 */
export declare function cleanupTestParsers(): void;
export {};
//# sourceMappingURL=test-parsers.d.ts.map