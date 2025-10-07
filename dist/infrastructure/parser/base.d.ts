/**
 * BaseParserPlugin 抽象類別
 * 提供 Parser 插件的基礎實作和通用功能
 */
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
import type { ParserPlugin } from './interface.js';
import type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities } from './types.js';
/**
 * 日誌等級
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/**
 * BaseParserPlugin 抽象類別
 * 提供常用功能的預設實作，減少插件開發工作量
 */
export declare abstract class BaseParserPlugin implements ParserPlugin {
    abstract readonly name: string;
    abstract readonly version: string;
    abstract readonly supportedExtensions: readonly string[];
    abstract readonly supportedLanguages: readonly string[];
    abstract parse(code: string, filePath: string): Promise<AST>;
    private _initialized;
    private _disposed;
    private _options;
    /**
     * 從 AST 中提取符號（預設實作返回空陣列）
     */
    extractSymbols(_ast: AST): Promise<Symbol[]>;
    /**
     * 查找符號引用（預設實作返回空陣列）
     */
    findReferences(_ast: AST, symbol: Symbol): Promise<Reference[]>;
    /**
     * 提取依賴關係（預設實作返回空陣列）
     */
    extractDependencies(_ast: AST): Promise<Dependency[]>;
    /**
     * 重新命名（預設實作返回空陣列）
     */
    rename(_ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
    /**
     * 提取函式（預設實作返回空陣列）
     */
    extractFunction(_ast: AST, _selection: Range): Promise<CodeEdit[]>;
    /**
     * 查找定義（預設實作返回 null）
     */
    findDefinition(_ast: AST, position: Position): Promise<Definition | null>;
    /**
     * 查找使用位置（預設實作返回空陣列）
     */
    findUsages(_ast: AST, symbol: Symbol): Promise<Usage[]>;
    /**
     * 驗證插件狀態（預設實作返回成功）
     */
    validate(): Promise<ValidationResult>;
    /**
     * 清理資源（預設實作）
     */
    dispose(): Promise<void>;
    /**
     * 初始化插件
     */
    initialize(options?: ParserOptions): Promise<void>;
    /**
     * 檢查是否已初始化
     */
    isInitialized(): boolean;
    /**
     * 檢查是否已清理
     */
    isDisposed(): boolean;
    /**
     * 獲取預設配置選項
     */
    getDefaultOptions(): ParserOptions;
    /**
     * 更新配置選項
     */
    updateOptions(options: Partial<ParserOptions>): void;
    /**
     * 獲取插件能力聲明
     */
    getCapabilities(): ParserCapabilities;
    /**
     * 處理錯誤
     */
    handleError(error: Error, context?: string): void;
    /**
     * 記錄日誌
     */
    log(level: LogLevel, message: string): void;
    /**
     * 驗證檔案路徑
     */
    validateFilePath(filePath: string): boolean;
    /**
     * 驗證程式碼內容
     */
    validateCode(code: string): boolean;
    /**
     * 驗證位置
     */
    validatePosition(position: Position): boolean;
    /**
     * 驗證範圍
     */
    validateRange(range: Range): boolean;
    /**
     * 從檔案路徑獲取副檔名
     */
    protected getFileExtension(filePath: string): string;
    /**
     * 檢查插件是否支援特定檔案
     */
    protected supportsFile(filePath: string): boolean;
    /**
     * 建立基本的 CodeEdit
     */
    protected createCodeEdit(filePath: string, range: Range, newText: string, editType?: 'rename' | 'extract' | 'inline' | 'format'): CodeEdit;
    /**
     * 安全執行異步操作
     */
    protected safeExecute<T>(operation: () => Promise<T>, defaultValue: T, context?: string): Promise<T>;
}
//# sourceMappingURL=base.d.ts.map