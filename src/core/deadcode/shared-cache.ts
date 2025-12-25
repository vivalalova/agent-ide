/**
 * Deadcode 模組共用快取服務
 * 統一管理檔案內容和符號引用快取，避免重複快取相同資料
 */

import type { SymbolReference } from '@core/foundations/symbol-finder/index.js';

/** 檔案內容快取條目 */
interface FileCacheEntry {
  content: string | null;
  lastAccessed: number;
}

/** 符號引用快取條目 */
interface ReferenceCacheEntry {
  references: SymbolReference[];
  lastAccessed: number;
}

/** 檔案內容快取最大條目數 */
const MAX_FILE_CACHE_SIZE = 500;

/** 符號引用快取最大條目數 */
const MAX_REFERENCE_CACHE_SIZE = 2000;

/**
 * Deadcode 模組共用快取服務
 * 提供統一的檔案內容和符號引用快取管理
 */
export class DeadCodeCacheService {
  /** 檔案內容快取 */
  private readonly fileCache = new Map<string, FileCacheEntry>();

  /** 符號引用快取：key = `${filePath}:${symbolName}` */
  private readonly referenceCache = new Map<string, ReferenceCacheEntry>();

  /**
   * 取得檔案內容（從快取或返回 undefined）
   * @param filePath 檔案路徑
   * @returns 快取的內容或 undefined（未快取）
   */
  getFile(filePath: string): string | null | undefined {
    const entry = this.fileCache.get(filePath);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.content;
    }
    return undefined;
  }

  /**
   * 設定檔案內容快取
   * @param filePath 檔案路徑
   * @param content 檔案內容（null 表示檔案不存在）
   */
  setFile(filePath: string, content: string | null): void {
    this.evictFileCacheIfNeeded();
    this.fileCache.set(filePath, {
      content,
      lastAccessed: Date.now()
    });
  }

  /**
   * 檢查檔案是否已快取
   * @param filePath 檔案路徑
   */
  hasFile(filePath: string): boolean {
    return this.fileCache.has(filePath);
  }

  /**
   * 取得符號引用（從快取或返回 undefined）
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @returns 快取的引用或 undefined（未快取）
   */
  getReferences(filePath: string, symbolName: string): SymbolReference[] | undefined {
    const cacheKey = `${filePath}:${symbolName}`;
    const entry = this.referenceCache.get(cacheKey);
    if (entry) {
      entry.lastAccessed = Date.now();
      return entry.references;
    }
    return undefined;
  }

  /**
   * 設定符號引用快取
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @param references 引用列表
   */
  setReferences(filePath: string, symbolName: string, references: SymbolReference[]): void {
    this.evictReferenceCacheIfNeeded();
    const cacheKey = `${filePath}:${symbolName}`;
    this.referenceCache.set(cacheKey, {
      references,
      lastAccessed: Date.now()
    });
  }

  /**
   * 更新檔案內容（寫入後同步更新快取）
   * @param filePath 檔案路徑
   * @param content 新內容
   */
  updateFile(filePath: string, content: string): void {
    const entry = this.fileCache.get(filePath);
    if (entry) {
      entry.content = content;
      entry.lastAccessed = Date.now();
    } else {
      this.setFile(filePath, content);
    }
  }

  /**
   * 清除所有快取
   */
  clear(): void {
    this.fileCache.clear();
    this.referenceCache.clear();
  }

  /**
   * 取得快取統計資訊
   */
  getStats(): { fileCount: number; referenceCount: number } {
    return {
      fileCount: this.fileCache.size,
      referenceCount: this.referenceCache.size
    };
  }

  /**
   * LRU 檔案快取淘汰
   */
  private evictFileCacheIfNeeded(): void {
    if (this.fileCache.size < MAX_FILE_CACHE_SIZE) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.fileCache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.fileCache.delete(oldestKey);
    }
  }

  /**
   * LRU 引用快取淘汰
   */
  private evictReferenceCacheIfNeeded(): void {
    if (this.referenceCache.size < MAX_REFERENCE_CACHE_SIZE) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.referenceCache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.referenceCache.delete(oldestKey);
    }
  }
}

/**
 * 建立 DeadCodeCacheService 實例
 */
export function createDeadCodeCacheService(): DeadCodeCacheService {
  return new DeadCodeCacheService();
}
