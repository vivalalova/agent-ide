/**
 * Performance Analyzer 實作
 * 提供檔案和專案級別的效能分析功能
 */
import { PerformanceAnalyzer, PerformanceAnalysisConfig, PerformanceAnalysisResult, FilePerformanceInfo, PerformanceIssue } from './interfaces.js';
/**
 * 預設效能分析配置
 */
export declare const DEFAULT_PERFORMANCE_CONFIG: PerformanceAnalysisConfig;
/**
 * 預設效能分析器實作
 */
export declare class DefaultPerformanceAnalyzer implements PerformanceAnalyzer {
    private parserRegistry;
    private analysisCache;
    constructor();
    /**
     * 分析檔案效能
     */
    analyzeFile(filePath: string, config?: PerformanceAnalysisConfig): Promise<FilePerformanceInfo>;
    /**
     * 分析專案效能
     */
    analyzeProject(projectPath: string, config?: PerformanceAnalysisConfig): Promise<PerformanceAnalysisResult>;
    /**
     * 檢測效能問題
     */
    detectIssues(fileInfo: FilePerformanceInfo, config: PerformanceAnalysisConfig): PerformanceIssue[];
    /**
     * 內部檔案分析實作
     */
    private analyzeFileInternal;
    /**
     * 獲取所有程式碼檔案
     */
    private getAllCodeFiles;
    /**
     * 計算嵌套深度
     */
    private calculateNestingDepth;
    /**
     * 計算循環複雜度（簡化版本）
     */
    private calculateCyclomaticComplexity;
    /**
     * 計算嚴重程度
     */
    private calculateSeverity;
    /**
     * 計算專案統計摘要
     */
    private calculateSummary;
    /**
     * 生成優化建議
     */
    private generateRecommendations;
    /**
     * 清理快取
     */
    clearCache(): void;
}
//# sourceMappingURL=analyzer.d.ts.map