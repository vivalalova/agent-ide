/**
 * TypeScript 複雜度分析器
 * 提供循環複雜度和認知複雜度分析功能
 */

import * as ts from 'typescript';
import type { ComplexityMetrics } from '../../../infrastructure/parser/analysis-types.js';
import type { TypeScriptAST } from '../types.js';

/**
 * 函式複雜度資訊
 */
interface FunctionComplexity {
  name: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
}

/**
 * TypeScript 複雜度分析器
 */
export class ComplexityAnalyzer {
  /**
   * 分析程式碼複雜度
   * @param code 原始程式碼
   * @param ast TypeScript AST
   * @returns 複雜度指標
   */
  async analyze(code: string, ast: TypeScriptAST): Promise<ComplexityMetrics> {
    if (!code || code.trim().length === 0) {
      return {
        cyclomaticComplexity: 1,
        cognitiveComplexity: 0,
        evaluation: 'simple',
        functionCount: 0,
        averageComplexity: 0,
        maxComplexity: 0
      };
    }

    const functions = this.extractFunctions(ast.tsSourceFile);

    if (functions.length === 0) {
      return {
        cyclomaticComplexity: 1,
        cognitiveComplexity: 0,
        evaluation: 'simple',
        functionCount: 0,
        averageComplexity: 0,
        maxComplexity: 0
      };
    }

    // 計算每個函式的複雜度
    const functionComplexities = functions.map(fn => ({
      name: this.getFunctionName(fn),
      cyclomaticComplexity: this.calculateCyclomaticComplexity(fn),
      cognitiveComplexity: this.calculateCognitiveComplexity(fn)
    }));

    // 聚合統計
    const totalCyclomatic = functionComplexities.reduce(
      (sum, fn) => sum + fn.cyclomaticComplexity,
      0
    );
    const totalCognitive = functionComplexities.reduce(
      (sum, fn) => sum + fn.cognitiveComplexity,
      0
    );
    const maxComplexity = Math.max(
      ...functionComplexities.map(fn => fn.cyclomaticComplexity)
    );
    const maxComplexityFunction = functionComplexities.find(
      fn => fn.cyclomaticComplexity === maxComplexity
    );

    return {
      cyclomaticComplexity: totalCyclomatic,
      cognitiveComplexity: totalCognitive,
      evaluation: this.evaluateComplexity(maxComplexity),
      functionCount: functions.length,
      averageComplexity: totalCyclomatic / functions.length,
      maxComplexity,
      maxComplexityFunction: maxComplexityFunction?.name
    };
  }

  /**
   * 提取所有函式節點
   */
  private extractFunctions(sourceFile: ts.SourceFile): ts.FunctionLikeDeclaration[] {
    const functions: ts.FunctionLikeDeclaration[] = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node) ||
        ts.isFunctionExpression(node)
      ) {
        functions.push(node);
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return functions;
  }

  /**
   * 獲取函式名稱
   */
  private getFunctionName(node: ts.FunctionLikeDeclaration): string {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      return '<anonymous>';
    }
    return '<unknown>';
  }

  /**
   * 計算循環複雜度（McCabe）
   */
  private calculateCyclomaticComplexity(node: ts.Node): number {
    let complexity = 1; // 基礎路徑

    const visit = (n: ts.Node): void => {
      // 條件分支
      if (
        ts.isIfStatement(n) ||
        ts.isConditionalExpression(n) ||
        ts.isForStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isWhileStatement(n) ||
        ts.isDoStatement(n) ||
        ts.isCatchClause(n)
      ) {
        complexity++;
      }

      // Switch case
      if (ts.isCaseClause(n)) {
        complexity++;
      }

      // 邏輯運算符
      if (ts.isBinaryExpression(n)) {
        const operator = n.operatorToken.kind;
        if (
          operator === ts.SyntaxKind.AmpersandAmpersandToken ||
          operator === ts.SyntaxKind.BarBarToken
        ) {
          complexity++;
        }
      }

      ts.forEachChild(n, visit);
    };

    if (node.kind !== ts.SyntaxKind.SourceFile) {
      ts.forEachChild(node, visit);
    }

    return complexity;
  }

  /**
   * 計算認知複雜度
   */
  private calculateCognitiveComplexity(node: ts.Node): number {
    let complexity = 0;
    let nestingLevel = 0;

    const visit = (n: ts.Node, isNestingIncrement: boolean): void => {
      let currentNesting = nestingLevel;

      // 增加複雜度的控制結構
      if (
        ts.isIfStatement(n) ||
        ts.isForStatement(n) ||
        ts.isForInStatement(n) ||
        ts.isForOfStatement(n) ||
        ts.isWhileStatement(n) ||
        ts.isDoStatement(n)
      ) {
        complexity += 1 + nestingLevel;
        currentNesting++;
      } else if (ts.isCatchClause(n)) {
        complexity += 1 + nestingLevel;
        currentNesting++;
      } else if (ts.isSwitchStatement(n)) {
        complexity += 1 + nestingLevel;
        currentNesting++;
      } else if (ts.isConditionalExpression(n)) {
        complexity += 1;
      } else if (ts.isBinaryExpression(n)) {
        const operator = n.operatorToken.kind;
        if (
          operator === ts.SyntaxKind.AmpersandAmpersandToken ||
          operator === ts.SyntaxKind.BarBarToken
        ) {
          complexity += 1;
        }
      }

      // 函式不增加巢狀層級（reset）
      if (
        ts.isFunctionDeclaration(n) ||
        ts.isArrowFunction(n) ||
        ts.isFunctionExpression(n)
      ) {
        currentNesting = 0;
      }

      // 遞迴遍歷
      const previousNesting = nestingLevel;
      nestingLevel = currentNesting;
      ts.forEachChild(n, child => visit(child, true));
      nestingLevel = previousNesting;
    };

    if (node.kind !== ts.SyntaxKind.SourceFile) {
      ts.forEachChild(node, child => visit(child, false));
    }

    return complexity;
  }

  /**
   * 評估複雜度等級
   */
  private evaluateComplexity(complexity: number): 'simple' | 'moderate' | 'complex' | 'very-complex' {
    if (complexity <= 5) {
      return 'simple';
    }
    if (complexity <= 10) {
      return 'moderate';
    }
    if (complexity <= 20) {
      return 'complex';
    }
    return 'very-complex';
  }
}
