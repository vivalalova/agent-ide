/**
 * 索引相關型別定義
 * 包含檔案索引、符號索引、查詢結果等型別
 */

import type { Symbol, Dependency, Location } from '@shared/types';

/**
 * 檔案資訊
 */
export interface FileInfo {
  readonly filePath: string;
  readonly lastModified: Date;
  readonly size: number;
  readonly extension: string;
  readonly language: string | undefined;
  readonly checksum: string;
}

/**
 * 符號索引項目
 */
export interface SymbolIndexEntry {
  readonly symbol: Symbol;
  readonly fileInfo: FileInfo;
  readonly dependencies: readonly string[];
}

/**
 * 檔案索引項目
 */
export interface FileIndexEntry {
  readonly fileInfo: FileInfo;
  readonly symbols: readonly Symbol[];
  readonly dependencies: readonly Dependency[];
  readonly isIndexed: boolean;
  readonly lastIndexed: Date | undefined;
  readonly parseErrors: readonly string[];
}

/**
 * 索引統計資訊
 */
export interface IndexStats {
  readonly totalFiles: number;
  readonly indexedFiles: number;
  readonly totalSymbols: number;
  readonly totalDependencies: number;
  readonly lastUpdated: Date;
  readonly indexSize: number; // 索引大小（位元組）
}

/**
 * 索引配置
 */
export interface IndexConfig {
  readonly workspacePath: string;
  readonly excludePatterns: readonly string[];
  readonly includeExtensions: readonly string[];
  readonly maxFileSize: number;
  readonly enablePersistence: boolean;
  readonly persistencePath: string | undefined;
  readonly maxConcurrency: number;
}

/**
 * 搜尋選項
 */
export interface SearchOptions {
  readonly caseSensitive: boolean;
  readonly fuzzy: boolean;
  readonly maxResults: number;
  readonly includeFileInfo: boolean;
}

/**
 * 符號搜尋結果
 */
export interface SymbolSearchResult {
  readonly symbol: Symbol;
  readonly fileInfo: FileInfo;
  readonly score: number; // 相關度評分（0-1）
}

/**
 * 檔案搜尋結果
 */
export interface FileSearchResult {
  readonly fileInfo: FileInfo;
  readonly score: number;
  readonly matchedPath: boolean;
  readonly matchedContent: boolean;
}

/**
 * 更新操作類型
 */
export enum UpdateOperation {
  Add = 'add',
  Update = 'update',
  Delete = 'delete'
}

/**
 * 索引更新事件
 */
export interface IndexUpdateEvent {
  readonly operation: UpdateOperation;
  readonly filePath: string;
  readonly timestamp: Date;
  readonly success: boolean;
  readonly error: string | undefined;
}

/**
 * 批次索引選項
 */
export interface BatchIndexOptions {
  readonly concurrency: number;
  readonly batchSize: number;
  readonly progressCallback: (progress: IndexProgress) => void;
}

/**
 * 索引進度資訊
 */
export interface IndexProgress {
  readonly totalFiles: number;
  readonly processedFiles: number;
  readonly currentFile: string | undefined;
  readonly percentage: number;
  readonly errors: readonly string[];
}

/**
 * 持久化儲存介面
 */
export interface IndexStorage {
  /**
   * 載入索引資料
   */
  load(): Promise<IndexData | null>;

  /**
   * 儲存索引資料
   */
  save(data: IndexData): Promise<void>;

  /**
   * 清除所有索引資料
   */
  clear(): Promise<void>;

  /**
   * 檢查是否存在索引檔案
   */
  exists(): Promise<boolean>;

  /**
   * 取得儲存統計資訊
   */
  getStats(): Promise<StorageStats>;
}

/**
 * 索引資料結構
 */
export interface IndexData {
  readonly version: string;
  readonly config: IndexConfig;
  readonly stats: IndexStats;
  readonly fileIndex: Map<string, FileIndexEntry>;
  readonly symbolIndex: Map<string, SymbolIndexEntry[]>;
  readonly lastUpdated: Date;
}

/**
 * 儲存統計資訊
 */
export interface StorageStats {
  readonly size: number;
  readonly lastModified: Date;
  readonly compressionRatio: number | undefined;
}

/**
 * 索引查詢介面
 */
export interface IndexQuery {
  /**
   * 根據名稱查找符號
   */
  findSymbol(name: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;

  /**
   * 根據類型查找符號
   */
  findSymbolsByType(type: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;

  /**
   * 模糊搜尋符號
   */
  searchSymbols(pattern: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;

  /**
   * 搜尋檔案
   */
  searchFiles(pattern: string, options?: SearchOptions): Promise<FileSearchResult[]>;

  /**
   * 取得檔案的所有符號
   */
  getFileSymbols(filePath: string): Promise<Symbol[]>;

  /**
   * 取得符號的依賴關係
   */
  getSymbolDependencies(symbol: Symbol): Promise<Dependency[]>;
}

/**
 * 創建 FileInfo 的工廠函式
 */
export function createFileInfo(
  filePath: string,
  lastModified: Date,
  size: number,
  extension: string,
  language?: string,
  checksum?: string
): FileInfo {
  if (!filePath.trim()) {
    throw new Error('檔案路徑不能為空');
  }

  if (size < 0) {
    throw new Error('檔案大小不能為負數');
  }

  return {
    filePath,
    lastModified,
    size,
    extension,
    language: language || undefined,
    checksum: checksum || ''
  };
}

/**
 * 創建 IndexConfig 的工廠函式
 */
export function createIndexConfig(
  workspacePath: string,
  options?: Partial<IndexConfig>
): IndexConfig {
  if (!workspacePath.trim()) {
    throw new Error('工作區路徑不能為空');
  }

  return {
    workspacePath,
    excludePatterns: options?.excludePatterns || ['node_modules/**', '.git/**', 'dist/**'],
    includeExtensions: options?.includeExtensions || ['.ts', '.js', '.tsx', '.jsx'],
    maxFileSize: options?.maxFileSize || 1024 * 1024, // 1MB
    enablePersistence: options?.enablePersistence || true,
    persistencePath: options?.persistencePath,
    maxConcurrency: options?.maxConcurrency || 4
  };
}

/**
 * 創建 SearchOptions 的工廠函式
 */
export function createSearchOptions(options?: Partial<SearchOptions>): SearchOptions {
  return {
    caseSensitive: options?.caseSensitive || false,
    fuzzy: options?.fuzzy || true,
    maxResults: options?.maxResults || 100,
    includeFileInfo: options?.includeFileInfo || true
  };
}

/**
 * 檢查 FileInfo 型別守衛
 */
export function isFileInfo(value: unknown): value is FileInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.filePath === 'string' &&
    obj.filePath.trim().length > 0 &&
    obj.lastModified instanceof Date &&
    typeof obj.size === 'number' &&
    obj.size >= 0 &&
    typeof obj.extension === 'string' &&
    (obj.language === undefined || typeof obj.language === 'string') &&
    typeof obj.checksum === 'string'
  );
}

/**
 * 檢查 IndexConfig 型別守衛
 */
export function isIndexConfig(value: unknown): value is IndexConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.workspacePath === 'string' &&
    obj.workspacePath.trim().length > 0 &&
    Array.isArray(obj.excludePatterns) &&
    Array.isArray(obj.includeExtensions) &&
    typeof obj.maxFileSize === 'number' &&
    obj.maxFileSize > 0 &&
    typeof obj.enablePersistence === 'boolean' &&
    (obj.persistencePath === undefined || typeof obj.persistencePath === 'string') &&
    typeof obj.maxConcurrency === 'number' &&
    obj.maxConcurrency > 0
  );
}

/**
 * 計算索引進度百分比
 */
export function calculateProgress(processed: number, total: number): number {
  if (total === 0) {
    return 100;
  }
  return Math.round((processed / total) * 100);
}

/**
 * 檢查檔案是否應該被索引（根據配置）
 */
export function shouldIndexFile(filePath: string, config: IndexConfig): boolean {
  // 檢查副檔名
  const extension = filePath.substring(filePath.lastIndexOf('.'));
  if (!config.includeExtensions.includes(extension)) {
    return false;
  }

  // 檢查排除模式
  for (const pattern of config.excludePatterns) {
    if (matchesPattern(filePath, pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * 簡單的模式匹配（支援 ** 和 *）
 */
function matchesPattern(path: string, pattern: string): boolean {
  // 簡化的 glob 模式匹配實現
  const regexPattern = pattern
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(path);
}