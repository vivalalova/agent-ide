/**
 * TypeScript Symbol Extractor
 * 從 TypeScript AST 中提取符號資訊
 */
import type { Symbol } from '../../shared/types/index.js';
import { TypeScriptAST } from './types.js';
/**
 * TypeScript 符號提取器類別
 */
export declare class TypeScriptSymbolExtractor {
    private symbols;
    private scopeStack;
    private sourceFile;
    /**
     * 從 AST 中提取所有符號
     */
    extractSymbols(ast: TypeScriptAST): Promise<Symbol[]>;
    /**
     * 遞歸訪問 AST 節點
     */
    private visitNode;
    /**
     * 處理作用域變化
     * 返回是否需要在處理完子節點後恢復作用域
     */
    private handleScopeChange;
    /**
     * 獲取當前作用域
     */
    private getCurrentScope;
    /**
     * 從節點提取符號
     */
    private extractSymbolFromNode;
    /**
     * 獲取符號類型
     */
    private getSymbolType;
    /**
     * 調整特殊情況的符號
     */
    private adjustSymbolForSpecialCases;
    /**
     * 提取型別資訊
     */
    private extractTypeInfo;
    /**
     * 提取函式簽名
     */
    private extractSignature;
    /**
     * 將型別節點轉換為字串
     */
    private typeNodeToString;
    /**
     * 從初始值推斷型別
     */
    private inferTypeFromInitializer;
    /**
     * 函式節點轉換為簽名字串
     */
    private functionNodeToSignature;
    /**
     * 檢查節點是否在函式或方法內部
     */
    private isInsideFunctionOrMethod;
    /**
     * 建構子節點轉換為簽名字串
     */
    private constructorNodeToSignature;
}
/**
 * 創建符號提取器實例
 */
export declare function createSymbolExtractor(): TypeScriptSymbolExtractor;
//# sourceMappingURL=symbol-extractor.d.ts.map