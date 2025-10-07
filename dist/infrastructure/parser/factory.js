/**
 * Parser 工廠實作
 * 負責建立和管理 Parser 實例，提供快取和配置管理功能
 */
import { getFileExtension } from './interface.js';
import { ParserFactoryError } from '../../shared/errors/index.js';
/**
 * Parser 工廠
 * 負責建立 Parser 實例，提供快取和配置管理
 */
export class ParserFactory {
    registry;
    /** Parser 實例快取 */
    cache = new Map();
    /** 延遲載入器映射 */
    lazyLoaders = new Map();
    /** 全域預設配置 */
    globalDefaultOptions = {};
    /** Parser 特定預設配置 */
    parserDefaultOptions = new Map();
    /** 最大快取大小 */
    maxCacheSize = 50;
    /** 是否已被清理 */
    disposed = false;
    constructor(registry) {
        this.registry = registry;
        if (!registry) {
            throw new ParserFactoryError('ParserRegistry 不能為空');
        }
    }
    // ===== Parser 建立 =====
    /**
     * 根據檔案路徑建立 Parser
     * @param filePath 檔案路徑
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParser(filePath, options) {
        this.checkNotDisposed();
        const extension = getFileExtension(filePath);
        return this.createParserByExtension(extension, options);
    }
    /**
     * 根據副檔名建立 Parser
     * @param extension 副檔名
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByExtension(extension, options) {
        this.checkNotDisposed();
        const parser = this.registry.getParser(extension);
        if (!parser) {
            return null;
        }
        return this.getCachedParser(parser.name, parser, options);
    }
    /**
     * 根據語言建立 Parser
     * @param language 語言名稱
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByLanguage(language, options) {
        this.checkNotDisposed();
        const parser = this.registry.getParserByLanguage(language);
        if (!parser) {
            return null;
        }
        return this.getCachedParser(parser.name, parser, options);
    }
    /**
     * 根據 Parser 名稱建立 Parser
     * @param name Parser 名稱
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    createParserByName(name, options) {
        this.checkNotDisposed();
        const parser = this.registry.getParserByName(name);
        if (!parser) {
            return null;
        }
        return this.getCachedParser(name, parser, options);
    }
    // ===== 延遲載入 =====
    /**
     * 註冊延遲載入器
     * @param parserName Parser 名稱
     * @param loader 載入器函式
     */
    registerLazyParser(parserName, loader) {
        this.checkNotDisposed();
        this.lazyLoaders.set(parserName, loader);
    }
    /**
     * 延遲建立 Parser
     * @param filePath 檔案路徑
     * @param options 配置選項
     * @returns Parser 實例或 null
     */
    async createParserLazy(filePath, options) {
        this.checkNotDisposed();
        const extension = getFileExtension(filePath);
        // 先嘗試從註冊中心獲取
        const parser = this.registry.getParser(extension);
        if (parser) {
            return this.getCachedParser(parser.name, parser, options);
        }
        // 嘗試延遲載入
        for (const [parserName, loader] of this.lazyLoaders.entries()) {
            try {
                const lazyParser = await loader();
                if (lazyParser.supportedExtensions.includes(extension)) {
                    // 註冊到註冊中心
                    this.registry.register(lazyParser);
                    return this.getCachedParser(parserName, lazyParser, options);
                }
            }
            catch (error) {
                console.warn(`延遲載入 Parser ${parserName} 失敗:`, error);
            }
        }
        return null;
    }
    // ===== 快取管理 =====
    /**
     * 獲取快取的 Parser 實例
     * @param name Parser 名稱
     * @param parser Parser 實例
     * @param options 配置選項
     * @returns Parser 實例
     */
    getCachedParser(name, parser, options) {
        const mergedOptions = this.getMergedOptions(name, options);
        const cacheKey = this.buildCacheKey(name, mergedOptions);
        // 檢查快取
        const cached = this.cache.get(cacheKey);
        if (cached) {
            cached.lastAccessed = new Date();
            return cached.parser;
        }
        // 檢查快取大小限制
        if (this.cache.size >= this.maxCacheSize) {
            this.evictOldestCacheItem();
        }
        // 建立新的快取項目
        const cacheItem = {
            parser,
            lastAccessed: new Date(),
            options: mergedOptions || undefined
        };
        this.cache.set(cacheKey, cacheItem);
        return parser;
    }
    /**
     * 建立快取鍵
     * @param name Parser 名稱
     * @param options 配置選項
     * @returns 快取鍵
     */
    buildCacheKey(name, options) {
        if (!options) {
            return name;
        }
        // 將配置選項序列化為字串
        const optionsStr = JSON.stringify(options, Object.keys(options).sort());
        return `${name}:${optionsStr}`;
    }
    /**
     * 移除最久未使用的快取項目 (LRU)
     */
    evictOldestCacheItem() {
        let oldestKey = null;
        let oldestTime = null;
        for (const [key, item] of this.cache.entries()) {
            if (!oldestTime || item.lastAccessed < oldestTime) {
                oldestTime = item.lastAccessed;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }
    /**
     * 清除快取
     * @param parserName 可選，指定清除特定 Parser 的快取
     */
    clearCache(parserName) {
        this.checkNotDisposed();
        if (!parserName) {
            this.cache.clear();
            return;
        }
        // 清除指定 Parser 的所有快取項目
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(parserName + ':') || key === parserName) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }
    /**
     * 設定最大快取大小
     * @param size 快取大小
     */
    setMaxCacheSize(size) {
        if (size <= 0) {
            throw new ParserFactoryError('快取大小必須大於 0');
        }
        this.maxCacheSize = size;
        // 如果當前快取超出大小限制，移除舊項目
        while (this.cache.size > this.maxCacheSize) {
            this.evictOldestCacheItem();
        }
    }
    /**
     * 獲取快取大小
     */
    getCacheSize() {
        return this.cache.size;
    }
    /**
     * 獲取已快取的 Parser 名稱
     */
    getCachedParsers() {
        const parserNames = new Set();
        for (const key of this.cache.keys()) {
            const parserName = key.split(':')[0];
            parserNames.add(parserName);
        }
        return Array.from(parserNames).sort();
    }
    // ===== 配置管理 =====
    /**
     * 設定全域預設配置
     * @param options 配置選項
     */
    setDefaultOptions(options) {
        this.checkNotDisposed();
        this.globalDefaultOptions = { ...options };
    }
    /**
     * 設定特定 Parser 的預設配置
     * @param parserName Parser 名稱
     * @param options 配置選項
     */
    setParserOptions(parserName, options) {
        this.checkNotDisposed();
        this.parserDefaultOptions.set(parserName, { ...options });
    }
    /**
     * 獲取合併後的配置選項
     * @param parserName Parser 名稱
     * @param options 用戶提供的配置選項
     * @returns 合併後的配置選項
     */
    getMergedOptions(parserName, options) {
        const parserDefaults = this.parserDefaultOptions.get(parserName) || {};
        return {
            ...this.globalDefaultOptions,
            ...parserDefaults,
            ...options
        };
    }
    // ===== 生命週期管理 =====
    /**
     * 清理工廠
     * 清理所有快取並釋放資源
     */
    async dispose() {
        if (this.disposed) {
            return;
        }
        // 清理快取中的所有 Parser
        const disposePromises = [];
        for (const cacheItem of this.cache.values()) {
            disposePromises.push(cacheItem.parser.dispose().catch(error => {
                console.warn('清理快取中的 Parser 時發生錯誤:', error);
            }));
        }
        await Promise.all(disposePromises);
        // 清空所有映射表
        this.cache.clear();
        this.lazyLoaders.clear();
        this.parserDefaultOptions.clear();
        this.disposed = true;
    }
    // ===== 內部工具方法 =====
    /**
     * 檢查工廠是否已被清理
     */
    checkNotDisposed() {
        if (this.disposed) {
            throw new ParserFactoryError('Factory已被清理');
        }
    }
    /**
     * 獲取清理狀態
     */
    get isDisposed() {
        return this.disposed;
    }
}
//# sourceMappingURL=factory.js.map