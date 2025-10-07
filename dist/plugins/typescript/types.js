/**
 * TypeScript Parser 特定型別定義
 */
import { SymbolType } from '../../shared/types/index.js';
import * as ts from 'typescript';
/**
 * 預設的 TypeScript 編譯器選項
 */
export const DEFAULT_COMPILER_OPTIONS = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.React,
    strict: true,
    esModuleInterop: true,
    allowJs: true,
    declaration: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true
};
/**
 * TypeScript 語法種類映射
 * 將 TypeScript SyntaxKind 映射到我們的 ASTNode 類型
 */
export const SYNTAX_KIND_MAP = {
    [ts.SyntaxKind.SourceFile]: 'SourceFile',
    [ts.SyntaxKind.ClassDeclaration]: 'ClassDeclaration',
    [ts.SyntaxKind.InterfaceDeclaration]: 'InterfaceDeclaration',
    [ts.SyntaxKind.FunctionDeclaration]: 'FunctionDeclaration',
    [ts.SyntaxKind.VariableDeclaration]: 'VariableDeclaration',
    [ts.SyntaxKind.MethodDeclaration]: 'MethodDeclaration',
    [ts.SyntaxKind.PropertyDeclaration]: 'PropertyDeclaration',
    [ts.SyntaxKind.Constructor]: 'Constructor',
    [ts.SyntaxKind.Parameter]: 'Parameter',
    [ts.SyntaxKind.TypeAliasDeclaration]: 'TypeAliasDeclaration',
    [ts.SyntaxKind.EnumDeclaration]: 'EnumDeclaration',
    [ts.SyntaxKind.ModuleDeclaration]: 'ModuleDeclaration',
    [ts.SyntaxKind.ImportDeclaration]: 'ImportDeclaration',
    [ts.SyntaxKind.ExportDeclaration]: 'ExportDeclaration',
    [ts.SyntaxKind.CallExpression]: 'CallExpression',
    [ts.SyntaxKind.Identifier]: 'Identifier',
    [ts.SyntaxKind.Block]: 'Block',
    [ts.SyntaxKind.VariableStatement]: 'VariableStatement'
};
/**
 * TypeScript 符號類型映射
 */
export const SYMBOL_TYPE_MAP = {
    [ts.SyntaxKind.ClassDeclaration]: SymbolType.Class,
    [ts.SyntaxKind.InterfaceDeclaration]: SymbolType.Interface,
    [ts.SyntaxKind.FunctionDeclaration]: SymbolType.Function,
    [ts.SyntaxKind.MethodDeclaration]: SymbolType.Function,
    [ts.SyntaxKind.VariableDeclaration]: SymbolType.Variable,
    [ts.SyntaxKind.PropertyDeclaration]: SymbolType.Variable,
    [ts.SyntaxKind.TypeAliasDeclaration]: SymbolType.Type,
    [ts.SyntaxKind.EnumDeclaration]: SymbolType.Enum,
    [ts.SyntaxKind.ModuleDeclaration]: SymbolType.Module,
    [ts.SyntaxKind.TypeParameter]: SymbolType.Type,
    [ts.SyntaxKind.Parameter]: SymbolType.Variable,
    [ts.SyntaxKind.PropertySignature]: SymbolType.Variable,
    [ts.SyntaxKind.MethodSignature]: SymbolType.Function,
    [ts.SyntaxKind.GetAccessor]: SymbolType.Function,
    [ts.SyntaxKind.SetAccessor]: SymbolType.Function
};
/**
 * TypeScript 修飾符映射
 */
export const MODIFIER_MAP = {
    [ts.SyntaxKind.PublicKeyword]: 'public',
    [ts.SyntaxKind.PrivateKeyword]: 'private',
    [ts.SyntaxKind.ProtectedKeyword]: 'protected',
    [ts.SyntaxKind.StaticKeyword]: 'static',
    [ts.SyntaxKind.ReadonlyKeyword]: 'readonly',
    [ts.SyntaxKind.AbstractKeyword]: 'abstract',
    [ts.SyntaxKind.AsyncKeyword]: 'async',
    [ts.SyntaxKind.ExportKeyword]: 'export',
    [ts.SyntaxKind.DefaultKeyword]: 'default',
    [ts.SyntaxKind.DeclareKeyword]: 'declare',
    [ts.SyntaxKind.ConstKeyword]: 'const'
};
/**
 * 位置轉換工具函式
 */
export function tsPositionToPosition(sourceFile, pos) {
    const lineAndChar = sourceFile.getLineAndCharacterOfPosition(pos);
    return {
        line: lineAndChar.line,
        column: lineAndChar.character,
        offset: pos
    };
}
/**
 * 範圍轉換工具函式
 */
export function tsNodeToRange(node, sourceFile) {
    const start = tsPositionToPosition(sourceFile, node.getStart(sourceFile));
    const end = tsPositionToPosition(sourceFile, node.getEnd());
    return { start, end };
}
/**
 * 位置轉換為 TypeScript 位置
 */
export function positionToTsPosition(sourceFile, position) {
    return sourceFile.getPositionOfLineAndCharacter(position.line, position.column);
}
/**
 * 獲取節點的修飾符
 */
export function getNodeModifiers(node) {
    const modifiers = [];
    if (ts.canHaveModifiers(node) && ts.getModifiers(node)) {
        for (const modifier of ts.getModifiers(node)) {
            const modifierName = MODIFIER_MAP[modifier.kind];
            if (modifierName) {
                modifiers.push(modifierName);
            }
        }
    }
    // 特殊處理某些節點
    if (ts.isVariableDeclaration(node)) {
        const parent = node.parent;
        if (ts.isVariableDeclarationList(parent)) {
            if (parent.flags & ts.NodeFlags.Const) {
                modifiers.push('const');
            }
            else if (parent.flags & ts.NodeFlags.Let) {
                modifiers.push('let');
            }
            else {
                modifiers.push('var');
            }
        }
    }
    return modifiers;
}
/**
 * 獲取節點的名稱
 */
export function getNodeName(node) {
    if (ts.isIdentifier(node)) {
        return node.text;
    }
    if ('name' in node && node.name) {
        const nameNode = node.name;
        if (ts.isIdentifier(nameNode)) {
            return nameNode.text;
        }
        if (ts.isStringLiteral(nameNode)) {
            return nameNode.text;
        }
    }
    return undefined;
}
/**
 * 檢查節點是否為符號宣告
 */
export function isSymbolDeclaration(node) {
    return (ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) ||
        ts.isMethodSignature(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node) ||
        ts.isParameter(node) ||
        ts.isTypeParameterDeclaration(node) ||
        ts.isGetAccessor(node) ||
        ts.isSetAccessor(node));
}
/**
 * 檢查節點是否為 import/export 語句
 */
export function isDependencyNode(node) {
    return (ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node) ||
        ts.isExportAssignment(node) ||
        (ts.isCallExpression(node) &&
            ((ts.isIdentifier(node.expression) && node.expression.text === 'require') ||
                node.expression.kind === ts.SyntaxKind.ImportKeyword)));
}
/**
 * 獲取依賴路徑
 */
export function getDependencyPath(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (moduleSpecifier && ts.isStringLiteral(moduleSpecifier)) {
            return moduleSpecifier.text;
        }
    }
    if (ts.isImportEqualsDeclaration(node)) {
        if (ts.isExternalModuleReference(node.moduleReference)) {
            const expression = node.moduleReference.expression;
            if (ts.isStringLiteral(expression)) {
                return expression.text;
            }
        }
    }
    if (ts.isCallExpression(node)) {
        const expression = node.expression;
        if (ts.isIdentifier(expression) &&
            (expression.text === 'require' || expression.text === 'import')) {
            const firstArg = node.arguments[0];
            if (firstArg && ts.isStringLiteral(firstArg)) {
                return firstArg.text;
            }
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
    if (node.importClause) {
        const importClause = node.importClause;
        // 預設導入
        if (importClause.name) {
            symbols.push('default');
        }
        // 命名導入
        if (importClause.namedBindings) {
            if (ts.isNamespaceImport(importClause.namedBindings)) {
                // import * as name
                symbols.push('*');
            }
            else if (ts.isNamedImports(importClause.namedBindings)) {
                // import { a, b }
                for (const element of importClause.namedBindings.elements) {
                    symbols.push(element.name.text);
                }
            }
        }
    }
    return symbols;
}
/**
 * 創建 TypeScript AST 節點
 */
export function createTypeScriptASTNode(tsNode, sourceFile) {
    const type = SYNTAX_KIND_MAP[tsNode.kind] || ts.SyntaxKind[tsNode.kind];
    const range = tsNodeToRange(tsNode, sourceFile);
    const properties = {
        kind: tsNode.kind,
        syntaxKind: ts.SyntaxKind[tsNode.kind],
        flags: tsNode.flags
    };
    // 添加特定屬性
    const name = getNodeName(tsNode);
    if (name) {
        properties.name = name;
    }
    const modifiers = getNodeModifiers(tsNode);
    if (modifiers.length > 0) {
        properties.modifiers = modifiers;
    }
    // 遞歸處理子節點
    const children = [];
    // 使用 forEachChild 遍歷結構化子節點
    tsNode.forEachChild(child => {
        children.push(createTypeScriptASTNode(child, sourceFile));
    });
    // 對於某些節點，還需要檢查語法結構，特別是 export 語句
    if (ts.isExportDeclaration(tsNode) && tsNode.exportClause && ts.isNamedExports(tsNode.exportClause)) {
        // Export 可能包含額外的符號
        for (const element of tsNode.exportClause.elements) {
            children.push(createTypeScriptASTNode(element, sourceFile));
        }
    }
    else if (ts.isVariableStatement(tsNode)) {
        // VariableStatement 中的聲明
        for (const declaration of tsNode.declarationList.declarations) {
            children.push(createTypeScriptASTNode(declaration, sourceFile));
        }
    }
    const node = {
        type,
        range,
        properties,
        children,
        tsNode,
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
    // TypeScript 識別符規則
    const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    return identifierPattern.test(name);
}
/**
 * 錯誤類別
 */
export class TypeScriptParseError extends Error {
    diagnostics;
    constructor(message, diagnostics) {
        super(message);
        this.diagnostics = diagnostics;
        this.name = 'TypeScriptParseError';
    }
}
/**
 * 創建解析錯誤
 */
export function createParseError(message, diagnostics) {
    return new TypeScriptParseError(message, diagnostics);
}
//# sourceMappingURL=types.js.map