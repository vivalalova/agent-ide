/**
 * JavaScript 依賴提取器
 * 從 AST 中提取 import/export/require 依賴
 */

import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';
import type { Dependency } from '@shared/types/index.js';
import { DependencyType, createDependency } from '@shared/types/index.js';
import { isRelativePath } from '../shared/index.js';
import type { JavaScriptAST } from './types.js';
import { getImportedSymbols } from './types.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as any).default || babelTraverse;

/**
 * 提取 import 宣告的依賴
 */
export function extractImportDependency(
  node: babel.ImportDeclaration,
  dependencies: Dependency[]
): void {
  const target = node.source.value;

  const dependency = createDependency(
    target,
    DependencyType.Import,
    isRelativePath(target),
    getImportedSymbols(node)
  );

  dependencies.push(dependency);
}

/**
 * 提取 export 宣告的依賴（從其他模組 re-export）
 */
export function extractExportDependency(
  node: babel.ExportNamedDeclaration | babel.ExportAllDeclaration,
  dependencies: Dependency[]
): void {
  if (node.source) {
    const target = node.source.value;

    const dependency = createDependency(
      target,
      DependencyType.Import,
      isRelativePath(target),
      []
    );

    dependencies.push(dependency);
  }
}

/**
 * 提取 require() 和動態 import() 的依賴
 */
export function extractCallExpressionDependency(
  node: babel.CallExpression,
  dependencies: Dependency[]
): void {
  // 處理 require() 呼叫
  if (babel.isIdentifier(node.callee) && node.callee.name === 'require') {
    const firstArg = node.arguments[0];
    if (babel.isStringLiteral(firstArg)) {
      const target = firstArg.value;

      const dependency = createDependency(
        target,
        DependencyType.Require,
        isRelativePath(target),
        []
      );

      dependencies.push(dependency);
    }
  }

  // 處理動態 import()
  if (babel.isImport(node.callee)) {
    const firstArg = node.arguments[0];
    if (babel.isStringLiteral(firstArg)) {
      const target = firstArg.value;

      const dependency = createDependency(
        target,
        DependencyType.Import,
        isRelativePath(target),
        []
      );

      dependencies.push(dependency);
    }
  }
}

/**
 * JavaScript 依賴提取器類別
 * 包裝現有函式，提供與 TypeScript 一致的介面
 */
export class JavaScriptDependencyExtractor {
  /**
   * 從 AST 中提取所有依賴
   */
  async extractDependencies(ast: JavaScriptAST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    traverse(ast.babelAST, {
      ImportDeclaration: (path: NodePath<babel.ImportDeclaration>) => {
        extractImportDependency(path.node, dependencies);
      },
      ExportNamedDeclaration: (path: NodePath<babel.ExportNamedDeclaration>) => {
        extractExportDependency(path.node, dependencies);
      },
      ExportAllDeclaration: (path: NodePath<babel.ExportAllDeclaration>) => {
        extractExportDependency(path.node, dependencies);
      },
      CallExpression: (path: NodePath<babel.CallExpression>) => {
        extractCallExpressionDependency(path.node, dependencies);
      }
    });

    return dependencies;
  }
}

/**
 * 建立依賴提取器實例
 */
export function createDependencyExtractor(): JavaScriptDependencyExtractor {
  return new JavaScriptDependencyExtractor();
}
