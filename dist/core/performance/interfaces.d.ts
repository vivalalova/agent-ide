/**
 * Performance 模組介面定義
 * 定義效能分析的核心資料結構和介面
 */
/**
 * 效能指標
 */
export interface PerformanceMetrics {
    /** 執行時間（毫秒） */
    duration: number;
    /** 記憶體使用量（位元組） */
    memoryUsage: number;
    /** CPU 使用率（百分比） */
    cpuUsage?: number;
    /** 吞吐量（每秒操作數） */
    throughput?: number;
    /** 延遲（毫秒） */
    latency?: number;
}
/**
 * 檔案效能分析結果
 */
export interface FilePerformanceInfo {
    /** 檔案路徑 */
    filePath: string;
    /** 檔案大小（位元組） */
    fileSize: number;
    /** 解析時間（毫秒） */
    parseTime: number;
    /** 函式數量 */
    functionCount: number;
    /** 類別數量 */
    classCount: number;
    /** 長函式數量 */
    longFunctionCount: number;
    /** 嵌套深度 */
    nestingDepth: number;
    /** 循環複雜度 */
    cyclomaticComplexity: number;
}
/**
 * 效能問題類型
 */
export declare enum PerformanceIssueType {
    LARGE_FILE = "large_file",
    LONG_FUNCTION = "long_function",
    DEEP_NESTING = "deep_nesting",
    HIGH_COMPLEXITY = "high_complexity",
    NESTED_LOOPS = "nested_loops",
    MEMORY_INTENSIVE = "memory_intensive"
}
/**
 * 效能問題
 */
export interface PerformanceIssue {
    /** 問題類型 */
    type: PerformanceIssueType;
    /** 嚴重程度 (1-10) */
    severity: number;
    /** 檔案路徑 */
    filePath: string;
    /** 位置資訊 */
    location?: {
        line: number;
        column: number;
    };
    /** 問題描述 */
    message: string;
    /** 建議修復方案 */
    suggestions: string[];
    /** 指標值 */
    value: number;
    /** 閾值 */
    threshold: number;
}
/**
 * 效能分析配置
 */
export interface PerformanceAnalysisConfig {
    /** 大檔案閾值（位元組） */
    largeFileThreshold: number;
    /** 長函式閾值（行數） */
    longFunctionThreshold: number;
    /** 深度嵌套閾值 */
    deepNestingThreshold: number;
    /** 高複雜度閾值 */
    highComplexityThreshold: number;
    /** 記憶體限制（位元組） */
    memoryLimit?: number;
    /** 是否啟用詳細模式 */
    verbose: boolean;
    /** 是否啟用快取 */
    enableCache: boolean;
}
/**
 * 效能分析結果
 */
export interface PerformanceAnalysisResult {
    /** 分析指標 */
    metrics: PerformanceMetrics;
    /** 檔案分析結果 */
    fileResults: FilePerformanceInfo[];
    /** 發現的問題 */
    issues: PerformanceIssue[];
    /** 總結統計 */
    summary: {
        totalFiles: number;
        totalSize: number;
        averageFileSize: number;
        largeFileCount: number;
        longFunctionCount: number;
        highComplexityCount: number;
        overallScore: number;
    };
    /** 建議 */
    recommendations: string[];
}
/**
 * 記憶體快照
 */
export interface MemorySnapshot {
    /** 快照時間 */
    timestamp: Date;
    /** 堆記憶體使用量 */
    heapUsed: number;
    /** 堆記憶體總量 */
    heapTotal: number;
    /** 常駐集記憶體 */
    rss: number;
    /** 外部記憶體 */
    external: number;
    /** 陣列緩衝區 */
    arrayBuffers: number;
}
/**
 * 快取統計
 */
export interface CacheStatistics {
    /** 快取命中次數 */
    hits: number;
    /** 快取未命中次數 */
    misses: number;
    /** 快取命中率 */
    hitRate: number;
    /** 快取大小 */
    size: number;
    /** 快取項目數 */
    itemCount: number;
}
/**
 * 效能監控器介面
 */
export interface PerformanceMonitor {
    /**
     * 開始監控
     */
    start(): void;
    /**
     * 停止監控
     */
    stop(): PerformanceMetrics;
    /**
     * 記錄記憶體快照
     */
    recordMemorySnapshot(): MemorySnapshot;
    /**
     * 獲取當前指標
     */
    getCurrentMetrics(): PerformanceMetrics;
}
/**
 * 效能分析器介面
 */
export interface PerformanceAnalyzer {
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
}
//# sourceMappingURL=interfaces.d.ts.map