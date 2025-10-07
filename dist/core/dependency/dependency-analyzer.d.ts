/**
 * 依賴關係分析器
 * 分析檔案和專案的依賴關係，提供影響分析和統計功能
 */
import type { FileDependencies, ProjectDependencies, DependencyStats, ImpactAnalysisResult, DependencyQueryOptions, ExtendedDependencyAnalysisOptions } from './types.js';
/**
 * 依賴關係分析器類別
 */
export declare class DependencyAnalyzer {
    private graph;
    private cycleDetector;
    private cache;
    private options;
    constructor(options?: Partial<ExtendedDependencyAnalysisOptions>);
    /**
     * 分析單個檔案的依賴關係
     * @param filePath 檔案路徑
     * @returns 檔案依賴資訊
     */
    analyzeFile(filePath: string): Promise<FileDependencies>;
    /**
     * 分析整個專案的依賴關係
     * @param projectPath 專案路徑
     * @returns 專案依賴資訊
     */
    analyzeProject(projectPath: string): Promise<ProjectDependencies>;
    /**
     * 取得檔案的直接依賴
     * @param filePath 檔案路徑
     * @returns 依賴列表
     */
    getDependencies(filePath: string): string[];
    /**
     * 取得檔案的直接依賴者
     * @param filePath 檔案路徑
     * @returns 依賴者列表
     */
    getDependents(filePath: string): string[];
    /**
     * 取得檔案的傳遞依賴
     * @param filePath 檔案路徑
     * @param options 查詢選項
     * @returns 傳遞依賴列表
     */
    getTransitiveDependencies(filePath: string, options?: DependencyQueryOptions): string[];
    /**
     * 取得檔案變更的影響範圍
     * @param filePath 檔案路徑
     * @returns 受影響的檔案列表
     */
    getImpactedFiles(filePath: string): string[];
    /**
     * 取得詳細的影響分析結果
     * @param filePath 檔案路徑
     * @returns 影響分析結果
     */
    getImpactAnalysis(filePath: string): ImpactAnalysisResult;
    /**
     * 取得受影響的測試檔案
     * @param filePath 檔案路徑
     * @returns 測試檔案列表
     */
    getAffectedTests(filePath: string): string[];
    /**
     * 取得依賴統計資訊
     * @returns 統計資訊
     */
    getStats(): DependencyStats;
    /**
     * 從檔案內容中提取依賴關係
     * @param content 檔案內容
     * @param filePath 檔案路徑
     * @returns 依賴列表
     */
    private extractDependencies;
    /**
     * 解析路徑
     * @param importPath 匯入路徑
     * @param fromFile 來源檔案
     * @returns 解析結果
     */
    private resolvePath;
    /**
     * 更新依賴圖
     * @param fileDependencies 檔案依賴資訊
     */
    private updateDependencyGraph;
    /**
     * 找出專案中的原始檔案
     * @param projectPath 專案路徑
     * @returns 檔案路徑列表
     */
    private findSourceFiles;
    /**
     * 檢查檔案是否應該被排除
     * @param filePath 檔案路徑
     * @returns 是否排除
     */
    private isExcluded;
    /**
     * 檢查檔案是否應該被包含
     * @param filePath 檔案路徑
     * @returns 是否包含
     */
    private isIncluded;
    /**
     * 簡單的 glob 模式匹配
     * @param filePath 檔案路徑
     * @param pattern glob 模式
     * @returns 是否匹配
     */
    private matchGlob;
    /**
     * 檢查是否應該包含此依賴
     * @param resolvedPath 解析後的路徑
     * @returns 是否包含
     */
    private shouldIncludeDependency;
    /**
     * 檢查是否為測試檔案
     * @param filePath 檔案路徑
     * @returns 是否為測試檔案
     */
    private isTestFile;
    /**
     * 計算影響分數
     * @param directAffected 直接影響數量
     * @param transitiveAffected 傳遞影響數量
     * @param testAffected 測試影響數量
     * @returns 影響分數
     */
    private calculateImpactScore;
    /**
     * 將陣列分塊
     * @param array 原陣列
     * @param size 塊大小
     * @returns 分塊後的陣列
     */
    private chunkArray;
    /**
     * 建立預設分析選項
     * @returns 預設選項
     */
    private createDefaultAnalysisOptions;
    /**
     * 取得預設查詢選項
     * @param options 使用者選項
     * @returns 合併後的選項
     */
    private getDefaultQueryOptions;
}
//# sourceMappingURL=dependency-analyzer.d.ts.map