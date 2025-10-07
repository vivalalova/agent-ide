/**
 * 作用域分析器實作
 * 負責分析程式碼的作用域結構和符號可見性
 */
import { SymbolType, createSymbol } from '../../shared/types/symbol.js';
import { createLocation, isPositionInRange } from '../../shared/types/core.js';
/**
 * 作用域分析器類別
 */
export class ScopeAnalyzer {
    currentScopes = [];
    symbolTable = new Map();
    /**
     * 分析 AST 的作用域結構
     */
    async analyzeScopes(ast) {
        this.currentScopes = [];
        this.symbolTable.clear();
        // 檢查 AST 是否有效
        if (!ast || !ast.root) {
            // 返回空的作用域列表
            return [];
        }
        // 建立全域作用域
        const globalScope = {
            type: 'global',
            symbols: [],
            range: ast.root.range || {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 0 }
            }
        };
        this.currentScopes.push(globalScope);
        // 遞歸分析 AST 節點
        await this.analyzeNode(ast.root, globalScope);
        return this.currentScopes;
    }
    /**
     * 尋找被遮蔽的變數
     */
    async findShadowedVariables(ast) {
        const scopes = await this.analyzeScopes(ast);
        const shadowedVars = [];
        // 檢查每個作用域的符號
        for (const scope of scopes) {
            for (const symbol of scope.symbols) {
                const shadows = this.findShadowingSymbols(symbol, scopes, scope);
                if (shadows.length > 0) {
                    const existing = shadowedVars.find(sv => sv.name === symbol.name);
                    if (existing) {
                        existing.shadowedBy.push(...shadows);
                    }
                    else {
                        shadowedVars.push({
                            name: symbol.name,
                            originalSymbol: symbol,
                            shadowedBy: shadows
                        });
                    }
                }
            }
        }
        return shadowedVars;
    }
    /**
     * 根據位置取得對應的作用域
     */
    async getScopeAtPosition(position) {
        // 找到包含該位置的最具體的作用域
        let targetScope = null;
        let bestDepth = -1;
        for (const scope of this.currentScopes) {
            if (isPositionInRange(position, scope.range)) {
                const depth = this.getScopeDepth(scope);
                if (depth > bestDepth) {
                    bestDepth = depth;
                    targetScope = scope;
                }
            }
        }
        return targetScope;
    }
    /**
     * 檢查符號在特定作用域中是否可見
     */
    async isSymbolVisible(symbolName, scope) {
        // 檢查當前作用域
        if (scope.symbols.some(s => s.name === symbolName)) {
            return true;
        }
        // 檢查父作用域（向上遍歷）
        let currentScope = scope.parent;
        while (currentScope) {
            if (currentScope.symbols.some(s => s.name === symbolName)) {
                return true;
            }
            currentScope = currentScope.parent;
        }
        return false;
    }
    /**
     * 遞歸分析 AST 節點
     */
    async analyzeNode(node, parentScope) {
        let currentScope = parentScope;
        // 函式宣告需要特殊處理：函式名加到父作用域，但參數和內容在新作用域
        if (node.type === 'FunctionDeclaration') {
            // 把函式名加到父作用域
            const symbol = this.createSymbolFromNode(node);
            if (symbol) {
                parentScope.symbols.push(symbol);
                this.addToSymbolTable(symbol);
            }
            // 建立函式作用域
            currentScope = this.createScope(node, parentScope);
            this.currentScopes.push(currentScope);
        }
        else if (this.shouldCreateScope(node)) {
            // 其他類型的作用域
            currentScope = this.createScope(node, parentScope);
            this.currentScopes.push(currentScope);
        }
        else if (this.isSymbolDefinition(node)) {
            // 一般符號定義
            const symbol = this.createSymbolFromNode(node);
            if (symbol) {
                currentScope.symbols.push(symbol);
                this.addToSymbolTable(symbol);
            }
        }
        // 遞歸處理子節點
        for (const child of node.children) {
            await this.analyzeNode(child, currentScope);
        }
    }
    /**
     * 檢查是否應該為節點建立新的作用域
     */
    shouldCreateScope(node) {
        const scopeTypes = [
            'FunctionDeclaration',
            'FunctionExpression',
            'ArrowFunctionExpression',
            'BlockStatement',
            'ClassDeclaration'
        ];
        return scopeTypes.includes(node.type);
    }
    /**
     * 為節點建立作用域
     */
    createScope(node, parent) {
        const scopeType = this.getScopeType(node.type);
        const name = node.properties.name;
        return {
            type: scopeType,
            name,
            parent,
            symbols: [],
            range: node.range
        };
    }
    /**
     * 取得作用域類型
     */
    getScopeType(nodeType) {
        const typeMap = {
            'FunctionDeclaration': 'function',
            'FunctionExpression': 'function',
            'ArrowFunctionExpression': 'function',
            'ClassDeclaration': 'class',
            'BlockStatement': 'block'
        };
        return typeMap[nodeType] || 'block';
    }
    /**
     * 檢查是否為符號定義
     */
    isSymbolDefinition(node) {
        const definitionTypes = [
            'VariableDeclaration',
            'FunctionDeclaration',
            'ClassDeclaration',
            'Parameter'
        ];
        return definitionTypes.includes(node.type);
    }
    /**
     * 從 AST 節點建立符號
     */
    createSymbolFromNode(node) {
        const name = node.properties.name;
        if (!name) {
            return null;
        }
        const symbolType = this.getSymbolType(node.type);
        const location = createLocation('/test/file.ts', node.range); // 暫時使用測試檔案路徑
        return createSymbol(name, symbolType, location);
    }
    /**
     * 取得符號類型
     */
    getSymbolType(nodeType) {
        const typeMap = {
            'VariableDeclaration': SymbolType.Variable,
            'FunctionDeclaration': SymbolType.Function,
            'ClassDeclaration': SymbolType.Class,
            'Parameter': SymbolType.Variable
        };
        return typeMap[nodeType] || SymbolType.Variable;
    }
    /**
     * 添加符號到符號表
     */
    addToSymbolTable(symbol) {
        const existing = this.symbolTable.get(symbol.name) || [];
        existing.push(symbol);
        this.symbolTable.set(symbol.name, existing);
    }
    /**
     * 找到遮蔽指定符號的其他符號
     */
    findShadowingSymbols(symbol, allScopes, symbolScope) {
        const shadows = [];
        for (const scope of allScopes) {
            // 跳過符號所在的作用域
            if (scope === symbolScope) {
                continue;
            }
            // 檢查是否為子作用域（會遮蔽父作用域的符號）
            if (this.isChildScope(scope, symbolScope)) {
                const shadowingSymbol = scope.symbols.find(s => s.name === symbol.name);
                if (shadowingSymbol) {
                    shadows.push({
                        symbol: shadowingSymbol,
                        scope
                    });
                }
            }
        }
        return shadows;
    }
    /**
     * 檢查是否為子作用域
     */
    isChildScope(child, parent) {
        let currentParent = child.parent;
        while (currentParent) {
            if (currentParent === parent) {
                return true;
            }
            currentParent = currentParent.parent;
        }
        return false;
    }
    /**
     * 取得作用域深度
     */
    getScopeDepth(scope) {
        let depth = 0;
        let current = scope.parent;
        while (current) {
            depth++;
            current = current.parent;
        }
        return depth;
    }
}
//# sourceMappingURL=scope-analyzer.js.map