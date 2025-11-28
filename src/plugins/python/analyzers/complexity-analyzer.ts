/**
 * Python 複雜度分析器
 * 計算循環複雜度和認知複雜度
 */

import type { ComplexityMetrics } from '@infrastructure/parser/analysis-types.js';
import { type PythonAST, type PythonASTNode, PythonNodeKind, COMPLEXITY_WEIGHTS } from '../types.js';
import { traverseAST, getNodeText } from '../tree-sitter-bridge.js';

/**
 * 函式複雜度資訊
 */
interface FunctionComplexity {
  name: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  startLine: number;
}

/**
 * Python 複雜度分析器類別
 */
export class PythonComplexityAnalyzer {
  /**
   * 分析程式碼複雜度
   */
  analyze(code: string, ast: PythonAST): ComplexityMetrics {
    const functionComplexities = this.extractFunctionComplexities(ast);

    if (functionComplexities.length === 0) {
      return this.createDefaultMetrics();
    }

    const totalCyclomatic = functionComplexities.reduce((sum, fc) => sum + fc.cyclomaticComplexity, 0);
    const totalCognitive = functionComplexities.reduce((sum, fc) => sum + fc.cognitiveComplexity, 0);
    const maxComplexityFunc = functionComplexities.reduce(
      (max, fc) => fc.cyclomaticComplexity > max.cyclomaticComplexity ? fc : max,
      functionComplexities[0]
    );

    const avgComplexity = totalCyclomatic / functionComplexities.length;

    return {
      cyclomaticComplexity: totalCyclomatic,
      cognitiveComplexity: totalCognitive,
      evaluation: this.evaluateComplexity(avgComplexity),
      functionCount: functionComplexities.length,
      averageComplexity: Math.round(avgComplexity * 100) / 100,
      maxComplexity: maxComplexityFunc.cyclomaticComplexity,
      maxComplexityFunction: maxComplexityFunc.name
    };
  }

  /**
   * 提取所有函式的複雜度
   */
  private extractFunctionComplexities(ast: PythonAST): FunctionComplexity[] {
    const complexities: FunctionComplexity[] = [];

    traverseAST(ast.root, (node): boolean | void => {
      if (
        node.pythonKind === PythonNodeKind.FunctionDefinition
        || node.pythonKind === PythonNodeKind.AsyncFunctionDefinition
      ) {
        const name = this.getFunctionName(node);
        const cyclomatic = this.calculateCyclomaticComplexity(node);
        const cognitive = this.calculateCognitiveComplexity(node);

        complexities.push({
          name,
          cyclomaticComplexity: cyclomatic,
          cognitiveComplexity: cognitive,
          startLine: node.range.start.line
        });

        // 不繼續遍歷函式內部（避免重複計算巢狀函式）
        return false;
      }
    });

    return complexities;
  }

  /**
   * 計算循環複雜度
   * M = E - N + 2P（簡化版：計算決策點數量 + 1）
   */
  private calculateCyclomaticComplexity(node: PythonASTNode): number {
    let complexity = 1; // 基礎複雜度

    traverseAST(node, (child) => {
      const weight = COMPLEXITY_WEIGHTS[child.pythonKind];
      if (weight) {
        complexity += weight;
      }
    });

    return complexity;
  }

  /**
   * 計算認知複雜度
   * 考慮巢狀深度和結構複雜性
   */
  private calculateCognitiveComplexity(node: PythonASTNode): number {
    let complexity = 0;
    let nestingLevel = 0;

    const traverse = (current: PythonASTNode): void => {
      const isNestingIncrement = this.isNestingStructure(current);
      const isComplexityIncrement = this.isComplexityIncrement(current);

      if (isNestingIncrement) {
        nestingLevel++;
      }

      if (isComplexityIncrement) {
        // 基礎增量 + 巢狀懲罰
        complexity += 1 + nestingLevel;
      }

      for (const child of current.children) {
        traverse(child as PythonASTNode);
      }

      if (isNestingIncrement) {
        nestingLevel--;
      }
    };

    traverse(node);
    return complexity;
  }

  /**
   * 判斷是否為巢狀結構
   */
  private isNestingStructure(node: PythonASTNode): boolean {
    const nestingKinds = new Set([
      PythonNodeKind.IfStatement,
      PythonNodeKind.ForStatement,
      PythonNodeKind.AsyncForStatement,
      PythonNodeKind.WhileStatement,
      PythonNodeKind.TryStatement,
      PythonNodeKind.WithStatement,
      PythonNodeKind.AsyncWithStatement,
      PythonNodeKind.MatchStatement,
      PythonNodeKind.LambdaExpression
    ]);

    return nestingKinds.has(node.pythonKind);
  }

  /**
   * 判斷是否增加複雜度
   */
  private isComplexityIncrement(node: PythonASTNode): boolean {
    const incrementKinds = new Set([
      PythonNodeKind.IfStatement,
      PythonNodeKind.ElifClause,
      PythonNodeKind.ForStatement,
      PythonNodeKind.AsyncForStatement,
      PythonNodeKind.WhileStatement,
      PythonNodeKind.ExceptClause,
      PythonNodeKind.MatchStatement,
      PythonNodeKind.CaseClause,
      PythonNodeKind.BooleanOperator,
      PythonNodeKind.ConditionalExpression,
      PythonNodeKind.ListComprehension,
      PythonNodeKind.DictionaryComprehension,
      PythonNodeKind.SetComprehension,
      PythonNodeKind.GeneratorExpression
    ]);

    return incrementKinds.has(node.pythonKind);
  }

  /**
   * 獲取函式名稱
   */
  private getFunctionName(node: PythonASTNode): string {
    const nameNode = node.treeSitterNode.childForFieldName('name');
    return nameNode?.text || '<anonymous>';
  }

  /**
   * 評估複雜度等級
   */
  private evaluateComplexity(avgComplexity: number): ComplexityMetrics['evaluation'] {
    if (avgComplexity <= 5) {return 'simple';}
    if (avgComplexity <= 10) {return 'moderate';}
    if (avgComplexity <= 20) {return 'complex';}
    return 'very-complex';
  }

  /**
   * 創建預設指標
   */
  private createDefaultMetrics(): ComplexityMetrics {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 0,
      evaluation: 'simple',
      functionCount: 0,
      averageComplexity: 0,
      maxComplexity: 0
    };
  }
}
