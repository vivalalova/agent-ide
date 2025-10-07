/**
 * 檔案索引實作
 * 管理檔案的索引資訊，包含符號、依賴關係等
 */
import type { Symbol, Dependency } from '../../shared/types/index.js';
import type { FileInfo, FileIndexEntry, IndexConfig, IndexStats } from './types.js';
/**
 * 檔案索引類別
 * 負責管理專案中所有檔案的索引資訊
 */
export declare class FileIndex {
    private readonly config;
    private readonly fileEntries;
    private lastUpdated;
    constructor(config: IndexConfig);
    /**
     * 新增檔案到索引
     */
    addFile(fileInfo: FileInfo): Promise<void>;
    /**
     * 移除檔案從索引
     */
    removeFile(filePath: string): Promise<void>;
    /**
     * 檢查檔案是否在索引中
     */
    hasFile(filePath: string): boolean;
    /**
     * 檢查檔案是否已成功索引（存在且已解析）
     */
    isFileIndexed(filePath: string): boolean;
    /**
     * 取得檔案資訊
     */
    getFileInfo(filePath: string): FileInfo | null;
    /**
     * 設定檔案的符號
     */
    setFileSymbols(filePath: string, symbols: readonly Symbol[]): Promise<void>;
    /**
     * 取得檔案的符號
     */
    getFileSymbols(filePath: string): readonly Symbol[];
    /**
     * 設定檔案的依賴關係
     */
    setFileDependencies(filePath: string, dependencies: readonly Dependency[]): Promise<void>;
    /**
     * 取得檔案的依賴關係
     */
    getFileDependencies(filePath: string): readonly Dependency[];
    /**
     * 根據副檔名查找檔案
     */
    findFilesByExtension(extension: string): readonly FileInfo[];
    /**
     * 根據語言查找檔案
     */
    findFilesByLanguage(language: string): readonly FileInfo[];
    /**
     * 取得所有檔案
     */
    getAllFiles(): readonly FileInfo[];
    /**
     * 取得檔案總數
     */
    getTotalFiles(): number;
    /**
     * 取得已索引的檔案數
     */
    getIndexedFilesCount(): number;
    /**
     * 取得索引統計資訊
     */
    getStats(): IndexStats;
    /**
     * 清空所有索引
     */
    clear(): Promise<void>;
    /**
     * 取得檔案索引項目（內部使用）
     */
    getFileEntry(filePath: string): FileIndexEntry | undefined;
    /**
     * 取得所有檔案索引項目（內部使用）
     */
    getAllEntries(): ReadonlyMap<string, FileIndexEntry>;
    /**
     * 估算索引項目的記憶體大小
     */
    private estimateEntrySize;
    /**
     * 發送更新事件（內部使用）
     */
    private emitUpdateEvent;
    /**
     * 檢查檔案是否需要重新索引
     */
    needsReindexing(filePath: string, currentModified: Date): boolean;
    /**
     * 更新檔案資訊（不影響符號和依賴）
     */
    updateFileInfo(filePath: string, newFileInfo: FileInfo): Promise<void>;
    /**
     * 設定檔案的解析錯誤
     */
    setFileParseErrors(filePath: string, errors: readonly string[]): Promise<void>;
    /**
     * 取得檔案的解析錯誤
     */
    getFileParseErrors(filePath: string): readonly string[];
    /**
     * 檢查檔案是否有解析錯誤
     */
    hasFileParseErrors(filePath: string): boolean;
}
//# sourceMappingURL=file-index.d.ts.map