/**
 * Symbol 相關型別定義
 * 包含 SymbolType、Symbol、Reference、Dependency 等型別
 */
/**
 * Symbol 類型列舉
 */
export var SymbolType;
(function (SymbolType) {
    SymbolType["Class"] = "class";
    SymbolType["Interface"] = "interface";
    SymbolType["Function"] = "function";
    SymbolType["Variable"] = "variable";
    SymbolType["Constant"] = "constant";
    SymbolType["Type"] = "type";
    SymbolType["Enum"] = "enum";
    SymbolType["Module"] = "module";
    SymbolType["Namespace"] = "namespace";
})(SymbolType || (SymbolType = {}));
/**
 * Reference 類型列舉
 */
export var ReferenceType;
(function (ReferenceType) {
    ReferenceType["Definition"] = "definition";
    ReferenceType["Usage"] = "usage";
    ReferenceType["Declaration"] = "declaration";
})(ReferenceType || (ReferenceType = {}));
/**
 * Dependency 類型列舉
 */
export var DependencyType;
(function (DependencyType) {
    DependencyType["Import"] = "import";
    DependencyType["Require"] = "require";
    DependencyType["Include"] = "include";
})(DependencyType || (DependencyType = {}));
/**
 * 建立 Scope 的工廠函式
 */
export function createScope(type, name, parent) {
    const validTypes = ['global', 'module', 'namespace', 'class', 'function', 'block'];
    if (!validTypes.includes(type)) {
        throw new Error('無效的 scope 類型');
    }
    return {
        type,
        name: name || undefined,
        parent: parent || undefined
    };
}
/**
 * 建立 Symbol 的工廠函式
 */
export function createSymbol(name, type, location, scope, modifiers = []) {
    if (!name.trim()) {
        throw new Error('Symbol 名稱不能為空');
    }
    // 檢查 modifiers 是否有重複
    const uniqueModifiers = new Set(modifiers);
    if (uniqueModifiers.size !== modifiers.length) {
        throw new Error('Modifiers 不能重複');
    }
    return {
        name,
        type,
        location,
        scope: scope || undefined,
        modifiers: [...modifiers]
    };
}
/**
 * 建立 Reference 的工廠函式
 */
export function createReference(symbol, location, type) {
    return {
        symbol,
        location,
        type
    };
}
/**
 * 建立 Dependency 的工廠函式
 */
export function createDependency(path, type, isRelative, importedSymbols = []) {
    if (!path.trim()) {
        throw new Error('Dependency 路徑不能為空');
    }
    // 檢查 importedSymbols 是否有重複
    const uniqueSymbols = new Set(importedSymbols);
    if (uniqueSymbols.size !== importedSymbols.length) {
        throw new Error('ImportedSymbols 不能重複');
    }
    return {
        path,
        type,
        isRelative,
        importedSymbols: [...importedSymbols]
    };
}
/**
 * Scope 型別守衛
 */
export function isScope(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    const validTypes = ['global', 'module', 'namespace', 'class', 'function', 'block'];
    return (typeof obj.type === 'string' &&
        validTypes.includes(obj.type) &&
        (obj.name === undefined || typeof obj.name === 'string') &&
        (obj.parent === undefined || isScope(obj.parent)));
}
/**
 * Symbol 型別守衛
 */
export function isSymbol(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.name === 'string' &&
        obj.name.trim().length > 0 &&
        Object.values(SymbolType).includes(obj.type) &&
        obj.location && typeof obj.location === 'object' &&
        (obj.scope === undefined || isScope(obj.scope)) &&
        Array.isArray(obj.modifiers));
}
/**
 * Reference 型別守衛
 */
export function isReference(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (isSymbol(obj.symbol) &&
        obj.location && typeof obj.location === 'object' &&
        Object.values(ReferenceType).includes(obj.type));
}
/**
 * Dependency 型別守衛
 */
export function isDependency(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.path === 'string' &&
        obj.path.trim().length > 0 &&
        Object.values(DependencyType).includes(obj.type) &&
        typeof obj.isRelative === 'boolean' &&
        Array.isArray(obj.importedSymbols));
}
/**
 * 計算 Scope 的深度
 */
export function getScopeDepth(scope) {
    let depth = 0;
    let currentScope = scope;
    while (currentScope?.parent) {
        depth++;
        currentScope = currentScope.parent;
    }
    return depth;
}
/**
 * 檢查兩個 Symbol 是否在同一 Scope
 */
export function isSameScope(symbol1, symbol2) {
    if (!symbol1.scope && !symbol2.scope) {
        return true; // 都沒有 scope，視為相同
    }
    if (!symbol1.scope || !symbol2.scope) {
        return false; // 一個有 scope，一個沒有，不相同
    }
    return symbol1.scope === symbol2.scope;
}
/**
 * 取得 Scope 的完整路徑
 */
export function getScopePath(scope) {
    const path = [];
    let currentScope = scope;
    while (currentScope) {
        if (currentScope.name) {
            path.unshift(currentScope.name);
        }
        else {
            path.unshift(currentScope.type);
        }
        currentScope = currentScope.parent;
    }
    return path;
}
//# sourceMappingURL=symbol.js.map