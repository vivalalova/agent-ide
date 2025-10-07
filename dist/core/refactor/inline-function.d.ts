/**
 * 內聯函式重構器
 * 將函式呼叫替換為函式內容
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
export interface FunctionDefinition {
    name: string;
    parameters: string[];
    body: string;
    returnType?: string;
    location: Range;
    isArrow: boolean;
    isAsync: boolean;
}
export interface FunctionCall {
    name: string;
    arguments: string[];
    location: Range;
    assignTo?: string;
    isAwait: boolean;
}
export interface InlineResult {
    success: boolean;
    functionName: string;
    edits: CodeEdit[];
    inlinedCallsCount: number;
    removedFunction: boolean;
    errors: string[];
    warnings: string[];
}
export interface InlineConfig {
    removeFunction: boolean;
    preserveComments: boolean;
    validateInlining: boolean;
    inlineAllCalls: boolean;
    maxComplexity?: number;
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
    body?: ASTNode;
    params?: ASTNode[];
    arguments?: ASTNode[];
}
/**
 * 內聯分析器
 * 分析函式是否適合內聯
 */
export declare class InlineAnalyzer {
    /**
     * 分析函式的可內聯性
     */
    analyze(functionDef: FunctionDefinition, calls: FunctionCall[]): {
        canInline: boolean;
        issues: string[];
        complexity: number;
        callsCount: number;
        estimatedSizeIncrease: number;
    };
    /**
     * 計算函式複雜度（簡化版）
     */
    private calculateComplexity;
    /**
     * 檢查內聯限制
     */
    private checkInlineConstraints;
    /**
     * 檢查呼叫相容性
     */
    private checkCallCompatibility;
    /**
     * 檢查是否為遞迴函式
     */
    private isRecursive;
    /**
     * 檢查是否使用 arguments
     */
    private usesArguments;
    /**
     * 檢查是否使用 this
     */
    private usesThis;
    /**
     * 找出名稱衝突
     */
    private findNameConflicts;
}
/**
 * 函式內聯器主類
 */
export declare class FunctionInliner {
    private analyzer;
    /**
     * 內聯函式
     */
    inline(code: string, functionName: string, config?: InlineConfig): Promise<InlineResult>;
    /**
     * 找出函式定義
     */
    private findFunctionDefinition;
    /**
     * 找出函式呼叫
     */
    private findFunctionCalls;
    /**
     * 獲取匹配的位置資訊
     */
    private getMatchLocation;
    /**
     * 將偏移量轉換為行列位置
     */
    private offsetToPosition;
    /**
     * 生成內聯編輯操作
     */
    private generateInlineEdits;
    /**
     * 生成內聯程式碼
     */
    private generateInlinedCode;
    /**
     * 預覽內聯結果
     */
    preview(code: string, functionName: string, config?: InlineConfig): Promise<{
        originalCode: string;
        modifiedCode: string;
        removedFunction: string;
        changesCount: number;
    }>;
    /**
     * 批次內聯多個函式
     */
    inlineMultiple(code: string, functionNames: string[], config?: InlineConfig): Promise<{
        code: string;
        results: InlineResult[];
    }>;
    /**
     * 應用編輯操作
     */
    private applyEdit;
    /**
     * 將位置轉換為偏移量
     */
    private positionToOffset;
}
//# sourceMappingURL=inline-function.d.ts.map