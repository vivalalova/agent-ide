/**
 * JavaScript Parser 特定型別定義
 */

import type {
  AST,
  ASTNode,
  Position,
  Range,
  Symbol,
  Reference,
  Dependency
} from '../../shared/types/index.js';
import { SymbolType, DependencyType, ReferenceType } from '@shared/types/index.js';
import type { CodeEdit } from '@infrastructure/parser/types.js';
import { isRelativePath, isValidUnicodeIdentifier } from '@plugins/shared/index.js';
import * as babel from '@babel/types';
import type { ParseResult, ParserPlugin as BabelParserPlugin } from '@babel/parser';

// Re-export 共用函數供外部使用
export { isRelativePath };

/**
 * JavaScript AST 節點包裝器
 * 包裝 Babel AST 節點
 */
export interface JavaScriptASTNode extends ASTNode {
  readonly babelNode: babel.Node;
  readonly sourceFile: string;
}

/**
 * JavaScript AST 包裝器
 */
export interface JavaScriptAST extends AST {
  readonly root: JavaScriptASTNode;
  readonly babelAST: ParseResult<babel.File>;
  readonly sourceCode: string;
}

/**
 * JavaScript Symbol 資訊
 */
export interface JavaScriptSymbol extends Symbol {
  readonly babelNode: babel.Node;
  readonly isExported?: boolean;
  readonly isImported?: boolean;
}

/**
 * JavaScript 解析選項
 */
export interface JavaScriptParseOptions {
  readonly sourceType?: 'script' | 'module' | 'unambiguous';
  readonly allowImportExportEverywhere?: boolean;
  readonly allowAwaitOutsideFunction?: boolean;
  readonly allowReturnOutsideFunction?: boolean;
  readonly allowNewTargetOutsideFunction?: boolean;
  readonly allowSuperOutsideMethod?: boolean;
  readonly allowUndeclaredExports?: boolean;
  readonly attachComments?: boolean;
  readonly strictMode?: boolean;
  readonly ranges?: boolean;
  readonly tokens?: boolean;
  readonly preserveComments?: boolean;
  readonly plugins?: BabelParserPlugin[];
}

/**
 * Babel 插件類型（使用 Babel parser 原生型別）
 */
export type BabelPlugin = BabelParserPlugin;

/**
 * 預設的 JavaScript 解析選項
 */
export const DEFAULT_PARSE_OPTIONS: JavaScriptParseOptions = {
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
export const BABEL_NODE_TYPE_MAP: Partial<Record<string, string>> = {
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
export const BABEL_SYMBOL_TYPE_MAP: Partial<Record<string, SymbolType>> = {
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
 * 具有 index 屬性的 Babel 位置（用於 offset 計算）
 */
interface BabelPositionWithIndex {
  line: number;
  column: number;
  index?: number;
}

export function babelLocationToPosition(location: babel.SourceLocation): Range {
  const start = location.start as BabelPositionWithIndex;
  const end = location.end as BabelPositionWithIndex;
  return {
    start: {
      line: start.line - 1, // Babel 使用 1-based 行號，我們使用 0-based
      column: start.column,
      offset: start.index ?? 0
    },
    end: {
      line: end.line - 1,
      column: end.column,
      offset: end.index ?? 0
    }
  };
}

/**
 * 位置轉換為 Babel 位置
 */
export function positionToBabelLocation(position: Position): babel.SourceLocation {
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
export function getNodeName(node: babel.Node): string | undefined {
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
export function isSymbolDeclaration(node: babel.Node): boolean {
  return (
    babel.isClassDeclaration(node) ||
    babel.isFunctionDeclaration(node) ||
    babel.isVariableDeclarator(node) ||
    babel.isImportDefaultSpecifier(node) ||
    babel.isImportSpecifier(node) ||
    babel.isImportNamespaceSpecifier(node) ||
    babel.isClassMethod(node) ||
    babel.isClassProperty(node) ||
    babel.isObjectProperty(node) ||
    babel.isObjectMethod(node) ||
    babel.isArrowFunctionExpression(node)
  );
}

/**
 * 檢查節點是否為依賴相關節點
 */
export function isDependencyNode(node: babel.Node): boolean {
  return (
    babel.isImportDeclaration(node) ||
    babel.isExportNamedDeclaration(node) ||
    babel.isExportDefaultDeclaration(node) ||
    babel.isExportAllDeclaration(node) ||
    (babel.isCallExpression(node) &&
     babel.isIdentifier(node.callee) &&
     node.callee.name === 'require')
  );
}

/**
 * 獲取依賴路徑
 */
export function getDependencyPath(node: babel.Node): string | undefined {
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
 * 獲取導入的符號
 */
export function getImportedSymbols(node: babel.ImportDeclaration): string[] {
  const symbols: string[] = [];

  for (const specifier of node.specifiers) {
    if (babel.isImportDefaultSpecifier(specifier)) {
      symbols.push('default');
    } else if (babel.isImportSpecifier(specifier)) {
      symbols.push(specifier.local.name);
    } else if (babel.isImportNamespaceSpecifier(specifier)) {
      symbols.push('*');
    }
  }

  return symbols;
}

/**
 * 創建 JavaScript AST 節點
 */
export function createJavaScriptASTNode(
  babelNode: babel.Node,
  sourceFile: string
): JavaScriptASTNode {
  const type = BABEL_NODE_TYPE_MAP[babelNode.type] || babelNode.type;
  const range = babelNode.loc ? babelLocationToPosition(babelNode.loc) : {
    start: { line: 0, column: 0, offset: 0 },
    end: { line: 0, column: 0, offset: 0 }
  };

  const properties: Record<string, string | boolean | babel.Comment[] | null | undefined> = {
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
  const children: JavaScriptASTNode[] = [];

  // 使用 Babel traverse 的概念處理子節點
  const childKeys = babel.VISITOR_KEYS[babelNode.type];
  if (childKeys) {
    for (const key of childKeys) {
      // Babel 節點的屬性是動態的，需要用索引存取
      const child = (babelNode as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) {
          if (babel.isNode(item)) {
            children.push(createJavaScriptASTNode(item, sourceFile));
          }
        }
      } else if (babel.isNode(child)) {
        children.push(createJavaScriptASTNode(child, sourceFile));
      }
    }
  }

  const node: JavaScriptASTNode = {
    type,
    range,
    properties,
    children,
    babelNode,
    sourceFile
  };

  // 設定父子關係
  children.forEach(child => {
    (child as JavaScriptASTNode & { parent?: JavaScriptASTNode }).parent = node;
  });

  return node;
}

/**
 * JavaScript 保留字列表
 */
const JAVASCRIPT_RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  // ES6+
  'let', 'static', 'async', 'await',
  // Strict mode reserved words
  'implements', 'interface', 'package', 'private', 'protected', 'public',
  // Literals
  'null', 'true', 'false'
]);

/**
 * 驗證識別符名稱
 *
 * JavaScript 支援 Unicode 識別符：
 * - 第一個字元：Unicode 類別 ID_Start、底線、或 $
 * - 後續字元：Unicode 類別 ID_Continue 或 $
 *
 * 範例：
 * - const 用戶名稱 = "John"  // 合法
 * - let π = 3.14159          // 合法
 */
export function isValidIdentifier(name: string): boolean {
  return isValidUnicodeIdentifier(name) && !isReservedWord(name);
}

/**
 * 檢查是否為保留字
 */
export function isReservedWord(name: string): boolean {
  return JAVASCRIPT_RESERVED_WORDS.has(name);
}

/**
 * 錯誤類別
 */
export class JavaScriptParseError extends Error {
  constructor(
    message: string,
    public readonly babelError?: Error,
    public readonly location?: babel.SourceLocation
  ) {
    super(message);
    this.name = 'JavaScriptParseError';
  }
}

/**
 * 創建解析錯誤
 */
export function createParseError(
  message: string,
  babelError?: Error,
  location?: babel.SourceLocation
): JavaScriptParseError {
  return new JavaScriptParseError(message, babelError, location);
}

/**
 * 獲取檔案的預設 Babel 插件
 */
export function getPluginsForFile(filePath: string): BabelPlugin[] {
  const ext = filePath.substring(filePath.lastIndexOf('.'));
  const basePlugins = [...DEFAULT_PARSE_OPTIONS.plugins!];

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
export function getScopeType(node: babel.Node): string {
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