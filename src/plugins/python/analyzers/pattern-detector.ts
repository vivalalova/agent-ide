/**
 * Python 設計模式檢測器
 * 檢測 Singleton、Factory、Decorator 等模式
 */

import type { PatternMatch } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, type PythonASTNode, PythonNodeKind } from '../types.js';
import { traverseAST, getNodeText } from '../tree-sitter-bridge.js';

/**
 * Python 設計模式檢測器類別
 */
export class PythonPatternDetector {
  /**
   * 檢測設計模式
   */
  detect(code: string, ast: PythonAST): PatternMatch[] {
    const patterns: PatternMatch[] = [];

    // 檢測 Singleton 模式
    this.detectSingleton(ast, patterns);

    // 檢測 Factory 模式
    this.detectFactory(ast, patterns);

    // 檢測 Decorator 模式
    this.detectDecorator(ast, patterns);

    // 檢測反模式
    this.detectAntiPatterns(ast, patterns);

    return patterns;
  }

  /**
   * 檢測 Singleton 模式
   */
  private detectSingleton(ast: PythonAST, patterns: PatternMatch[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.ClassDefinition) {
        const classText = node.treeSitterNode.text;

        // 檢查常見的 Singleton 實作方式
        const isSingleton = (
          classText.includes('_instance')
          && (classText.includes('__new__') || classText.includes('__call__'))
        ) || (
          classText.includes('@singleton')
        );

        if (isSingleton) {
          const nameNode = node.treeSitterNode.childForFieldName('name');
          patterns.push({
            pattern: 'Singleton',
            type: 'design-pattern',
            locations: [{
              filePath: ast.sourceFile,
              startLine: node.range.start.line,
              endLine: node.range.end.line
            }],
            count: 1,
            severity: 'low',
            suggestion: '確保 Singleton 是否真的必要，考慮使用依賴注入'
          });
        }
      }
    });
  }

  /**
   * 檢測 Factory 模式
   */
  private detectFactory(ast: PythonAST, patterns: PatternMatch[]): void {
    const factoryLocations: PatternMatch['locations'] = [];

    traverseAST(ast.root, (node) => {
      if (
        node.pythonKind === PythonNodeKind.FunctionDefinition
        || node.pythonKind === PythonNodeKind.ClassDefinition
      ) {
        const nameNode = node.treeSitterNode.childForFieldName('name');
        const name = nameNode?.text || '';

        // 檢查命名是否包含 Factory 或 create
        if (
          name.toLowerCase().includes('factory')
          || name.toLowerCase().startsWith('create_')
          || name.toLowerCase().startsWith('make_')
          || name.toLowerCase().startsWith('build_')
        ) {
          factoryLocations.push({
            filePath: ast.sourceFile,
            startLine: node.range.start.line,
            endLine: node.range.end.line
          });
        }
      }
    });

    if (factoryLocations.length > 0) {
      patterns.push({
        pattern: 'Factory',
        type: 'design-pattern',
        locations: factoryLocations,
        count: factoryLocations.length,
        severity: 'low'
      });
    }
  }

  /**
   * 檢測 Decorator 模式
   */
  private detectDecorator(ast: PythonAST, patterns: PatternMatch[]): void {
    const decoratorLocations: PatternMatch['locations'] = [];

    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.DecoratedDefinition) {
        decoratorLocations.push({
          filePath: ast.sourceFile,
          startLine: node.range.start.line,
          endLine: node.range.end.line
        });
      }
    });

    if (decoratorLocations.length > 0) {
      patterns.push({
        pattern: 'Decorator',
        type: 'design-pattern',
        locations: decoratorLocations,
        count: decoratorLocations.length,
        severity: 'low'
      });
    }
  }

  /**
   * 檢測反模式
   */
  private detectAntiPatterns(ast: PythonAST, patterns: PatternMatch[]): void {
    // 檢測 God Class（過多方法的類別）
    this.detectGodClass(ast, patterns);

    // 檢測過長的函式
    this.detectLongFunction(ast, patterns);

    // 檢測過深的巢狀
    this.detectDeepNesting(ast, patterns);
  }

  /**
   * 檢測 God Class
   */
  private detectGodClass(ast: PythonAST, patterns: PatternMatch[]): void {
    traverseAST(ast.root, (node) => {
      if (node.pythonKind === PythonNodeKind.ClassDefinition) {
        let methodCount = 0;

        traverseAST(node, (child) => {
          if (
            child.pythonKind === PythonNodeKind.FunctionDefinition
            || child.pythonKind === PythonNodeKind.AsyncFunctionDefinition
          ) {
            methodCount++;
          }
        });

        if (methodCount > 20) {
          const nameNode = node.treeSitterNode.childForFieldName('name');
          patterns.push({
            pattern: 'God Class',
            type: 'anti-pattern',
            locations: [{
              filePath: ast.sourceFile,
              startLine: node.range.start.line,
              endLine: node.range.end.line
            }],
            count: 1,
            severity: 'high',
            suggestion: `類別 '${nameNode?.text}' 有 ${methodCount} 個方法，考慮拆分成更小的類別`
          });
        }
      }
    });
  }

  /**
   * 檢測過長的函式
   */
  private detectLongFunction(ast: PythonAST, patterns: PatternMatch[]): void {
    const longFunctionLocations: PatternMatch['locations'] = [];

    traverseAST(ast.root, (node) => {
      if (
        node.pythonKind === PythonNodeKind.FunctionDefinition
        || node.pythonKind === PythonNodeKind.AsyncFunctionDefinition
      ) {
        const lineCount = node.range.end.line - node.range.start.line + 1;

        if (lineCount > 50) {
          longFunctionLocations.push({
            filePath: ast.sourceFile,
            startLine: node.range.start.line,
            endLine: node.range.end.line
          });
        }
      }
    });

    if (longFunctionLocations.length > 0) {
      patterns.push({
        pattern: 'Long Function',
        type: 'anti-pattern',
        locations: longFunctionLocations,
        count: longFunctionLocations.length,
        severity: 'medium',
        suggestion: '函式超過 50 行，考慮拆分成更小的函式'
      });
    }
  }

  /**
   * 檢測過深的巢狀
   */
  private detectDeepNesting(ast: PythonAST, patterns: PatternMatch[]): void {
    const deepNestingLocations: PatternMatch['locations'] = [];

    const checkNestingDepth = (node: PythonASTNode, depth: number): void => {
      const nestingNodes = new Set([
        PythonNodeKind.IfStatement,
        PythonNodeKind.ForStatement,
        PythonNodeKind.WhileStatement,
        PythonNodeKind.TryStatement,
        PythonNodeKind.WithStatement
      ]);

      if (nestingNodes.has(node.pythonKind)) {
        depth++;
        if (depth > 4) {
          deepNestingLocations.push({
            filePath: ast.sourceFile,
            startLine: node.range.start.line,
            endLine: node.range.end.line
          });
        }
      }

      for (const child of node.children) {
        checkNestingDepth(child as PythonASTNode, depth);
      }
    };

    checkNestingDepth(ast.root, 0);

    if (deepNestingLocations.length > 0) {
      patterns.push({
        pattern: 'Deep Nesting',
        type: 'anti-pattern',
        locations: deepNestingLocations,
        count: deepNestingLocations.length,
        severity: 'medium',
        suggestion: '巢狀層級超過 4 層，考慮使用 early return 或提取函式'
      });
    }
  }
}
