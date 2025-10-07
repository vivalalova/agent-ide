/**
 * 程式碼複雜度分析器
 * 提供循環複雜度和認知複雜度分析功能
 */
export interface ASTNode {
    type: string;
    children?: ASTNode[];
    operator?: string;
    default?: boolean;
}
export interface ComplexityResult {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    evaluation: string;
}
/**
 * 循環複雜度分析器
 * 基於 McCabe 複雜度計算方法
 */
export declare class CyclomaticComplexityAnalyzer {
    /**
     * 計算循環複雜度
     * @param ast AST 節點
     * @returns 複雜度數值
     */
    calculate(ast: ASTNode): number;
    /**
     * 評估複雜度等級
     * @param complexity 複雜度數值
     * @returns 複雜度等級
     */
    evaluate(complexity: number): string;
}
/**
 * 認知複雜度分析器
 * 考慮巢狀深度對程式碼理解難度的影響
 */
export declare class CognitiveComplexityAnalyzer {
    private nestingLevel;
    /**
     * 計算認知複雜度
     * @param ast AST 節點
     * @returns 認知複雜度數值
     */
    calculate(ast: ASTNode): number;
    /**
     * 檢查是否為遞歸調用
     */
    private isRecursive;
    /**
     * 評估認知複雜度等級
     */
    evaluate(complexity: number): string;
}
/**
 * 綜合複雜度分析器
 * 整合循環複雜度和認知複雜度分析
 */
export declare class ComplexityAnalyzer {
    private cyclomaticAnalyzer;
    private cognitiveAnalyzer;
    /**
     * 分析程式碼複雜度
     * @param code 程式碼字串
     * @returns 複雜度分析結果
     */
    analyzeCode(code: string): Promise<ComplexityResult>;
    /**
     * 簡化的程式碼解析為 AST
     * 實際實作中應該使用完整的 TypeScript 或 JavaScript parser
     */
    private parseCodeToAST;
    /**
     * 批次分析多個檔案的複雜度
     */
    analyzeFiles(files: string[]): Promise<Array<{
        file: string;
        complexity: ComplexityResult;
    }>>;
}
//# sourceMappingURL=complexity-analyzer.d.ts.map