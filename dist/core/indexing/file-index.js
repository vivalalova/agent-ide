/**
 * 檔案索引實作
 * 管理檔案的索引資訊，包含符號、依賴關係等
 */
import { UpdateOperation } from './types.js';
/**
 * 檔案索引類別
 * 負責管理專案中所有檔案的索引資訊
 */
export class FileIndex {
    config;
    fileEntries = new Map();
    lastUpdated = new Date();
    constructor(config) {
        this.config = config;
    }
    /**
     * 新增檔案到索引
     */
    async addFile(fileInfo) {
        const entry = {
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
    async removeFile(filePath) {
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
    hasFile(filePath) {
        return this.fileEntries.has(filePath);
    }
    /**
     * 檢查檔案是否已成功索引（存在且已解析）
     */
    isFileIndexed(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry ? entry.isIndexed : false;
    }
    /**
     * 取得檔案資訊
     */
    getFileInfo(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry?.fileInfo || null;
    }
    /**
     * 設定檔案的符號
     */
    async setFileSymbols(filePath, symbols) {
        const entry = this.fileEntries.get(filePath);
        if (!entry) {
            throw new Error(`檔案不存在於索引中: ${filePath}`);
        }
        const updatedEntry = {
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
    getFileSymbols(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry?.symbols || [];
    }
    /**
     * 設定檔案的依賴關係
     */
    async setFileDependencies(filePath, dependencies) {
        const entry = this.fileEntries.get(filePath);
        if (!entry) {
            throw new Error(`檔案不存在於索引中: ${filePath}`);
        }
        const updatedEntry = {
            ...entry,
            dependencies: [...dependencies]
        };
        this.fileEntries.set(filePath, updatedEntry);
        this.lastUpdated = new Date();
    }
    /**
     * 取得檔案的依賴關係
     */
    getFileDependencies(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry?.dependencies || [];
    }
    /**
     * 根據副檔名查找檔案
     */
    findFilesByExtension(extension) {
        const result = [];
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
    findFilesByLanguage(language) {
        const result = [];
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
    getAllFiles() {
        return Array.from(this.fileEntries.values()).map(entry => entry.fileInfo);
    }
    /**
     * 取得檔案總數
     */
    getTotalFiles() {
        return this.fileEntries.size;
    }
    /**
     * 取得已索引的檔案數
     */
    getIndexedFilesCount() {
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
    getStats() {
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
    async clear() {
        this.fileEntries.clear();
        this.lastUpdated = new Date();
    }
    /**
     * 取得檔案索引項目（內部使用）
     */
    getFileEntry(filePath) {
        return this.fileEntries.get(filePath);
    }
    /**
     * 取得所有檔案索引項目（內部使用）
     */
    getAllEntries() {
        return this.fileEntries;
    }
    /**
     * 估算索引項目的記憶體大小
     */
    estimateEntrySize(entry) {
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
    emitUpdateEvent(event) {
        // 在實際實作中，這裡可以使用 EventEmitter 或其他事件機制
        // 目前只是預留介面
    }
    /**
     * 檢查檔案是否需要重新索引
     */
    needsReindexing(filePath, currentModified) {
        const entry = this.fileEntries.get(filePath);
        if (!entry) {
            return true; // 檔案不在索引中，需要索引
        }
        if (!entry.isIndexed) {
            return true; // 尚未被索引
        }
        // 檢查檔案修改時間
        const currentTime = currentModified.getTime();
        const indexedTime = entry.fileInfo.lastModified.getTime();
        const timeDiff = currentTime - indexedTime;
        // 只有當檔案確實變新時才需要重新索引
        return timeDiff > 0;
    }
    /**
     * 更新檔案資訊（不影響符號和依賴）
     */
    async updateFileInfo(filePath, newFileInfo) {
        const entry = this.fileEntries.get(filePath);
        if (!entry) {
            throw new Error(`檔案不存在於索引中: ${filePath}`);
        }
        const updatedEntry = {
            ...entry,
            fileInfo: newFileInfo
        };
        this.fileEntries.set(filePath, updatedEntry);
        this.lastUpdated = new Date();
    }
    /**
     * 設定檔案的解析錯誤
     */
    async setFileParseErrors(filePath, errors) {
        const entry = this.fileEntries.get(filePath);
        if (!entry) {
            throw new Error(`檔案不存在於索引中: ${filePath}`);
        }
        const updatedEntry = {
            ...entry,
            parseErrors: [...errors]
        };
        this.fileEntries.set(filePath, updatedEntry);
        this.lastUpdated = new Date();
    }
    /**
     * 取得檔案的解析錯誤
     */
    getFileParseErrors(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry?.parseErrors || [];
    }
    /**
     * 檢查檔案是否有解析錯誤
     */
    hasFileParseErrors(filePath) {
        const entry = this.fileEntries.get(filePath);
        return entry ? entry.parseErrors.length > 0 : false;
    }
}
//# sourceMappingURL=file-index.js.map