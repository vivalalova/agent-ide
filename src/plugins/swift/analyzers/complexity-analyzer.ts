/**
 * Swift 複雜度分析器
 * 提供循環複雜度和認知複雜度分析功能
 */

import type { ComplexityMetrics } from '../../../infrastructure/parser/analysis-types.js';

/**
 * 函式複雜度資訊
 */
interface FunctionComplexity {
  name: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
}

/**
 * Swift 複雜度分析器
 */
export class ComplexityAnalyzer {
  /**
   * 分析程式碼複雜度
   * @param code 原始程式碼
   * @returns 複雜度指標
   */
  async analyze(code: string): Promise<ComplexityMetrics> {
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

    const functions = this.extractFunctions(code);

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
      name: fn.name,
      cyclomaticComplexity: this.calculateCyclomaticComplexity(fn.body),
      cognitiveComplexity: this.calculateCognitiveComplexity(fn.body)
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
   * 提取所有函式
   */
  private extractFunctions(code: string): Array<{ name: string; body: string }> {
    const functions: Array<{ name: string; body: string }> = [];

    // Swift 函式模式：func name(...) { ... }
    const funcRegex = /func\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+)?(?:->\s*[^{]+)?\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = funcRegex.exec(code)) !== null) {
      const funcName = match[1];
      const startPos = match.index + match[0].length - 1;
      const endPos = this.findMatchingBrace(code, startPos);

      if (endPos !== -1) {
        const body = code.substring(startPos + 1, endPos);
        functions.push({ name: funcName, body });
      }
    }

    // SwiftUI body property
    const bodyRegex = /var\s+body:\s*some\s+View\s*\{/g;
    while ((match = bodyRegex.exec(code)) !== null) {
      const startPos = match.index + match[0].length - 1;
      const endPos = this.findMatchingBrace(code, startPos);

      if (endPos !== -1) {
        const body = code.substring(startPos + 1, endPos);
        functions.push({ name: 'body', body });
      }
    }

    return functions;
  }

  /**
   * 找到配對的右大括號
   */
  private findMatchingBrace(content: string, startPos: number): number {
    let braceCount = 1;
    let inString = false;
    let stringChar = '';

    for (let i = startPos + 1; i < content.length; i++) {
      const char = content[i];
      const prevChar = content[i - 1];

      // 處理字串
      if ((char === '"' || char === '\'') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }

  /**
   * 計算循環複雜度（McCabe）
   */
  private calculateCyclomaticComplexity(code: string): number {
    let complexity = 1; // 基礎路徑

    // Swift 條件分支
    const patterns = [
      /\bif\b/g,           // if
      /\bguard\b/g,        // guard
      /\belse\s+if\b/g,    // else if
      /\bwhile\b/g,        // while
      /\bfor\b/g,          // for
      /\brepeat\b/g,       // repeat
      /\bcase\b/g,         // switch case
      /\bcatch\b/g,        // catch
      /\?\?/g,             // nil coalescing
      /\&\&/g,             // logical AND
      /\|\|/g              // logical OR
    ];

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * 計算認知複雜度
   */
  private calculateCognitiveComplexity(code: string): number {
    let complexity = 0;
    const lines = code.split('\n');
    let nestingLevel = 0;
    let braceCount = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      // 計算大括號層級
      for (const char of trimmed) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }

      nestingLevel = Math.max(0, braceCount);

      // 增加複雜度的控制結構
      if (/\b(if|guard|while|for|switch|catch)\b/.test(trimmed)) {
        complexity += 1 + nestingLevel;
      }

      // 邏輯運算符
      if (/(\&\&|\|\|)/.test(trimmed)) {
        complexity += 1;
      }

      // 嵌套三元運算符
      if (/\?.*:/.test(trimmed)) {
        complexity += 1;
      }
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

/**
 * 預設導出分析函式
 */
export default async function analyzeComplexity(code: string): Promise<ComplexityMetrics> {
  const analyzer = new ComplexityAnalyzer();
  return analyzer.analyze(code);
}
