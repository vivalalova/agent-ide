/**
 * 重複程式碼檢測器
 * 檢測程式碼克隆，包括 Type-1、Type-2 和 Type-3 克隆
 */
export interface CodeFragment {
    id: string;
    ast: ASTNode;
    tokens: string[];
    location: {
        file: string;
        startLine: number;
        endLine: number;
    };
    hash?: string;
}
export interface Clone {
    type: 'type-1' | 'type-2' | 'type-3';
    instances: CodeFragment[];
    lines: number;
    similarity: number;
    severity: 'low' | 'medium' | 'high';
}
export interface ASTNode {
    type: string;
    value?: string | number;
    children?: ASTNode[];
    normalized?: ASTNode;
}
export interface DetectionConfig {
    minLines: number;
    minTokens: number;
    similarityThreshold: number;
    ignoreWhitespace: boolean;
    ignoreComments: boolean;
}
/**
 * Type-1 克隆檢測器（完全相同的代碼，除了空白和註釋）
 */
export declare class Type1CloneDetector {
    /**
     * 檢測 Type-1 克隆
     * @param fragments 程式碼片段列表
     * @param config 檢測配置
     * @returns Type-1 克隆列表
     */
    detect(fragments: CodeFragment[], config: DetectionConfig): Clone[];
    /**
     * 計算程式碼片段的 hash
     */
    private computeHash;
    private calculateAverageLines;
    private calculateSeverity;
}
/**
 * Type-2 克隆檢測器（結構相同但變數名、類型、字面值不同）
 */
export declare class Type2CloneDetector {
    /**
     * 檢測 Type-2 克隆
     */
    detect(fragments: CodeFragment[], config: DetectionConfig): Clone[];
    /**
     * 正規化 AST（移除變數名、字面值等）
     */
    private normalizeAST;
    /**
     * 計算正規化 AST 的 hash
     */
    private computeNormalizedHash;
    private calculateAverageLines;
    private calculateSimilarity;
    private calculateSeverity;
}
/**
 * Type-3 克隆檢測器（結構相似但有些語句被修改、新增或刪除）
 */
export declare class Type3CloneDetector {
    private threshold;
    /**
     * 設定相似度閾值
     */
    setThreshold(threshold: number): void;
    /**
     * 檢測 Type-3 克隆
     */
    detect(fragments: CodeFragment[], config: DetectionConfig): Clone[];
    /**
     * 計算兩個程式碼片段的相似度
     */
    private calculateSimilarity;
    /**
     * 計算編輯距離（Levenshtein Distance）
     */
    private calculateEditDistance;
    /**
     * 改進的相似度計算（結合多種指標）
     */
    private calculateAdvancedSimilarity;
    private calculateSeverity;
}
/**
 * 重複程式碼檢測器主類
 */
export declare class DuplicationDetector {
    private type1Detector;
    private type2Detector;
    private type3Detector;
    /**
     * 設定 Type-3 檢測的相似度閾值
     */
    setThreshold(threshold: number): void;
    /**
     * 檢測程式碼克隆 (兼容舊介面)
     */
    detectClones(fragments: CodeFragment[]): Clone[];
    /**
     * 檢測檔案中的重複程式碼
     * @param files 檔案路徑列表
     * @param config 檢測配置
     * @returns 重複程式碼檢測結果
     */
    detect(files: string[], config?: Partial<DetectionConfig>): Promise<Clone[]>;
    /**
     * 從檔案中提取程式碼片段
     */
    private extractFragments;
    /**
     * 將檔案內容解析為程式碼片段
     */
    private parseFileToFragments;
    /**
     * 簡化的 AST 解析
     */
    private parseToAST;
    /**
     * 程式碼分詞
     */
    private tokenize;
    /**
     * 獲取重複檢測統計
     */
    getStatistics(clones: Clone[]): Promise<{
        totalClones: number;
        byType: Record<string, number>;
        bySeverity: Record<string, number>;
        averageSimilarity: number;
        totalDuplicatedLines: number;
    }>;
}
//# sourceMappingURL=duplication-detector.d.ts.map