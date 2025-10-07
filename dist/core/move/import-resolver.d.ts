/**
 * Import 解析器
 * 負責解析和更新程式碼中的 import 語句
 */
import { ImportStatement, ImportResolverConfig, ImportUpdate } from './types.js';
export declare class ImportResolver {
    private readonly config;
    constructor(config: ImportResolverConfig);
    /**
     * 分析 import 語句 (別名，保持向後相容)
     */
    analyzeImports(filePath: string, code: string): ImportStatement[];
    /**
     * 解析程式碼中的 import 語句
     */
    parseImportStatements(code: string, filePath: string): ImportStatement[];
    /**
     * 更新 import 路徑
     */
    updateImportPath(importStatement: ImportStatement, oldFilePath: string, newFilePath: string): ImportUpdate;
    /**
     * 解析路徑別名
     */
    resolvePathAlias(aliasPath: string): string;
    /**
     * 計算相對路徑
     */
    calculateRelativePath(fromPath: string, toPath: string): string;
    /**
     * 提取 import 語句中的符號
     */
    findImportedSymbols(statement: string): string[];
    /**
     * 檢查是否為 Node 模組 import
     */
    isNodeModuleImport(importPath: string): boolean;
    /**
     * 建立 ImportStatement 物件
     */
    private createImportStatement;
    /**
     * 判斷路徑型別
     */
    private determinePathType;
    /**
     * 跳脫正則表達式特殊字元
     */
    private escapeRegExp;
    /**
     * 檢查是否為註解行
     */
    private isCommentLine;
}
//# sourceMappingURL=import-resolver.d.ts.map