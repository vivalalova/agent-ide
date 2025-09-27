/**
 * 檔案索引實作
 * 管理檔案的索引資訊，包含符號、依賴關係等
 */

import type { Symbol, Dependency } from '../../shared/types';
import type { 
  FileInfo, 
  FileIndexEntry, 
  IndexConfig, 
  IndexStats,
  IndexUpdateEvent
} from './types';
import { UpdateOperation } from './types';

/**
 * 檔案索引類別
 * 負責管理專案中所有檔案的索引資訊
 */
export class FileIndex {
  private readonly config: IndexConfig;
  private readonly fileEntries = new Map<string, FileIndexEntry>();
  private lastUpdated = new Date();

  constructor(config: IndexConfig) {
    this.config = config;
  }

  /**
   * 新增檔案到索引
   */
  async addFile(fileInfo: FileInfo): Promise<void> {
    const entry: FileIndexEntry = {
      fileInfo,
      symbols: [],
      dependencies: [],
      isIndexed: false,
      lastIndexed: undefined,
      parseErrors: []
    };

    this.fileEntries.set(fileInfo.filePath, entry);
    this.lastUpdated = new Date();

    this.emitUpdateEvent({
      operation: UpdateOperation.Add,
      filePath: fileInfo.filePath,
      timestamp: new Date(),
      success: true,
      error: undefined
    });
  }

  /**
   * 移除檔案從索引
   */
  async removeFile(filePath: string): Promise<void> {
    const existed = this.fileEntries.has(filePath);
    this.fileEntries.delete(filePath);
    
    if (existed) {
      this.lastUpdated = new Date();
      
      this.emitUpdateEvent({
        operation: UpdateOperation.Delete,
        filePath,
        timestamp: new Date(),
        success: true,
        error: undefined
      });
    }
  }

  /**
   * 檢查檔案是否在索引中
   */
  hasFile(filePath: string): boolean {
    return this.fileEntries.has(filePath);
  }

  /**
   * 取得檔案資訊
   */
  getFileInfo(filePath: string): FileInfo | null {
    const entry = this.fileEntries.get(filePath);
    return entry?.fileInfo || null;
  }

  /**
   * 設定檔案的符號
   */
  async setFileSymbols(filePath: string, symbols: readonly Symbol[]): Promise<void> {
    const entry = this.fileEntries.get(filePath);
    if (!entry) {
      throw new Error(`檔案不存在於索引中: ${filePath}`);
    }

    const updatedEntry: FileIndexEntry = {
      ...entry,
      symbols: [...symbols],
      isIndexed: true,
      lastIndexed: new Date()
    };

    this.fileEntries.set(filePath, updatedEntry);
    this.lastUpdated = new Date();

    this.emitUpdateEvent({
      operation: UpdateOperation.Update,
      filePath,
      timestamp: new Date(),
      success: true,
      error: undefined
    });
  }

  /**
   * 取得檔案的符號
   */
  getFileSymbols(filePath: string): readonly Symbol[] {
    const entry = this.fileEntries.get(filePath);
    return entry?.symbols || [];
  }

  /**
   * 設定檔案的依賴關係
   */
  async setFileDependencies(filePath: string, dependencies: readonly Dependency[]): Promise<void> {
    const entry = this.fileEntries.get(filePath);
    if (!entry) {
      throw new Error(`檔案不存在於索引中: ${filePath}`);
    }

    const updatedEntry: FileIndexEntry = {
      ...entry,
      dependencies: [...dependencies]
    };

    this.fileEntries.set(filePath, updatedEntry);
    this.lastUpdated = new Date();
  }

  /**
   * 取得檔案的依賴關係
   */
  getFileDependencies(filePath: string): readonly Dependency[] {
    const entry = this.fileEntries.get(filePath);
    return entry?.dependencies || [];
  }

  /**
   * 根據副檔名查找檔案
   */
  findFilesByExtension(extension: string): readonly FileInfo[] {
    const result: FileInfo[] = [];
    
    for (const entry of this.fileEntries.values()) {
      if (entry.fileInfo.extension === extension) {
        result.push(entry.fileInfo);
      }
    }
    
    return result;
  }

  /**
   * 根據語言查找檔案
   */
  findFilesByLanguage(language: string): readonly FileInfo[] {
    const result: FileInfo[] = [];
    
    for (const entry of this.fileEntries.values()) {
      if (entry.fileInfo.language === language) {
        result.push(entry.fileInfo);
      }
    }
    
    return result;
  }

  /**
   * 取得所有檔案
   */
  getAllFiles(): readonly FileInfo[] {
    return Array.from(this.fileEntries.values()).map(entry => entry.fileInfo);
  }

  /**
   * 取得檔案總數
   */
  getTotalFiles(): number {
    return this.fileEntries.size;
  }

  /**
   * 取得已索引的檔案數
   */
  getIndexedFilesCount(): number {
    let count = 0;
    for (const entry of this.fileEntries.values()) {
      if (entry.isIndexed) {
        count++;
      }
    }
    return count;
  }

  /**
   * 取得索引統計資訊
   */
  getStats(): IndexStats {
    let totalSymbols = 0;
    let totalDependencies = 0;
    let indexSize = 0;

    for (const entry of this.fileEntries.values()) {
      totalSymbols += entry.symbols.length;
      totalDependencies += entry.dependencies.length;
      indexSize += this.estimateEntrySize(entry);
    }

    return {
      totalFiles: this.fileEntries.size,
      indexedFiles: this.getIndexedFilesCount(),
      totalSymbols,
      totalDependencies,
      lastUpdated: this.lastUpdated,
      indexSize
    };
  }

  /**
   * 清空所有索引
   */
  async clear(): Promise<void> {
    this.fileEntries.clear();
    this.lastUpdated = new Date();
  }

  /**
   * 取得檔案索引項目（內部使用）
   */
  getFileEntry(filePath: string): FileIndexEntry | undefined {
    return this.fileEntries.get(filePath);
  }

  /**
   * 取得所有檔案索引項目（內部使用）
   */
  getAllEntries(): ReadonlyMap<string, FileIndexEntry> {
    return this.fileEntries;
  }

  /**
   * 估算索引項目的記憶體大小
   */
  private estimateEntrySize(entry: FileIndexEntry): number {
    // 簡化的大小估算
    let size = 0;
    
    // FileInfo 大小
    size += entry.fileInfo.filePath.length * 2; // UTF-16
    size += 64; // 其他屬性大約 64 bytes
    
    // Symbols 大小
    size += entry.symbols.length * 128; // 每個符號約 128 bytes
    
    // Dependencies 大小
    size += entry.dependencies.length * 64; // 每個依賴約 64 bytes
    
    return size;
  }

  /**
   * 發送更新事件（內部使用）
   */
  private emitUpdateEvent(event: IndexUpdateEvent): void {
    // 在實際實作中，這裡可以使用 EventEmitter 或其他事件機制
    // 目前只是預留介面
  }

  /**
   * 檢查檔案是否需要重新索引
   */
  needsReindexing(filePath: string, currentModified: Date): boolean {
    const entry = this.fileEntries.get(filePath);
    if (!entry) {
      return true; // 檔案不在索引中，需要索引
    }

    if (!entry.isIndexed) {
      return true; // 尚未被索引
    }

    // 檢查檔案修改時間 (允許 1 秒的誤差，避免浮點數精度問題)
    const timeDiff = currentModified.getTime() - entry.fileInfo.lastModified.getTime();
    return timeDiff > 1000; // 只有相差超過 1 秒才認為需要重新索引
  }

  /**
   * 更新檔案資訊（不影響符號和依賴）
   */
  async updateFileInfo(filePath: string, newFileInfo: FileInfo): Promise<void> {
    const entry = this.fileEntries.get(filePath);
    if (!entry) {
      throw new Error(`檔案不存在於索引中: ${filePath}`);
    }

    const updatedEntry: FileIndexEntry = {
      ...entry,
      fileInfo: newFileInfo
    };

    this.fileEntries.set(filePath, updatedEntry);
    this.lastUpdated = new Date();
  }

  /**
   * 設定檔案的解析錯誤
   */
  async setFileParseErrors(filePath: string, errors: readonly string[]): Promise<void> {
    const entry = this.fileEntries.get(filePath);
    if (!entry) {
      throw new Error(`檔案不存在於索引中: ${filePath}`);
    }

    const updatedEntry: FileIndexEntry = {
      ...entry,
      parseErrors: [...errors]
    };

    this.fileEntries.set(filePath, updatedEntry);
    this.lastUpdated = new Date();
  }

  /**
   * 取得檔案的解析錯誤
   */
  getFileParseErrors(filePath: string): readonly string[] {
    const entry = this.fileEntries.get(filePath);
    return entry?.parseErrors || [];
  }

  /**
   * 檢查檔案是否有解析錯誤
   */
  hasFileParseErrors(filePath: string): boolean {
    const entry = this.fileEntries.get(filePath);
    return entry ? entry.parseErrors.length > 0 : false;
  }
}