/**
 * 程式碼品質評估器
 * 提供可維護性指數計算、程式碼異味檢測等功能
 */
export interface CodeMetrics {
    halsteadVolume: number;
    cyclomaticComplexity: number;
    linesOfCode: number;
    methodCount: number;
    fieldCount: number;
    parameterCount: number;
}
export interface CodeSmell {
    type: string;
    location: {
        line: number;
        column: number;
    };
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestion: string;
}
export interface QualityAssessment {
    maintainabilityIndex: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    codeSmells: CodeSmell[];
    metrics: CodeMetrics;
    overallScore: number;
}
/**
 * 可維護性指數計算器
 * 基於 Microsoft Visual Studio 公式
 */
export declare class MaintainabilityIndex {
    /**
     * 計算可維護性指數
     * @param metrics 程式碼度量
     * @returns 可維護性指數 (0-171)
     */
    calculate(metrics: CodeMetrics): number;
    /**
     * 將可維護性指數轉換為等級
     */
    getGrade(maintainabilityIndex: number): 'A' | 'B' | 'C' | 'D' | 'F';
    /**
     * 獲取可維護性描述
     */
    getDescription(grade: string): string;
}
/**
 * Halstead 複雜度計算器
 */
export declare class HalsteadComplexity {
    /**
     * 計算 Halstead 複雜度
     * @param code 程式碼字串
     * @returns Halstead 複雜度指標
     */
    calculate(code: string): {
        volume: number;
        difficulty: number;
        effort: number;
        timeToProgram: number;
        bugsEstimate: number;
    };
    /**
     * 提取運算子
     */
    private extractOperators;
    /**
     * 提取操作數
     */
    private extractOperands;
}
/**
 * 程式碼異味檢測器
 */
export declare class CodeSmellDetector {
    /**
     * 檢測程式碼異味
     * @param code 程式碼字串
     * @param metrics 程式碼度量
     * @returns 程式碼異味列表
     */
    detect(code: string, metrics: CodeMetrics): CodeSmell[];
    /**
     * 檢測長方法
     */
    private detectLongMethod;
    /**
     * 檢測大類
     */
    private detectLargeClass;
    /**
     * 檢測長參數列表
     */
    private detectLongParameterList;
    /**
     * 檢測重複程式碼
     */
    private detectDuplicateCode;
    /**
     * 檢測複雜條件
     */
    private detectComplexConditionals;
    /**
     * 檢測魔術數字
     */
    private detectMagicNumbers;
}
/**
 * 程式碼品質評估器主類
 */
export declare class QualityMetricsAnalyzer {
    private maintainabilityIndex;
    private halsteadComplexity;
    private codeSmellDetector;
    /**
     * 評估程式碼品質
     * @param code 程式碼字串
     * @returns 品質評估結果
     */
    assess(code: string): Promise<QualityAssessment>;
    /**
     * 計算程式碼度量
     */
    private calculateMetrics;
    /**
     * 計算循環複雜度
     */
    private calculateCyclomaticComplexity;
    /**
     * 計算平均參數數量
     */
    private calculateAverageParameterCount;
    /**
     * 計算綜合評分
     */
    private calculateOverallScore;
    /**
     * 批次評估多個檔案
     */
    assessFiles(files: string[]): Promise<Array<{
        file: string;
        assessment: QualityAssessment;
    }>>;
    /**
     * 獲取專案整體品質報告
     */
    getProjectReport(files: string[]): Promise<{
        averageMaintainabilityIndex: number;
        gradeDistribution: Record<string, number>;
        totalCodeSmells: number;
        smellsByType: Record<string, number>;
        topIssues: CodeSmell[];
    }>;
}
//# sourceMappingURL=quality-metrics.d.ts.map