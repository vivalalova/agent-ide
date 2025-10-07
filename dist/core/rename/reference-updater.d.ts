/**
 * 引用更新器實作
 * 負責更新程式碼中的符號引用
 */
import { UpdateResult, SymbolReference, RenameOperation } from './types.js';
import { Symbol } from '../../shared/types/symbol.js';
/**
 * 引用更新器類別
 */
export declare class ReferenceUpdater {
    private readonly fileCache;
    /**
     * 更新所有引用
     */
    updateReferences(symbol: Symbol, newName: string, filePaths: string[]): Promise<UpdateResult>;
    /**
     * 批次執行重新命名操作
     */
    applyRenameOperations(operations: RenameOperation[]): Promise<UpdateResult>;
    /**
     * 尋找檔案中的符號引用
     */
    findSymbolReferences(filePath: string, symbolName: string): Promise<SymbolReference[]>;
    /**
     * 處理跨檔案引用
     */
    updateCrossFileReferences(symbol: Symbol, newName: string, projectFiles: string[]): Promise<UpdateResult>;
    /**
     * 更新檔案中的引用
     */
    private updateFileReferences;
    /**
     * 對檔案應用重新命名操作
     */
    private applyFileOperations;
    /**
     * 找出包含符號引用的檔案
     */
    private findReferencingFiles;
    /**
     * 更新 import 語句
     */
    private updateImportStatements;
    /**
     * 更新使用引用
     */
    private updateUsageReferences;
    /**
     * 取得檔案內容
     */
    private getFileContent;
    /**
     * 寫入檔案內容
     */
    private writeFileContent;
    /**
     * 對內容應用變更
     */
    private applyChangesToContent;
    /**
     * 應用單一變更
     */
    private applySingleChange;
    /**
     * 檢查是否在註解中
     */
    private isInComment;
    /**
     * 逸出正則表達式特殊字符
     */
    private escapeRegex;
    /**
     * 清除快取
     */
    clearCache(): void;
}
//# sourceMappingURL=reference-updater.d.ts.map