import { DirectoryEntry, FileStats, GlobOptions, AtomicWriteOptions } from './types.js';
/**
 * 檔案系統操作類別
 * 提供統一的檔案和目錄操作介面
 */
export declare class FileSystem {
    private readonly tempSuffix;
    /**
     * 讀取檔案內容
     */
    readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Buffer>;
    /**
     * 寫入檔案內容
     * 自動建立不存在的目錄
     */
    writeFile(filePath: string, content: string | Buffer, options?: AtomicWriteOptions): Promise<void>;
    /**
     * 原子寫入檔案
     */
    private atomicWrite;
    /**
     * 追加檔案內容
     */
    appendFile(filePath: string, content: string | Buffer): Promise<void>;
    /**
     * 刪除檔案
     */
    deleteFile(filePath: string): Promise<void>;
    /**
     * 建立目錄
     */
    createDirectory(dirPath: string, recursive?: boolean): Promise<void>;
    /**
     * 讀取目錄內容
     */
    readDirectory(dirPath: string): Promise<DirectoryEntry[]>;
    /**
     * 刪除目錄
     */
    deleteDirectory(dirPath: string, recursive?: boolean): Promise<void>;
    /**
     * 檢查路徑是否存在
     */
    exists(targetPath: string): Promise<boolean>;
    /**
     * 獲取檔案統計資訊
     */
    getStats(targetPath: string): Promise<FileStats>;
    /**
     * 安全獲取檔案統計資訊（不拋出錯誤）
     */
    private safeGetStats;
    /**
     * 檢查是否為檔案
     */
    isFile(targetPath: string): Promise<boolean>;
    /**
     * 檢查是否為目錄
     */
    isDirectory(targetPath: string): Promise<boolean>;
    /**
     * 複製檔案
     */
    copyFile(srcPath: string, destPath: string): Promise<void>;
    /**
     * 移動檔案
     */
    moveFile(srcPath: string, destPath: string): Promise<void>;
    /**
     * Glob 搜尋檔案
     */
    glob(pattern: string, options?: GlobOptions): Promise<string[]>;
}
//# sourceMappingURL=file-system.d.ts.map