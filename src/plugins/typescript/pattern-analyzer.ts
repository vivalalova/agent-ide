/**
 * PatternAnalyzer - 設計模式識別分析器
 * 負責識別程式碼中的設計模式（如 Factory Pattern）
 */

import * as ts from 'typescript';
import type { PatternInfo } from '@infrastructure/parser/index.js';
import {
  isFactoryReturnType,
  calculateFactoryConfidence,
  createFactoryPatternInfo
} from '@plugins/shared/index.js';
import { logger } from '@infrastructure/logging/index.js';

/**
 * 設計模式識別分析器
 * 透過 TypeScript Compiler API 分析程式碼結構，識別 Factory 等設計模式
 */
export class PatternAnalyzer {
  /**
   * @param compilerOptions TypeScript 編譯選項
   */
  constructor(private readonly compilerOptions?: ts.CompilerOptions) {}

  /**
   * 識別程式碼中的設計模式
   * @param code 原始碼字串
   * @returns 識別到的模式陣列，解析失敗返回 null
   */
  identifyPatterns(code: string): PatternInfo[] | null {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        code,
        this.compilerOptions?.target || ts.ScriptTarget.ES2020,
        true
      );

      const patterns: PatternInfo[] = [];

      const visit = (node: ts.Node): void => {
        // 檢查函數宣告
        if (ts.isFunctionDeclaration(node) && node.name) {
          const factoryInfo = this.analyzeFactoryPattern(node, sourceFile);
          if (factoryInfo) {
            patterns.push(factoryInfo);
          }
        }

        // 檢查箭頭函數（變數宣告）
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)
                && decl.initializer
                && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
              const factoryInfo = this.analyzeArrowFactoryPattern(decl, sourceFile);
              if (factoryInfo) {
                patterns.push(factoryInfo);
              }
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      ts.forEachChild(sourceFile, visit);

      return patterns;
    } catch (error) {
      logger.warn('ts/pattern-analyzer', `Pattern analysis failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到名稱比對
      return null;
    }
  }

  /**
   * 分析函數宣告是否為 factory 模式
   * 判斷條件：
   * 1. 回傳型別是類別/介面實例（非 void、never、基本型別）
   * 2. 函數體內有 new 表達式或回傳物件字面量
   */
  private analyzeFactoryPattern(
    node: ts.FunctionDeclaration,
    sourceFile: ts.SourceFile
  ): PatternInfo | null {
    if (!node.name) { return null; }

    const functionName = node.name.text;

    // 分析回傳型別
    const returnTypeInfo = this.extractReturnTypeInfo(node, sourceFile);
    if (!returnTypeInfo) { return null; }

    // 檢查是否為 factory 模式的回傳型別
    if (isFactoryReturnType(returnTypeInfo.typeName)) {
      // 檢查函數體是否有 new 表達式或回傳物件
      const hasFactoryBehaviorResult = this.hasFactoryBehavior(node.body);

      if (hasFactoryBehaviorResult) {
        const confidence = calculateFactoryConfidence(
          functionName,
          returnTypeInfo.typeName,
          hasFactoryBehaviorResult,
          false
        );
        return createFactoryPatternInfo(functionName, confidence, returnTypeInfo.typeName);
      }
    }

    return null;
  }

  /**
   * 分析箭頭函數/函數表達式是否為 factory 模式
   */
  private analyzeArrowFactoryPattern(
    decl: ts.VariableDeclaration,
    sourceFile: ts.SourceFile
  ): PatternInfo | null {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) { return null; }

    const functionName = decl.name.text;
    const funcNode = decl.initializer as ts.ArrowFunction | ts.FunctionExpression;

    // 分析回傳型別
    const returnTypeInfo = this.extractArrowReturnTypeInfo(funcNode, sourceFile);
    if (!returnTypeInfo) { return null; }

    // 檢查是否為 factory 模式的回傳型別
    if (isFactoryReturnType(returnTypeInfo.typeName)) {
      // 檢查函數體是否有 new 表達式或回傳物件
      const body = funcNode.body;
      const hasFactoryBehaviorResult = ts.isBlock(body)
        ? this.hasFactoryBehavior(body)
        : this.isFactoryExpression(body);

      if (hasFactoryBehaviorResult) {
        const confidence = calculateFactoryConfidence(
          functionName,
          returnTypeInfo.typeName,
          hasFactoryBehaviorResult,
          false
        );
        return createFactoryPatternInfo(functionName, confidence, returnTypeInfo.typeName);
      }
    }

    return null;
  }

  /**
   * 提取函數的回傳型別資訊
   */
  private extractReturnTypeInfo(
    node: ts.FunctionDeclaration | ts.MethodDeclaration,
    sourceFile: ts.SourceFile
  ): { typeName: string } | null {
    if (node.type) {
      const typeName = node.type.getText(sourceFile);
      return { typeName };
    }
    return null;
  }

  /**
   * 提取箭頭函數的回傳型別資訊
   */
  private extractArrowReturnTypeInfo(
    node: ts.ArrowFunction | ts.FunctionExpression,
    sourceFile: ts.SourceFile
  ): { typeName: string } | null {
    if (node.type) {
      const typeName = node.type.getText(sourceFile);
      return { typeName };
    }
    return null;
  }

  /**
   * 檢查函數體是否有 factory 行為
   * 1. 有 new 表達式
   * 2. 回傳物件字面量
   */
  private hasFactoryBehavior(body: ts.Block | undefined): boolean {
    if (!body) { return false; }

    let hasNewExpression = false;
    let hasObjectReturn = false;

    const visit = (node: ts.Node): void => {
      // 檢查 new 表達式
      if (ts.isNewExpression(node)) {
        hasNewExpression = true;
      }

      // 檢查 return 語句
      if (ts.isReturnStatement(node) && node.expression) {
        if (ts.isObjectLiteralExpression(node.expression)) {
          hasObjectReturn = true;
        } else if (ts.isNewExpression(node.expression)) {
          hasNewExpression = true;
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(body, visit);

    return hasNewExpression || hasObjectReturn;
  }

  /**
   * 檢查表達式是否為 factory 行為（用於箭頭函數簡寫）
   */
  private isFactoryExpression(expr: ts.Expression): boolean {
    return ts.isNewExpression(expr) || ts.isObjectLiteralExpression(expr);
  }
}

/**
 * 建立 PatternAnalyzer 實例
 * @param compilerOptions TypeScript 編譯選項
 * @returns PatternAnalyzer 實例
 */
export function createPatternAnalyzer(compilerOptions?: ts.CompilerOptions): PatternAnalyzer {
  return new PatternAnalyzer(compilerOptions);
}
