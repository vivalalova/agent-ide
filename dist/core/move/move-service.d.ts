/**
 * 檔案移動服務
 * 提供安全的檔案移動功能，自動更新所有相關的 import 路徑
 */
import { ImportResolver } from './import-resolver.js';
import { MoveOperation, MoveOptions, MoveResult, ImportResolverConfig } from './types.js';
export declare class MoveService {
    private importResolver;
    constructor(config?: ImportResolverConfig, importResolver?: ImportResolver);
    /**
     * 移動檔案或目錄
     */
    moveFile(operation: MoveOperation, options?: MoveOptions): Promise<MoveResult>;
    /**
     * 驗證路徑
     */
    private validatePaths;
    /**
     * 執行實際的檔案移動
     */
    private performMove;
    /**
     * 找出受影響的檔案
     */
    private findAffectedFiles;
    /**
     * 獲取專案中的所有檔案
     */
    private getAllProjectFiles;
    /**
     * 檢查檔案是否引用了指定路徑
     */
    private fileReferencesPath;
    /**
     * 解析 import 路徑為絕對路徑
     */
    private resolveImportPath;
    /**
     * 檢查兩個路徑是否指向同一個檔案
     */
    private pathsMatch;
    /**
     * 移除檔案副檔名
     */
    private removeExtension;
    /**
     * 計算路徑更新
     */
    private calculatePathUpdates;
    /**
     * 計算新的 import 路徑
     */
    private calculateNewImportPath;
    /**
     * 應用路徑更新
     */
    private applyPathUpdates;
    /**
     * 應用單一檔案的更新
     */
    private applyFileUpdates;
    /**
     * 跳脫正則表達式特殊字元
     */
    private escapeRegex;
}
//# sourceMappingURL=move-service.d.ts.map