/**
 * 索引相關型別定義
 * 包含檔案索引、符號索引、查詢結果等型別
 */
import type { Symbol, Dependency } from '../../shared/types/index.js';
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
    readonly indexSize: number;
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
    readonly score: number;
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
export declare enum UpdateOperation {
    Add = "add",
    Update = "update",
    Delete = "delete"
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
export declare function createFileInfo(filePath: string, lastModified: Date, size: number, extension: string, language?: string, checksum?: string): FileInfo;
/**
 * 創建 IndexConfig 的工廠函式
 */
export declare function createIndexConfig(workspacePath: string, options?: Partial<IndexConfig>): IndexConfig;
/**
 * 創建 SearchOptions 的工廠函式
 */
export declare function createSearchOptions(options?: Partial<SearchOptions>): SearchOptions;
/**
 * 檢查 FileInfo 型別守衛
 */
export declare function isFileInfo(value: unknown): value is FileInfo;
/**
 * 檢查 IndexConfig 型別守衛
 */
export declare function isIndexConfig(value: unknown): value is IndexConfig;
/**
 * 計算索引進度百分比
 */
export declare function calculateProgress(processed: number, total: number): number;
/**
 * 檢查檔案是否應該被索引（根據配置）
 */
export declare function shouldIndexFile(filePath: string, config: IndexConfig): boolean;
//# sourceMappingURL=types.d.ts.map