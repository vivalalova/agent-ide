/**
 * 死代碼檢測器
 * 檢測未使用的變數、函式、類別和不可達代碼
 */
export interface Symbol {
    name: string;
    type: 'variable' | 'function' | 'class' | 'import';
    location: {
        line: number;
        column: number;
    };
    references: Reference[];
    exported: boolean;
    parameter: boolean;
}
export interface Reference {
    location: {
        line: number;
        column: number;
    };
    type: 'read' | 'write' | 'call';
}
export interface UnusedCode {
    type: 'variable' | 'function' | 'class' | 'import' | 'unreachable';
    name?: string;
    location: {
        line: number;
        column: number;
    };
    confidence: number;
    reason?: string;
}
export interface ASTNode {
    type: string;
    children?: ASTNode[];
    location: {
        line: number;
        column: number;
    };
    isTerminator?: boolean;
    name?: string;
    exported?: boolean;
}
/**
 * 未使用符號檢測器
 */
export declare class UnusedSymbolDetector {
    /**
     * 檢測未使用的符號
     * @param symbols 符號表
     * @returns 未使用的符號列表
     */
    detect(symbols: Symbol[]): UnusedCode[];
    /**
     * 計算檢測置信度
     */
    private calculateConfidence;
}
/**
 * 不可達代碼檢測器
 */
export declare class UnreachableCodeDetector {
    /**
     * 檢測不可達代碼
     * @param ast AST 根節點
     * @returns 不可達代碼列表
     */
    detect(ast: ASTNode): UnusedCode[];
    /**
     * 遍歷 AST 檢測不可達代碼
     */
    private traverse;
    /**
     * 檢查是否為可執行語句
     */
    private isExecutableStatement;
    /**
     * 檢查是否為終止語句
     */
    private isTerminatingStatement;
}
/**
 * 死代碼檢測器主類
 */
export declare class DeadCodeDetector {
    private unusedSymbolDetector;
    private unreachableCodeDetector;
    /**
     * 檢測檔案中的死代碼
     * @param filePath 檔案路徑
     * @param content 檔案內容
     * @returns 死代碼檢測結果
     */
    detectInFile(filePath: string, content: string): Promise<UnusedCode[]>;
    /**
     * 批次檢測多個檔案
     * @param files 檔案路徑列表
     * @returns 每個檔案的死代碼檢測結果
     */
    detectInFiles(files: string[]): Promise<Array<{
        file: string;
        deadCode: UnusedCode[];
    }>>;
    /**
     * 簡化的程式碼解析
     * 實際實作中應該使用完整的 TypeScript 或 JavaScript parser
     */
    private parseCode;
    /**
     * 查找符號引用
     */
    private findReferences;
    /**
     * 獲取檢測統計
     */
    getStatistics(files: string[]): Promise<{
        totalFiles: number;
        totalDeadCode: number;
        byType: Record<string, number>;
        averageConfidence: number;
    }>;
}
//# sourceMappingURL=dead-code-detector.d.ts.map