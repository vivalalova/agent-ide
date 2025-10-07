/**
 * 作用域分析器實作
 * 負責分析程式碼的作用域結構和符號可見性
 */
import { AST } from '../../shared/types/ast.js';
import { Position } from '../../shared/types/core.js';
import { ScopeAnalysisResult, ShadowedVariable } from './types.js';
/**
 * 作用域分析器類別
 */
export declare class ScopeAnalyzer {
    private currentScopes;
    private symbolTable;
    /**
     * 分析 AST 的作用域結構
     */
    analyzeScopes(ast: AST): Promise<ScopeAnalysisResult[]>;
    /**
     * 尋找被遮蔽的變數
     */
    findShadowedVariables(ast: AST): Promise<ShadowedVariable[]>;
    /**
     * 根據位置取得對應的作用域
     */
    getScopeAtPosition(position: Position): Promise<ScopeAnalysisResult | null>;
    /**
     * 檢查符號在特定作用域中是否可見
     */
    isSymbolVisible(symbolName: string, scope: ScopeAnalysisResult): Promise<boolean>;
    /**
     * 遞歸分析 AST 節點
     */
    private analyzeNode;
    /**
     * 檢查是否應該為節點建立新的作用域
     */
    private shouldCreateScope;
    /**
     * 為節點建立作用域
     */
    private createScope;
    /**
     * 取得作用域類型
     */
    private getScopeType;
    /**
     * 檢查是否為符號定義
     */
    private isSymbolDefinition;
    /**
     * 從 AST 節點建立符號
     */
    private createSymbolFromNode;
    /**
     * 取得符號類型
     */
    private getSymbolType;
    /**
     * 添加符號到符號表
     */
    private addToSymbolTable;
    /**
     * 找到遮蔽指定符號的其他符號
     */
    private findShadowingSymbols;
    /**
     * 檢查是否為子作用域
     */
    private isChildScope;
    /**
     * 取得作用域深度
     */
    private getScopeDepth;
}
//# sourceMappingURL=scope-analyzer.d.ts.map