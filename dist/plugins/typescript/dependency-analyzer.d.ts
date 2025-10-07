/**
 * TypeScript Dependency Analyzer
 * 分析 TypeScript 程式碼中的依賴關係
 */
import type { Dependency } from '../../shared/types/index.js';
import { TypeScriptAST } from './types.js';
/**
 * TypeScript 依賴分析器類別
 */
export declare class TypeScriptDependencyAnalyzer {
    private dependencies;
    private sourceFile;
    /**
     * 從 AST 中提取所有依賴關係
     */
    extractDependencies(ast: TypeScriptAST): Promise<Dependency[]>;
    /**
     * 遞歸訪問 AST 節點
     */
    private visitNode;
    /**
     * 從節點提取依賴資訊
     */
    private extractDependencyFromNode;
    /**
     * 從 import 宣告提取依賴
     */
    private extractFromImportDeclaration;
    /**
     * 從 export 宣告提取依賴（重新匯出的情況）
     */
    private extractFromExportDeclaration;
    /**
     * 從 import = 宣告提取依賴
     */
    private extractFromImportEquals;
    /**
     * 從函式呼叫提取依賴（require, import()）
     */
    private extractFromCallExpression;
    /**
     * 從 require() 呼叫提取依賴
     */
    private extractFromRequireCall;
    /**
     * 從動態 import() 提取依賴
     */
    private extractFromDynamicImport;
    /**
     * 獲取 export 宣告的符號
     */
    private getExportedSymbols;
    /**
     * 獲取 require 導入的符號
     */
    private getRequireImportedSymbols;
    /**
     * 提取三斜線指令依賴
     */
    private extractTripleSlashDirectives;
    /**
     * 檢查模組解析結果並標準化路徑
     */
    private normalizePath;
    /**
     * 獲取依賴的型別（開發依賴還是執行時依賴）
     */
    private getDependencyCategory;
    /**
     * 分析循環依賴
     */
    analyzeCyclicDependencies(dependencies: Dependency[]): Promise<string[][]>;
}
/**
 * 創建依賴分析器實例
 */
export declare function createDependencyAnalyzer(): TypeScriptDependencyAnalyzer;
//# sourceMappingURL=dependency-analyzer.d.ts.map