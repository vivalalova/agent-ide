/**
 * TypeScript Dependency Analyzer
 * 分析 TypeScript 程式碼中的依賴關係
 */
import * as ts from 'typescript';
import { DependencyType, createDependency } from '../../shared/types/index.js';
import { getDependencyPath, getImportedSymbols, isRelativePath, isDependencyNode } from './types.js';
/**
 * TypeScript 依賴分析器類別
 */
export class TypeScriptDependencyAnalyzer {
    dependencies = [];
    sourceFile;
    /**
     * 從 AST 中提取所有依賴關係
     */
    async extractDependencies(ast) {
        this.dependencies = [];
        this.sourceFile = ast.tsSourceFile;
        // 首先提取三斜線指令
        this.extractTripleSlashDirectives();
        // 遍歷 AST 尋找依賴
        this.visitNode(ast.root);
        return [...this.dependencies];
    }
    /**
     * 遞歸訪問 AST 節點
     */
    visitNode(node) {
        const tsNode = node.tsNode;
        // 檢查是否為依賴節點
        if (isDependencyNode(tsNode)) {
            const dependency = this.extractDependencyFromNode(tsNode);
            if (dependency) {
                this.dependencies.push(dependency);
            }
        }
        // 遞歸處理子節點
        for (const child of node.children) {
            this.visitNode(child);
        }
    }
    /**
     * 從節點提取依賴資訊
     */
    extractDependencyFromNode(node) {
        if (ts.isImportDeclaration(node)) {
            return this.extractFromImportDeclaration(node);
        }
        if (ts.isExportDeclaration(node)) {
            return this.extractFromExportDeclaration(node);
        }
        if (ts.isImportEqualsDeclaration(node)) {
            return this.extractFromImportEquals(node);
        }
        if (ts.isCallExpression(node)) {
            return this.extractFromCallExpression(node);
        }
        return null;
    }
    /**
     * 從 import 宣告提取依賴
     */
    extractFromImportDeclaration(node) {
        const path = getDependencyPath(node);
        if (!path) {
            return null;
        }
        const importedSymbols = getImportedSymbols(node);
        return createDependency(path, DependencyType.Import, isRelativePath(path), importedSymbols);
    }
    /**
     * 從 export 宣告提取依賴（重新匯出的情況）
     */
    extractFromExportDeclaration(node) {
        const path = getDependencyPath(node);
        if (!path) {
            return null; // 只是 export 本檔案的內容，不是依賴
        }
        const importedSymbols = this.getExportedSymbols(node);
        return createDependency(path, DependencyType.Import, // 重新匯出也算是 import
        isRelativePath(path), importedSymbols);
    }
    /**
     * 從 import = 宣告提取依賴
     */
    extractFromImportEquals(node) {
        if (ts.isExternalModuleReference(node.moduleReference)) {
            const expression = node.moduleReference.expression;
            if (ts.isStringLiteral(expression)) {
                const path = expression.text;
                const symbolName = node.name.text;
                return createDependency(path, DependencyType.Require, isRelativePath(path), [symbolName]);
            }
        }
        return null;
    }
    /**
     * 從函式呼叫提取依賴（require, import()）
     */
    extractFromCallExpression(node) {
        const expression = node.expression;
        if (ts.isIdentifier(expression)) {
            if (expression.text === 'require') {
                return this.extractFromRequireCall(node);
            }
            if (expression.text === 'import') {
                return this.extractFromDynamicImport(node);
            }
        }
        // 檢查是否為 import() 動態導入
        if (expression.kind === ts.SyntaxKind.ImportKeyword) {
            return this.extractFromDynamicImport(node);
        }
        return null;
    }
    /**
     * 從 require() 呼叫提取依賴
     */
    extractFromRequireCall(node) {
        if (node.arguments.length === 0) {
            return null;
        }
        const firstArg = node.arguments[0];
        if (!ts.isStringLiteral(firstArg)) {
            return null;
        }
        const path = firstArg.text;
        // 檢查是否為解構賦值
        const importedSymbols = this.getRequireImportedSymbols(node);
        return createDependency(path, DependencyType.Require, isRelativePath(path), importedSymbols);
    }
    /**
     * 從動態 import() 提取依賴
     */
    extractFromDynamicImport(node) {
        if (node.arguments.length === 0) {
            return null;
        }
        const firstArg = node.arguments[0];
        if (!ts.isStringLiteral(firstArg)) {
            return null;
        }
        const path = firstArg.text;
        return createDependency(path, DependencyType.Import, isRelativePath(path), [] // 動態導入不預先知道導入的符號
        );
    }
    /**
     * 獲取 export 宣告的符號
     */
    getExportedSymbols(node) {
        const symbols = [];
        if (node.exportClause) {
            if (ts.isNamespaceExport(node.exportClause)) {
                // export * as name
                symbols.push('*');
            }
            else if (ts.isNamedExports(node.exportClause)) {
                // export { a, b }
                for (const element of node.exportClause.elements) {
                    symbols.push(element.name.text);
                }
            }
        }
        else {
            // export *
            symbols.push('*');
        }
        return symbols;
    }
    /**
     * 獲取 require 導入的符號
     */
    getRequireImportedSymbols(node) {
        const symbols = [];
        // 查找父節點以確定如何使用 require 的結果
        const parent = node.parent;
        if (ts.isVariableDeclaration(parent)) {
            // const module = require('...')
            if (ts.isIdentifier(parent.name)) {
                symbols.push(parent.name.text);
            }
            else if (ts.isObjectBindingPattern(parent.name)) {
                // const { a, b } = require('...')
                for (const element of parent.name.elements) {
                    if (ts.isBindingElement(element) && ts.isIdentifier(element.name)) {
                        symbols.push(element.name.text);
                    }
                }
            }
        }
        return symbols;
    }
    /**
     * 提取三斜線指令依賴
     */
    extractTripleSlashDirectives() {
        const fullText = this.sourceFile.getFullText();
        // 提取三斜線指令
        const tripleSlashRegex = /\/\/\/\s*<(reference|amd-module)\s+([^>]+)>/g;
        let match;
        while ((match = tripleSlashRegex.exec(fullText)) !== null) {
            const directive = match[1];
            const attributes = match[2];
            if (directive === 'reference') {
                const pathMatch = /path\s*=\s*["']([^"']+)["']/.exec(attributes);
                const typesMatch = /types\s*=\s*["']([^"']+)["']/.exec(attributes);
                if (pathMatch) {
                    const path = pathMatch[1];
                    const dependency = createDependency(path, DependencyType.Include, isRelativePath(path), []);
                    this.dependencies.push(dependency);
                }
                else if (typesMatch) {
                    const types = typesMatch[1];
                    const dependency = createDependency(types, DependencyType.Include, false, []);
                    this.dependencies.push(dependency);
                }
            }
        }
    }
    /**
     * 檢查模組解析結果並標準化路徑
     */
    normalizePath(path) {
        // 移除查詢參數和 fragment
        const cleanPath = path.split('?')[0].split('#')[0];
        // 標準化路徑分隔符
        return cleanPath.replace(/\\/g, '/');
    }
    /**
     * 獲取依賴的型別（開發依賴還是執行時依賴）
     */
    getDependencyCategory(node) {
        // 檢查是否為純型別導入
        if (ts.isImportDeclaration(node)) {
            if (node.importClause) {
                // import type {} 或 import { type ... }
                if (node.importClause.isTypeOnly) {
                    return 'type';
                }
            }
        }
        // 其他啟發式方法判斷
        const path = getDependencyPath(node);
        if (path) {
            // 常見的開發依賴
            const devDependencies = [
                '@types/', 'jest', 'vitest', 'eslint', 'prettier',
                'webpack', 'rollup', 'vite', 'typescript'
            ];
            if (devDependencies.some(dep => path.includes(dep))) {
                return 'dev';
            }
        }
        return 'runtime';
    }
    /**
     * 分析循環依賴
     */
    async analyzeCyclicDependencies(dependencies) {
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();
        // 建立依賴圖
        const dependencyMap = new Map();
        for (const dep of dependencies) {
            const currentFile = this.sourceFile.fileName;
            if (!dependencyMap.has(currentFile)) {
                dependencyMap.set(currentFile, []);
            }
            dependencyMap.get(currentFile).push(dep.path);
        }
        // DFS 檢測循環
        const detectCycle = (node, path) => {
            if (recursionStack.has(node)) {
                // 找到循環
                const cycleStart = path.indexOf(node);
                if (cycleStart !== -1) {
                    cycles.push(path.slice(cycleStart));
                }
                return;
            }
            if (visited.has(node)) {
                return;
            }
            visited.add(node);
            recursionStack.add(node);
            const deps = dependencyMap.get(node) || [];
            for (const dep of deps) {
                detectCycle(dep, [...path, dep]);
            }
            recursionStack.delete(node);
        };
        // 從當前檔案開始檢測
        detectCycle(this.sourceFile.fileName, [this.sourceFile.fileName]);
        return cycles;
    }
}
/**
 * 創建依賴分析器實例
 */
export function createDependencyAnalyzer() {
    return new TypeScriptDependencyAnalyzer();
}
//# sourceMappingURL=dependency-analyzer.js.map