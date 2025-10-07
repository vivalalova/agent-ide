/**
 * 索引引擎實作
 * 程式碼索引系統的核心引擎，協調檔案索引和符號索引
 */
import type { Symbol, SymbolType } from '../../shared/types/index.js';
import type { IndexConfig, IndexStats, FileInfo, SymbolSearchResult, SearchOptions } from './types.js';
/**
 * 索引引擎類別
 * 協調檔案索引、符號索引和解析器的核心引擎
 */
export declare class IndexEngine {
    private readonly config;
    private readonly fileIndex;
    private readonly symbolIndex;
    private readonly parserRegistry;
    private _disposed;
    private _indexed;
    constructor(config: IndexConfig);
    /**
     * 驗證配置
     */
    private validateConfig;
    /**
     * 索引整個專案
     */
    indexProject(projectPath?: string | any): Promise<void>;
    /**
     * 索引目錄
     */
    indexDirectory(dirPath: string): Promise<void>;
    /**
     * 索引單一檔案
     */
    indexFile(filePath: string): Promise<void>;
    /**
     * 更新檔案索引
     */
    updateFile(filePath: string): Promise<void>;
    /**
     * 移除檔案索引
     */
    removeFile(filePath: string): Promise<void>;
    /**
     * 根據名稱查找符號
     */
    findSymbol(name: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 根據類型查找符號
     */
    findSymbolByType(type: SymbolType, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 模糊搜尋符號
     */
    searchSymbols(pattern: string, options?: SearchOptions): Promise<SymbolSearchResult[]>;
    /**
     * 根據副檔名查找檔案
     */
    findFilesByExtension(ext: string): readonly FileInfo[];
    /**
     * 檢查檔案是否已被索引
     */
    isIndexed(filePath: string): boolean;
    /**
     * 取得索引統計資訊
     */
    getStats(): Promise<IndexStats>;
    /**
     * 取得配置
     */
    getConfig(): IndexConfig;
    /**
     * 清空所有索引
     */
    clear(): Promise<void>;
    /**
     * 批次索引檔案
     */
    private batchIndexFiles;
    /**
     * 從檔案統計資訊建立 FileInfo
     */
    private createFileInfoFromStat;
    /**
     * 根據副檔名判斷語言
     */
    private getLanguageFromExtension;
    /**
     * 檢查檔案是否需要重新索引
     */
    needsReindexing(filePath: string): Promise<boolean>;
    /**
     * 取得檔案的解析錯誤
     */
    getFileParseErrors(filePath: string): readonly string[];
    /**
     * 檢查檔案是否有解析錯誤
     */
    hasFileParseErrors(filePath: string): boolean;
    /**
     * 取得所有已索引的檔案
     */
    getAllIndexedFiles(): readonly FileInfo[];
    /**
     * 根據語言查找檔案
     */
    findFilesByLanguage(language: string): readonly FileInfo[];
    /**
     * 取得檔案的所有符號
     */
    getFileSymbols(filePath: string): Promise<readonly Symbol[]>;
    /**
     * 釋放資源
     */
    dispose(): void;
    /**
     * 檢查索引是否已被釋放或尚未建立
     */
    private checkDisposed;
}
//# sourceMappingURL=index-engine.d.ts.map