/**
 * 提取函式重構器
 * 將選取的程式碼片段提取為獨立函式
 */
export interface Range {
    start: {
        line: number;
        column: number;
    };
    end: {
        line: number;
        column: number;
    };
}
export interface CodeEdit {
    range: Range;
    newText: string;
    type: 'replace' | 'insert' | 'delete';
}
export interface VariableInfo {
    name: string;
    type: string;
    isParameter: boolean;
    isReturned: boolean;
    scope: 'local' | 'closure' | 'global';
    usages: Range[];
}
export interface ExtractionResult {
    success: boolean;
    functionName: string;
    edits: CodeEdit[];
    parameters: VariableInfo[];
    returnType?: string;
    errors: string[];
    warnings: string[];
}
export interface ASTNode {
    type: string;
    start: number;
    end: number;
    loc: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };
    children?: ASTNode[];
    name?: string;
    value?: any;
    code?: string;
}
export interface ExtractConfig {
    functionName?: string;
    generateComments: boolean;
    preserveFormatting: boolean;
    validateExtraction: boolean;
    insertionPoint?: 'before' | 'after' | 'top';
}
/**
 * 函式提取分析器
 * 分析選取的程式碼是否適合提取為函式
 */
export declare class ExtractionAnalyzer {
    /**
     * 分析程式碼片段的可提取性
     */
    analyze(code: string, selection: Range): {
        canExtract: boolean;
        issues: string[];
        variables: VariableInfo[];
        dependencies: string[];
    };
    /**
     * 檢查提取限制
     */
    private checkExtractionConstraints;
    /**
     * 分析變數使用情況
     */
    private analyzeVariables;
    /**
     * 簡化的 AST 解析
     */
    private parseCode;
    /**
     * 遍歷 AST
     */
    private traverse;
    /**
     * 檢查是否包含 return 語句
     */
    private containsReturn;
    /**
     * 檢查是否包含跳躍語句
     */
    private containsJumpStatement;
    /**
     * 檢查是否為完整語句
     */
    private isCompleteStatements;
    /**
     * 檢查是否包含函式定義
     */
    private containsFunctionDefinition;
    /**
     * 找出依賴項
     */
    private findDependencies;
}
/**
 * 函式提取器主類
 */
export declare class FunctionExtractor {
    private analyzer;
    /**
     * 提取函式 (別名，保持向後相容)
     * 支援兩種呼叫方式：
     * 1. extractFunction(code, selection, config)
     * 2. extractFunction(code, start, end, name) - 舊格式
     */
    extractFunction(code: string, selectionOrStart: Range | number, configOrEnd?: ExtractConfig | number, nameOrUndefined?: string): Promise<ExtractionResult>;
    /**
     * 提取函式
     */
    extract(code: string, selection: Range, config?: ExtractConfig): Promise<ExtractionResult>;
    /**
     * 驗證範圍格式
     */
    private isValidRange;
    /**
     * 提取選取的程式碼
     */
    private extractSelectedCode;
    /**
     * 產生函式名稱
     */
    private generateFunctionName;
    /**
     * 產生函式程式碼
     */
    private generateFunction;
    /**
     * 產生編輯操作
     */
    private generateEdits;
    /**
     * 批次提取
     */
    extractMultiple(extractions: Array<{
        code: string;
        selection: Range;
        config?: ExtractConfig;
    }>): Promise<ExtractionResult[]>;
    /**
     * 預覽提取結果
     */
    preview(code: string, selection: Range, config?: ExtractConfig): Promise<{
        originalCode: string;
        modifiedCode: string;
        functionCode: string;
    }>;
    /**
     * 應用編輯操作
     */
    private applyEdit;
    /**
     * 將範圍轉換為偏移量
     */
    private rangeToOffset;
}
//# sourceMappingURL=extract-function.d.ts.map