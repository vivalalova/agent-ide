/**
 * Deadcode 模組共用快取服務
 * 統一管理檔案內容和符號引用快取，避免重複快取相同資料
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */

import type { SymbolReference } from '@core/foundations/symbol-finder/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';

/**
 * Deadcode 模組共用快取服務
 * 提供統一的檔案內容和符號引用快取管理
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */
export class DeadCodeCacheService {
  /** 檔案內容快取（content 為 null 表示檔案不存在） */
  private readonly fileCache: MemoryCache<string, string | null> = createLRUCache(500);

  /** 符號引用快取：key = `${filePath}:${symbolName}` */
  private readonly referenceCache: MemoryCache<string, SymbolReference[]> = createLRUCache(2000);

  /**
   * 取得檔案內容（從快取或返回 undefined）
   * @param filePath 檔案路徑
   * @returns 快取的內容或 undefined（未快取）
   */
  getFile(filePath: string): string | null | undefined {
    // MemoryCache.get() 自動更新 lastAccessedAt
    return this.fileCache.get(filePath);
  }

  /**
   * 設定檔案內容快取
   * @param filePath 檔案路徑
   * @param content 檔案內容（null 表示檔案不存在）
   */
  setFile(filePath: string, content: string | null): void {
    // MemoryCache 自動處理 LRU 淘汰
    this.fileCache.set(filePath, content);
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
    // MemoryCache.get() 自動更新 lastAccessedAt
    return this.referenceCache.get(cacheKey);
  }

  /**
   * 設定符號引用快取
   * @param filePath 檔案路徑
   * @param symbolName 符號名稱
   * @param references 引用列表
   */
  setReferences(filePath: string, symbolName: string, references: SymbolReference[]): void {
    const cacheKey = `${filePath}:${symbolName}`;
    // MemoryCache 自動處理 LRU 淘汰
    this.referenceCache.set(cacheKey, references);
  }

  /**
   * 更新檔案內容（寫入後同步更新快取）
   * @param filePath 檔案路徑
   * @param content 新內容
   */
  updateFile(filePath: string, content: string): void {
    this.fileCache.set(filePath, content);
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
      fileCount: this.fileCache.size(),
      referenceCount: this.referenceCache.size()
    };
  }
}

/**
 * 建立 DeadCodeCacheService 實例
 */
export function createDeadCodeCacheService(): DeadCodeCacheService {
  return new DeadCodeCacheService();
}
