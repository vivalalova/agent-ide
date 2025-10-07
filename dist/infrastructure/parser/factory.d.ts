/**
 * Parser 工廠實作
 * 負責建立和管理 Parser 實例，提供快取和配置管理功能
 */
import type { ParserPlugin } from './interface.js';
import type { ParserRegistry } from './registry.js';
import type { ParserOptions } from './types.js';
/**
 * 延遲載入器函式類型
 */
export type LazyLoaderFunction = () => Promise<ParserPlugin>;
/**
 * Parser 工廠
 * 負責建立 Parser 實例，提供快取和配置管理
 */
export declare class ParserFactory {
    private readonly registry;
    /** Parser 實例快取 */
    private readonly cache;
    /** 延遲載入器映射 */
    private readonly lazyLoaders;
    /** 全域預設配置 */
    private globalDefaultOptions;
    /** Parser 特定預設配置 */
    private readonly parserDefaultOptions;
    /** 最大快取大小 */
    private maxCacheSize;
    /** 是否已被清理 */
    private disposed;
    constructor(registry: ParserRegistry);
    /**
     * 根據檔案路徑建立 Parser
     * @param filePath 檔案路徑
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParser(filePath: string, options?: ParserOptions): ParserPlugin | null;
    /**
     * 根據副檔名建立 Parser
     * @param extension 副檔名
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByExtension(extension: string, options?: ParserOptions): ParserPlugin | null;
    /**
     * 根據語言建立 Parser
     * @param language 語言名稱
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByLanguage(language: string, options?: ParserOptions): ParserPlugin | null;
    /**
     * 根據 Parser 名稱建立 Parser
     * @param name Parser 名稱
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByName(name: string, options?: ParserOptions): ParserPlugin | null;
    /**
     * 註冊延遲載入器
     * @param parserName Parser 名稱
     * @param loader 載入器函式
     */
    registerLazyParser(parserName: string, loader: LazyLoaderFunction): void;
    /**
     * 延遲建立 Parser
     * @param filePath 檔案路徑
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserLazy(filePath: string, options?: ParserOptions): Promise<ParserPlugin | null>;
    /**
     * 獲取快取的 Parser 實例
     * @param name Parser 名稱
     * @param parser Parser 實例
     * @param options 配置選項
     * @returns Parser 實例
     */
    private getCachedParser;
    /**
     * 建立快取鍵
     * @param name Parser 名稱
     * @param options 配置選項
     * @returns 快取鍵
     */
    private buildCacheKey;
    /**
     * 移除最久未使用的快取項目 (LRU)
     */
    private evictOldestCacheItem;
    /**
     * 清除快取
     * @param parserName 可選，指定清除特定 Parser 的快取
     */
    clearCache(parserName?: string): void;
    /**
     * 設定最大快取大小
     * @param size 快取大小
     */
    setMaxCacheSize(size: number): void;
    /**
     * 獲取快取大小
     */
    getCacheSize(): number;
    /**
     * 獲取已快取的 Parser 名稱
     */
    getCachedParsers(): string[];
    /**
     * 設定全域預設配置
     * @param options 配置選項
     */
    setDefaultOptions(options: ParserOptions): void;
    /**
     * 設定特定 Parser 的預設配置
     * @param parserName Parser 名稱
     * @param options 配置選項
     */
    setParserOptions(parserName: string, options: ParserOptions): void;
    /**
     * 獲取合併後的配置選項
     * @param parserName Parser 名稱
     * @param options 用戶提供的配置選項
     * @returns 合併後的配置選項
     */
    private getMergedOptions;
    /**
     * 清理工廠
     * 清理所有快取並釋放資源
     */
    dispose(): Promise<void>;
    /**
     * 檢查工廠是否已被清理
     */
    private checkNotDisposed;
    /**
     * 獲取清理狀態
     */
    get isDisposed(): boolean;
}
//# sourceMappingURL=factory.d.ts.map