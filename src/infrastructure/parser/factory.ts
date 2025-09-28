/**
 * Parser 工廠實作
 * 負責建立和管理 Parser 實例，提供快取和配置管理功能
 */

import type { ParserPlugin } from './interface';
import { getFileExtension } from './interface';
import type { ParserRegistry } from './registry';
import type { ParserOptions } from './types';
import { ParserFactoryError } from '@shared/errors';

/**
 * 延遲載入器函式類型
 */
export type LazyLoaderFunction = () => Promise<ParserPlugin>;

/**
 * 快取項目
 */
interface CacheItem {
  /** Parser 實例 */
  parser: ParserPlugin;

  /** 最後訪問時間 */
  lastAccessed: Date;

  /** 配置選項 */
  options: ParserOptions | undefined;
}

/**
 * Parser 工廠
 * 負責建立 Parser 實例，提供快取和配置管理
 */
export class ParserFactory {
  /** Parser 實例快取 */
  private readonly cache = new Map<string, CacheItem>();

  /** 延遲載入器映射 */
  private readonly lazyLoaders = new Map<string, LazyLoaderFunction>();

  /** 全域預設配置 */
  private globalDefaultOptions: ParserOptions = {};

  /** Parser 特定預設配置 */
  private readonly parserDefaultOptions = new Map<string, ParserOptions>();

  /** 最大快取大小 */
  private maxCacheSize = 50;

  /** 是否已被清理 */
  private disposed = false;

  constructor(private readonly registry: ParserRegistry) {
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
  createParser(filePath: string, options?: ParserOptions): ParserPlugin | null {
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
  createParserByExtension(extension: string, options?: ParserOptions): ParserPlugin | null {
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
  createParserByLanguage(language: string, options?: ParserOptions): ParserPlugin | null {
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
  createParserByName(name: string, options?: ParserOptions): ParserPlugin | null {
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
  registerLazyParser(parserName: string, loader: LazyLoaderFunction): void {
    this.checkNotDisposed();
    this.lazyLoaders.set(parserName, loader);
  }

  /**
   * 延遲建立 Parser
   * @param filePath 檔案路徑
   * @param options 配置選項
   * @returns Parser 實例或 null
   */
  async createParserLazy(filePath: string, options?: ParserOptions): Promise<ParserPlugin | null> {
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
      } catch (error) {
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
  private getCachedParser(name: string, parser: ParserPlugin, options?: ParserOptions): ParserPlugin {
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
    const cacheItem: CacheItem = {
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
  private buildCacheKey(name: string, options?: ParserOptions): string {
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
  private evictOldestCacheItem(): void {
    let oldestKey: string | null = null;
    let oldestTime: Date | null = null;

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
  clearCache(parserName?: string): void {
    this.checkNotDisposed();

    if (!parserName) {
      this.cache.clear();
      return;
    }

    // 清除指定 Parser 的所有快取項目
    const keysToDelete: string[] = [];
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
  setMaxCacheSize(size: number): void {
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
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * 獲取已快取的 Parser 名稱
   */
  getCachedParsers(): string[] {
    const parserNames = new Set<string>();

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
  setDefaultOptions(options: ParserOptions): void {
    this.checkNotDisposed();
    this.globalDefaultOptions = { ...options };
  }

  /**
   * 設定特定 Parser 的預設配置
   * @param parserName Parser 名稱
   * @param options 配置選項
   */
  setParserOptions(parserName: string, options: ParserOptions): void {
    this.checkNotDisposed();
    this.parserDefaultOptions.set(parserName, { ...options });
  }

  /**
   * 獲取合併後的配置選項
   * @param parserName Parser 名稱
   * @param options 用戶提供的配置選項
   * @returns 合併後的配置選項
   */
  private getMergedOptions(parserName: string, options?: ParserOptions): ParserOptions {
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
  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    // 清理快取中的所有 Parser
    const disposePromises: Promise<void>[] = [];

    for (const cacheItem of this.cache.values()) {
      disposePromises.push(
        cacheItem.parser.dispose().catch(error => {
          console.warn('清理快取中的 Parser 時發生錯誤:', error);
        })
      );
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
  private checkNotDisposed(): void {
    if (this.disposed) {
      throw new ParserFactoryError('Factory已被清理');
    }
  }

  /**
   * 獲取清理狀態
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}