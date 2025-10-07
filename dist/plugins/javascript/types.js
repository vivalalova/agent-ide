/**
 * JavaScript Parser 特定型別定義
 */
import { SymbolType } from '../../shared/types/index.js';
import * as babel from '@babel/types';
/**
 * 預設的 JavaScript 解析選項
 */
export const DEFAULT_PARSE_OPTIONS = {
    sourceType: 'unambiguous',
    allowImportExportEverywhere: true,
    allowAwaitOutsideFunction: false,
    allowReturnOutsideFunction: false,
    allowSuperOutsideMethod: false,
    allowUndeclaredExports: true,
    attachComments: true,
    strictMode: false,
    ranges: true,
    tokens: false,
    preserveComments: true,
    plugins: [
        'jsx',
        'decorators',
        'classProperties',
        'classPrivateProperties',
        'classPrivateMethods',
        'classStaticBlock',
        'privateIn',
        'asyncGenerators',
        'bigInt',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'importMeta',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'topLevelAwait'
    ]
};
/**
 * Babel 節點類型映射
 * 將 Babel 節點類型映射到我們的 ASTNode 類型
 */
export const BABEL_NODE_TYPE_MAP = {
    'File': 'File',
    'Program': 'Program',
    'ClassDeclaration': 'ClassDeclaration',
    'FunctionDeclaration': 'FunctionDeclaration',
    'VariableDeclaration': 'VariableDeclaration',
    'VariableDeclarator': 'VariableDeclarator',
    'MethodDefinition': 'MethodDefinition',
    'PropertyDefinition': 'PropertyDefinition',
    'ArrowFunctionExpression': 'ArrowFunctionExpression',
    'FunctionExpression': 'FunctionExpression',
    'ObjectExpression': 'ObjectExpression',
    'ArrayExpression': 'ArrayExpression',
    'ImportDeclaration': 'ImportDeclaration',
    'ExportNamedDeclaration': 'ExportNamedDeclaration',
    'ExportDefaultDeclaration': 'ExportDefaultDeclaration',
    'ExportAllDeclaration': 'ExportAllDeclaration',
    'CallExpression': 'CallExpression',
    'Identifier': 'Identifier',
    'BlockStatement': 'BlockStatement',
    'ExpressionStatement': 'ExpressionStatement',
    'AssignmentExpression': 'AssignmentExpression',
    'JSXElement': 'JSXElement',
    'JSXFragment': 'JSXFragment'
};
/**
 * Babel 符號類型映射
 */
export const BABEL_SYMBOL_TYPE_MAP = {
    'ClassDeclaration': SymbolType.Class,
    'FunctionDeclaration': SymbolType.Function,
    'ArrowFunctionExpression': SymbolType.Function,
    'FunctionExpression': SymbolType.Function,
    'VariableDeclarator': SymbolType.Variable,
    'MethodDefinition': SymbolType.Function,
    'PropertyDefinition': SymbolType.Variable,
    'ImportDefaultSpecifier': SymbolType.Variable,
    'ImportSpecifier': SymbolType.Variable,
    'ImportNamespaceSpecifier': SymbolType.Variable,
    'ObjectProperty': SymbolType.Variable,
    'ObjectMethod': SymbolType.Function
};
/**
 * 位置轉換工具函式
 */
export function babelLocationToPosition(location) {
    return {
        start: {
            line: location.start.line - 1, // Babel 使用 1-based 行號，我們使用 0-based
            column: location.start.column,
            offset: location.start.index || 0
        },
        end: {
            line: location.end.line - 1,
            column: location.end.column,
            offset: location.end.index || 0
        }
    };
}
/**
 * 位置轉換為 Babel 位置
 */
export function positionToBabelLocation(position) {
    return {
        start: {
            line: position.line + 1, // 轉換為 1-based
            column: position.column,
            index: position.offset || 0
        },
        end: {
            line: position.line + 1,
            column: position.column + 1,
            index: (position.offset || 0) + 1
        },
        filename: '',
        identifierName: undefined
    };
}
/**
 * 獲取節點的名稱
 */
export function getNodeName(node) {
    if (babel.isIdentifier(node)) {
        return node.name;
    }
    if ('id' in node && node.id && babel.isIdentifier(node.id)) {
        return node.id.name;
    }
    if ('key' in node && node.key) {
        if (babel.isIdentifier(node.key)) {
            return node.key.name;
        }
        if (babel.isStringLiteral(node.key)) {
            return node.key.value;
        }
    }
    if ('name' in node && typeof node.name === 'string') {
        return node.name;
    }
    return undefined;
}
/**
 * 檢查節點是否為符號宣告
 */
export function isSymbolDeclaration(node) {
    return (babel.isClassDeclaration(node) ||
        babel.isFunctionDeclaration(node) ||
        babel.isVariableDeclarator(node) ||
        babel.isImportDefaultSpecifier(node) ||
        babel.isImportSpecifier(node) ||
        babel.isImportNamespaceSpecifier(node) ||
        babel.isClassMethod(node) ||
        babel.isClassProperty(node) ||
        babel.isObjectProperty(node) ||
        babel.isObjectMethod(node) ||
        babel.isArrowFunctionExpression(node));
}
/**
 * 檢查節點是否為依賴相關節點
 */
export function isDependencyNode(node) {
    return (babel.isImportDeclaration(node) ||
        babel.isExportNamedDeclaration(node) ||
        babel.isExportDefaultDeclaration(node) ||
        babel.isExportAllDeclaration(node) ||
        (babel.isCallExpression(node) &&
            babel.isIdentifier(node.callee) &&
            node.callee.name === 'require'));
}
/**
 * 獲取依賴路徑
 */
export function getDependencyPath(node) {
    if (babel.isImportDeclaration(node) ||
        babel.isExportNamedDeclaration(node) ||
        babel.isExportAllDeclaration(node)) {
        return node.source?.value;
    }
    if (babel.isCallExpression(node) &&
        babel.isIdentifier(node.callee) &&
        node.callee.name === 'require') {
        const firstArg = node.arguments[0];
        if (babel.isStringLiteral(firstArg)) {
            return firstArg.value;
        }
    }
    return undefined;
}
/**
 * 檢查路徑是否為相對路徑
 */
export function isRelativePath(path) {
    return path.startsWith('./') || path.startsWith('../');
}
/**
 * 獲取導入的符號
 */
export function getImportedSymbols(node) {
    const symbols = [];
    for (const specifier of node.specifiers) {
        if (babel.isImportDefaultSpecifier(specifier)) {
            symbols.push('default');
        }
        else if (babel.isImportSpecifier(specifier)) {
            symbols.push(specifier.local.name);
        }
        else if (babel.isImportNamespaceSpecifier(specifier)) {
            symbols.push('*');
        }
    }
    return symbols;
}
/**
 * 創建 JavaScript AST 節點
 */
export function createJavaScriptASTNode(babelNode, sourceFile) {
    const type = BABEL_NODE_TYPE_MAP[babelNode.type] || babelNode.type;
    const range = babelNode.loc ? babelLocationToPosition(babelNode.loc) : {
        start: { line: 0, column: 0, offset: 0 },
        end: { line: 0, column: 0, offset: 0 }
    };
    const properties = {
        nodeType: babelNode.type,
        leadingComments: babelNode.leadingComments,
        trailingComments: babelNode.trailingComments,
        innerComments: babelNode.innerComments
    };
    // 添加特定屬性
    const name = getNodeName(babelNode);
    if (name) {
        properties.name = name;
    }
    // 處理特殊節點類型的屬性
    if (babel.isClassDeclaration(babelNode) || babel.isFunctionDeclaration(babelNode)) {
        properties.async = 'async' in babelNode ? babelNode.async : false;
        properties.generator = 'generator' in babelNode ? babelNode.generator : false;
    }
    if (babel.isVariableDeclaration(babelNode)) {
        properties.kind = babelNode.kind; // const, let, var
    }
    // 遞歸處理子節點
    const children = [];
    // 使用 Babel traverse 的概念處理子節點
    const childKeys = babel.VISITOR_KEYS[babelNode.type];
    if (childKeys) {
        for (const key of childKeys) {
            const child = babelNode[key];
            if (Array.isArray(child)) {
                for (const item of child) {
                    if (babel.isNode(item)) {
                        children.push(createJavaScriptASTNode(item, sourceFile));
                    }
                }
            }
            else if (babel.isNode(child)) {
                children.push(createJavaScriptASTNode(child, sourceFile));
            }
        }
    }
    const node = {
        type,
        range,
        properties,
        children,
        babelNode,
        sourceFile
    };
    // 設定父子關係
    children.forEach(child => {
        child.parent = node;
    });
    return node;
}
/**
 * 驗證識別符名稱
 */
export function isValidIdentifier(name) {
    if (!name || name.length === 0) {
        return false;
    }
    // JavaScript 識別符規則
    const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return identifierPattern.test(name) && !isReservedWord(name);
}
/**
 * 檢查是否為保留字
 */
export function isReservedWord(name) {
    const reservedWords = [
        'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
        'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
        'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
        'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
        // ES6+
        'let', 'static', 'async', 'await',
        // Strict mode reserved words
        'implements', 'interface', 'package', 'private', 'protected', 'public'
    ];
    return reservedWords.includes(name);
}
/**
 * 錯誤類別
 */
export class JavaScriptParseError extends Error {
    babelError;
    location;
    constructor(message, babelError, location) {
        super(message);
        this.babelError = babelError;
        this.location = location;
        this.name = 'JavaScriptParseError';
    }
}
/**
 * 創建解析錯誤
 */
export function createParseError(message, babelError, location) {
    return new JavaScriptParseError(message, babelError, location);
}
/**
 * 獲取檔案的預設 Babel 插件
 */
export function getPluginsForFile(filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    const basePlugins = [...DEFAULT_PARSE_OPTIONS.plugins];
    // 根據副檔名調整插件
    if (ext === '.jsx' || ext === '.tsx') {
        if (!basePlugins.includes('jsx')) {
            basePlugins.push('jsx');
        }
    }
    if (ext === '.ts' || ext === '.tsx') {
        if (!basePlugins.includes('typescript')) {
            basePlugins.push('typescript');
        }
    }
    return basePlugins;
}
/**
 * 獲取作用域類型
 */
export function getScopeType(node) {
    if (babel.isFunctionDeclaration(node) ||
        babel.isFunctionExpression(node) ||
        babel.isArrowFunctionExpression(node)) {
        return 'function';
    }
    if (babel.isClassDeclaration(node)) {
        return 'class';
    }
    if (babel.isBlockStatement(node)) {
        return 'block';
    }
    if (babel.isProgram(node)) {
        return 'module';
    }
    return 'unknown';
}
//# sourceMappingURL=types.js.map