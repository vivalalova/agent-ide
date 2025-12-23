/**
 * JavaScript 設計模式分析器
 * 負責識別程式碼中的設計模式（如 Factory Pattern）
 */

import { parse as babelParse } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

import { type PatternInfo } from '@infrastructure/parser/index.js';
import {
  calculateFactoryConfidence,
  createFactoryPatternInfo
} from '@plugins/shared/index.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/**
 * JavaScript 設計模式分析器
 * 識別程式碼中的設計模式，包括 Factory、Singleton 等
 */
export class PatternAnalyzer {
  /**
   * 識別程式碼中的設計模式
   * JavaScript 沒有型別標註，因此主要依賴：
   * 1. 函數體內的 new 表達式
   * 2. 回傳物件字面量
   * 3. 函數名稱（作為輔助信號）
   */
  identifyPatterns(code: string): PatternInfo[] | null {
    try {
      const ast = babelParse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx']
      });

      const patterns: PatternInfo[] = [];

      traverse(ast, {
        FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
          if (path.node.id) {
            const factoryInfo = this.analyzeJSFactoryPattern(path.node.id.name, path.node.body);
            if (factoryInfo) {
              patterns.push(factoryInfo);
            }
          }
        },

        VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
          if (babel.isIdentifier(path.node.id) && path.node.init) {
            const init = path.node.init;
            if (babel.isArrowFunctionExpression(init) || babel.isFunctionExpression(init)) {
              const body = init.body;
              const factoryInfo = babel.isBlockStatement(body)
                ? this.analyzeJSFactoryPattern(path.node.id.name, body)
                : this.analyzeJSFactoryExpression(path.node.id.name, body);
              if (factoryInfo) {
                patterns.push(factoryInfo);
              }
            }
          }
        }
      });

      return patterns;
    } catch (error) {
      // 解析失敗，拋出錯誤讓呼叫端處理
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`JavaScript 設計模式分析解析失敗: ${errorMessage}`);
    }
  }

  /**
   * 分析 JavaScript 函數是否為 factory 模式
   * 判斷條件：函數體內有 new 表達式或回傳物件字面量
   */
  private analyzeJSFactoryPattern(
    functionName: string,
    body: babel.BlockStatement
  ): PatternInfo | null {
    let hasNewExpression = false;
    let hasObjectReturn = false;
    let producedType: string | undefined;

    // 遍歷函數體
    const checkNode = (node: babel.Node): void => {
      // 檢查 new 表達式
      if (babel.isNewExpression(node)) {
        hasNewExpression = true;
        // 嘗試提取建構的類別名稱
        if (babel.isIdentifier(node.callee)) {
          producedType = node.callee.name;
        }
      }

      // 檢查 return 語句
      if (babel.isReturnStatement(node) && node.argument) {
        if (babel.isObjectExpression(node.argument)) {
          hasObjectReturn = true;
          producedType = 'Object';
        } else if (babel.isNewExpression(node.argument)) {
          hasNewExpression = true;
          if (babel.isIdentifier(node.argument.callee)) {
            producedType = node.argument.callee.name;
          }
        }
      }
    };

    // 遍歷所有語句
    for (const statement of body.body) {
      this.traverseNode(statement, checkNode);
    }

    // 只有當有 factory 行為時才返回（使用共用模組）
    if (hasNewExpression || hasObjectReturn) {
      const confidence = calculateFactoryConfidence(
        functionName,
        undefined,
        hasNewExpression,
        hasObjectReturn
      );
      return createFactoryPatternInfo(functionName, confidence, producedType);
    }

    return null;
  }

  /**
   * 分析箭頭函數簡寫的 factory 模式（使用共用模組）
   */
  private analyzeJSFactoryExpression(
    functionName: string,
    expr: babel.Expression
  ): PatternInfo | null {
    if (babel.isNewExpression(expr)) {
      const producedType = babel.isIdentifier(expr.callee) ? expr.callee.name : undefined;
      const confidence = calculateFactoryConfidence(functionName, undefined, true, false);
      return createFactoryPatternInfo(functionName, confidence, producedType);
    }

    if (babel.isObjectExpression(expr)) {
      const confidence = calculateFactoryConfidence(functionName, undefined, false, true);
      return createFactoryPatternInfo(functionName, confidence, 'Object');
    }

    return null;
  }

  /**
   * 遞迴遍歷節點
   */
  private traverseNode(node: babel.Node, callback: (node: babel.Node) => void): void {
    callback(node);

    // 遍歷所有子節點
    for (const key of Object.keys(node)) {
      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              this.traverseNode(item as babel.Node, callback);
            }
          }
        } else if ('type' in value) {
          this.traverseNode(value as babel.Node, callback);
        }
      }
    }
  }
}
