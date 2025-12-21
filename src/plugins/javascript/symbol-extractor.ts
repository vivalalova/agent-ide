/**
 * JavaScript 符號提取器
 * 從 AST 中提取函數、類別、變數等符號
 */

import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';
import type { Range } from '@shared/types/index.js';
import { SymbolType, createSymbol } from '@shared/types/index.js';
import type { JavaScriptAST, JavaScriptSymbol } from './types.js';
import { babelLocationToPosition } from './types.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as any).default || babelTraverse;

/**
 * 獲取節點的範圍資訊
 */
function getNodeRange(node: babel.Node): Range {
  if (node.loc) {
    return babelLocationToPosition(node.loc);
  }

  return {
    start: { line: 0, column: 0, offset: 0 },
    end: { line: 0, column: 0, offset: 0 }
  };
}

/**
 * 從 Babel 節點建立符號
 */
export function createSymbolFromNode(
  node: babel.Node,
  name: string,
  type: SymbolType,
  sourceFile: string,
  options: { isImported?: boolean; isExported?: boolean } = {}
): JavaScriptSymbol {
  const range = getNodeRange(node);
  const location = { filePath: sourceFile, range };

  const baseSymbol = createSymbol(name, type, location, undefined, []);

  return {
    ...baseSymbol,
    babelNode: node,
    isImported: options.isImported,
    isExported: options.isExported
  };
}

/**
 * 提取函數宣告符號
 */
export function extractFunctionSymbol(
  node: babel.FunctionDeclaration,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (node.id) {
    const symbol = createSymbolFromNode(
      node,
      node.id.name,
      SymbolType.Function,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取類別宣告符號
 */
export function extractClassSymbol(
  node: babel.ClassDeclaration,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (node.id) {
    const symbol = createSymbolFromNode(
      node,
      node.id.name,
      SymbolType.Class,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取變數宣告符號
 */
export function extractVariableSymbol(
  node: babel.VariableDeclarator,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (babel.isIdentifier(node.id)) {
    const symbol = createSymbolFromNode(
      node,
      node.id.name,
      SymbolType.Variable,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取 import 符號
 */
export function extractImportSymbol(
  node: babel.ImportDefaultSpecifier | babel.ImportSpecifier | babel.ImportNamespaceSpecifier,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  const symbol = createSymbolFromNode(
    node,
    node.local.name,
    SymbolType.Variable,
    sourceFile,
    { isImported: true }
  );
  symbols.push(symbol);
}

/**
 * 提取類別方法符號
 */
export function extractMethodSymbol(
  node: babel.ClassMethod,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (babel.isIdentifier(node.key)) {
    const symbol = createSymbolFromNode(
      node,
      node.key.name,
      SymbolType.Function,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取類別屬性符號
 */
export function extractPropertySymbol(
  node: babel.ClassProperty,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (babel.isIdentifier(node.key)) {
    const symbol = createSymbolFromNode(
      node,
      node.key.name,
      SymbolType.Variable,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取物件方法符號
 */
export function extractObjectMethodSymbol(
  node: babel.ObjectMethod,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (babel.isIdentifier(node.key)) {
    const symbol = createSymbolFromNode(
      node,
      node.key.name,
      SymbolType.Function,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * 提取物件屬性符號
 */
export function extractObjectPropertySymbol(
  node: babel.ObjectProperty,
  symbols: JavaScriptSymbol[],
  sourceFile: string
): void {
  if (babel.isIdentifier(node.key)) {
    const symbol = createSymbolFromNode(
      node,
      node.key.name,
      SymbolType.Variable,
      sourceFile
    );
    symbols.push(symbol);
  }
}

/**
 * JavaScript 符號提取器類別
 * 包裝現有函式，提供與 TypeScript 一致的介面
 */
export class JavaScriptSymbolExtractor {
  /**
   * 從 AST 中提取所有符號
   */
  async extractSymbols(ast: JavaScriptAST): Promise<JavaScriptSymbol[]> {
    const symbols: JavaScriptSymbol[] = [];
    const sourceFile = ast.sourceFile;

    traverse(ast.babelAST, {
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        extractFunctionSymbol(path.node, symbols, sourceFile);
      },
      ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
        extractClassSymbol(path.node, symbols, sourceFile);
      },
      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        extractVariableSymbol(path.node, symbols, sourceFile);
      },
      ImportDefaultSpecifier: (path: NodePath<babel.ImportDefaultSpecifier>) => {
        extractImportSymbol(path.node, symbols, sourceFile);
      },
      ImportSpecifier: (path: NodePath<babel.ImportSpecifier>) => {
        extractImportSymbol(path.node, symbols, sourceFile);
      },
      ImportNamespaceSpecifier: (path: NodePath<babel.ImportNamespaceSpecifier>) => {
        extractImportSymbol(path.node, symbols, sourceFile);
      },
      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        extractMethodSymbol(path.node, symbols, sourceFile);
      },
      ClassProperty: (path: NodePath<babel.ClassProperty>) => {
        extractPropertySymbol(path.node, symbols, sourceFile);
      },
      ObjectMethod: (path: NodePath<babel.ObjectMethod>) => {
        extractObjectMethodSymbol(path.node, symbols, sourceFile);
      },
      ObjectProperty: (path: NodePath<babel.ObjectProperty>) => {
        extractObjectPropertySymbol(path.node, symbols, sourceFile);
      }
    });

    return symbols;
  }
}

/**
 * 建立符號提取器實例
 */
export function createSymbolExtractor(): JavaScriptSymbolExtractor {
  return new JavaScriptSymbolExtractor();
}
