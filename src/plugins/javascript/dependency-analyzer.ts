/**
 * JavaScript Dependency Analyzer
 * 分析 JavaScript 程式碼（Babel AST）中的依賴關係
 */

import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

import type { Dependency } from '@shared/types/index.js';
import { DependencyType, createDependency } from '@shared/types/index.js';
import { JavaScriptAST, isRelativePath, getImportedSymbols } from './types.js';
import { isRequireCallExpression } from './cjs-require-ast.js';

/**
 * JavaScript 依賴分析器類別
 */
export class JavaScriptDependencyAnalyzer {
  /**
   * 提取依賴關係
   */
  async extractDependencies(ast: JavaScriptAST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];

    traverse(ast.babelAST, {
      ImportDeclaration: (path: NodePath<babel.ImportDeclaration>) => {
        this.extractImportDependency(path.node, dependencies);
      },

      ExportNamedDeclaration: (path: NodePath<babel.ExportNamedDeclaration>) => {
        this.extractExportDependency(path.node, dependencies);
      },

      ExportAllDeclaration: (path: NodePath<babel.ExportAllDeclaration>) => {
        this.extractExportDependency(path.node, dependencies);
      },

      CallExpression: (path: NodePath<babel.CallExpression>) => {
        // 處理 require() 和動態 import()
        this.extractCallExpressionDependency(path, dependencies);
      }
    });

    return dependencies;
  }

  private extractImportDependency(
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

  private extractExportDependency(
    node: babel.ExportNamedDeclaration | babel.ExportAllDeclaration,
    dependencies: Dependency[]
  ): void {
    if (node.source) {
      const target = node.source.value;

      const dependency = createDependency(
        target,
        DependencyType.Import,
        isRelativePath(target),
        this.getExportedSymbols(node)
      );

      dependencies.push(dependency);
    }
  }

  /**
   * re-export 的符號（對齊 TS getExportedSymbols）：`export { a, b } from` 取匯出名，
   * `export * from` / `export * as ns from` 記為 '*'
   */
  private getExportedSymbols(node: babel.ExportNamedDeclaration | babel.ExportAllDeclaration): string[] {
    if (babel.isExportAllDeclaration(node)) {
      return ['*'];
    }
    const symbols: string[] = [];
    for (const specifier of node.specifiers) {
      if (babel.isExportNamespaceSpecifier(specifier)) {
        symbols.push('*');
      } else if (babel.isExportSpecifier(specifier)) {
        const exported = specifier.exported;
        symbols.push(babel.isIdentifier(exported) ? exported.name : exported.value);
      }
    }
    return symbols;
  }

  /**
   * require 導入的符號（對齊 TS getRequireImportedSymbols）：
   * `const m = require()` 取 m，`const { a, b } = require()` 取各綁定名
   */
  private getRequireImportedSymbols(path: NodePath<babel.CallExpression>): string[] {
    const parent = path.parent;
    if (!babel.isVariableDeclarator(parent) || parent.init !== path.node) {
      return [];
    }
    if (babel.isIdentifier(parent.id)) {
      return [parent.id.name];
    }
    const symbols: string[] = [];
    if (babel.isObjectPattern(parent.id)) {
      for (const property of parent.id.properties) {
        if (babel.isObjectProperty(property) && babel.isIdentifier(property.value)) {
          symbols.push(property.value.name);
        }
      }
    }
    return symbols;
  }

  private extractCallExpressionDependency(
    path: NodePath<babel.CallExpression>,
    dependencies: Dependency[]
  ): void {
    const node = path.node;
    // 處理 require() 呼叫
    if (isRequireCallExpression(node)) {
      const firstArg = node.arguments[0];
      if (babel.isStringLiteral(firstArg)) {
        const target = firstArg.value;

        const dependency = createDependency(
          target,
          DependencyType.Require,
          isRelativePath(target),
          this.getRequireImportedSymbols(path)
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
}
