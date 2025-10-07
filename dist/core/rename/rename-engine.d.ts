/**
 * 重新命名引擎實作
 * 負責執行符號重新命名操作
 */
import { RenameOptions, RenameResult, RenameOperation, RenamePreview, ValidationResult, BatchRenameResult, ConflictInfo } from './types.js';
import { Symbol } from '../../shared/types/symbol.js';
/**
 * 重新命名引擎類別
 */
export declare class RenameEngine {
    private readonly renameHistory;
    private readonly reservedKeywords;
    private readonly scopeAnalyzer;
    private readonly referenceUpdater;
    constructor();
    /**
     * 查找符號的所有引用
     */
    findReferences(filePaths: string[], symbol: Symbol, position?: {
        line: number;
        column: number;
    }): Promise<Array<{
        filePath: string;
        line: number;
        column: number;
        text: string;
    }>>;
    /**
     * 執行重新命名操作
     */
    rename(options: RenameOptions): Promise<RenameResult>;
    /**
     * 驗證重新命名操作的有效性
     */
    validateRename(options: RenameOptions): Promise<ValidationResult>;
    /**
     * 預覽重新命名操作
     */
    previewRename(options: RenameOptions): Promise<RenamePreview>;
    /**
     * 批次重新命名操作
     */
    batchRename(operations: RenameOperation[]): Promise<BatchRenameResult>;
    /**
     * 撤銷重新命名操作
     */
    undo(renameId: string): Promise<void>;
    /**
     * 檢測命名衝突
     */
    detectConflicts(newName: string, scope: any): ConflictInfo[];
    /**
     * 執行跨檔案重新命名
     */
    renameAcrossFiles(symbol: Symbol, newName: string, projectFiles: string[]): Promise<RenameResult>;
    /**
     * 驗證選項
     */
    private validateOptions;
    /**
     * 檢查是否為有效識別符
     */
    private isValidIdentifier;
    /**
     * 產生重新命名 ID
     */
    private generateRenameId;
}
//# sourceMappingURL=rename-engine.d.ts.map