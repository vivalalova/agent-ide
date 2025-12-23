/**
 * TypeScript 引用查找器
 *
 * 提供作用域感知的符號引用查找功能，包括：
 * - 符號引用分析（讀取/寫入/呼叫）
 * - 容器名稱識別
 * - Receiver 類型推斷
 */

import * as ts from 'typescript';
import {
  ScopedReferenceKind,
  type ScopedReference,
  type ScopedFindReferencesOptions
} from '@infrastructure/parser/index.js';
import { tsNodeToRange } from './types.js';

/**
 * 標識符引用分析結果
 */
interface IdentifierReferenceInfo {
  /** 引用類型 */
  kind: ScopedReferenceKind;
  /** 容器名稱（類別、函式等） */
  containerName?: string;
  /** 是否為方法呼叫 */
  isMethodCall: boolean;
  /** Receiver 類型（用於區分不同類別的同名方法） */
  receiverType?: string;
}

/**
 * 引用查找器
 * 提供作用域感知的符號引用查找
 */
export class ReferenceFinder {
  /**
   * 建立引用查找器
   * @param compilerOptions TypeScript 編譯選項
   */
  constructor(private readonly compilerOptions?: ts.CompilerOptions) {}

  /**
   * 查找作用域感知的符號引用
   *
   * @param code 完整的檔案內容
   * @param symbolName 要查找的符號名稱
   * @param options 查找選項（可限定類別等）
   * @returns 符號引用列表，如果無法解析則返回 null
   */
  findScopedReferences(
    code: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): ScopedReference[] | null {
    try {
      const sourceFile = ts.createSourceFile(
        'temp.ts',
        code,
        this.compilerOptions?.target || ts.ScriptTarget.ES2020,
        true
      );

      const references: ScopedReference[] = [];
      const targetClassName = options?.className;

      // 遍歷 AST 查找所有符號引用
      const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && node.text === symbolName) {
          // 過濾：跳過字串字面值和模板字串中的符號（由 AST 遍歷自動處理）
          const parent = node.parent;

          // 過濾：檢查是否在字串字面值中（透過父節點判斷）
          if (parent && ts.isStringLiteral(parent)) {
            return;
          }

          // 判斷引用類型和所屬容器
          const refInfo = this.analyzeIdentifierReference(node, sourceFile);

          if (refInfo) {
            // 如果指定了 className，過濾不匹配的引用
            if (targetClassName && refInfo.containerName !== targetClassName) {
              // 只有當引用確實是方法呼叫且 receiverType 不匹配時才過濾
              if (refInfo.isMethodCall && refInfo.receiverType !== targetClassName) {
                return;
              }
            }

            const range = tsNodeToRange(node, sourceFile);
            const location = {
              filePath: sourceFile.fileName,
              range
            };

            references.push({
              location,
              kind: refInfo.kind,
              isExactMatch: true,
              containerName: refInfo.containerName
            });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(sourceFile);

      return references;
    } catch {
      // 解析失敗，返回 null 讓呼叫端 fallback 到手動過濾
      return null;
    }
  }

  /**
   * 分析標識符引用的詳細資訊
   * 判斷引用類型（讀取/寫入/呼叫）和所屬容器
   * @param node TypeScript 標識符節點
   * @param sourceFile 來源檔案
   * @returns 引用分析結果，如果無法分析則返回 null
   */
  private analyzeIdentifierReference(
    node: ts.Identifier,
    sourceFile: ts.SourceFile
  ): IdentifierReferenceInfo | null {
    const parent = node.parent;

    // 判斷引用類型
    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;
    let receiverType: string | undefined;

    // 檢查是否為函式/方法呼叫
    if (parent && ts.isCallExpression(parent)) {
      // 直接呼叫：foo()
      if (parent.expression === node) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = false;
      }
    }

    // 檢查是否為方法呼叫：obj.method()
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
      const grandParent = parent.parent;
      if (grandParent && ts.isCallExpression(grandParent) && grandParent.expression === parent) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = true;

        // 嘗試取得 receiver 的類型名稱
        receiverType = this.inferReceiverType(parent.expression, sourceFile);
      }
    }

    // 檢查是否為寫入（賦值左側）
    if (parent && ts.isBinaryExpression(parent)) {
      if (parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        kind = ScopedReferenceKind.Write;
      }
    }

    // 檢查是否為宣告（變數宣告、參數等）
    if (
      parent
      && (ts.isVariableDeclaration(parent)
        || ts.isParameter(parent)
        || ts.isPropertyDeclaration(parent))
      && (parent as { name?: ts.Node }).name === node
    ) {
      kind = ScopedReferenceKind.Write;
    }

    // 取得所屬容器名稱（類別、函式等）
    const containerName = this.findContainerName(node);

    return {
      kind,
      containerName,
      isMethodCall,
      receiverType
    };
  }

  /**
   * 推斷 receiver 表達式的類型名稱
   * 例如：dog.bark() 中推斷 dog 的類型為 Dog
   */
  private inferReceiverType(expression: ts.Expression, sourceFile: ts.SourceFile): string | undefined {
    // 1. 如果是標識符，嘗試查找其宣告並推斷類型
    if (ts.isIdentifier(expression)) {
      const varName = expression.text;

      // 簡單的類型推斷：查找 const dog = new Dog() 或 const dog: Dog = ...
      let result: string | undefined;

      const findDeclaration = (node: ts.Node): void => {
        if (result) {
          return;
        }

        if (
          ts.isVariableDeclaration(node)
          && ts.isIdentifier(node.name)
          && node.name.text === varName
        ) {
          // 檢查類型註解：const dog: Dog
          if (node.type && ts.isTypeReferenceNode(node.type)) {
            if (ts.isIdentifier(node.type.typeName)) {
              result = node.type.typeName.text;
              return;
            }
          }

          // 檢查初始化器：const dog = new Dog()
          if (node.initializer && ts.isNewExpression(node.initializer)) {
            const newExpr = node.initializer;
            if (ts.isIdentifier(newExpr.expression)) {
              result = newExpr.expression.text;
              return;
            }
          }
        }

        ts.forEachChild(node, findDeclaration);
      };

      findDeclaration(sourceFile);
      return result;
    }

    // 2. 如果是 new 表達式：(new Dog()).bark()
    if (ts.isNewExpression(expression)) {
      if (ts.isIdentifier(expression.expression)) {
        return expression.expression.text;
      }
    }

    // 3. 如果是屬性存取：this.dog.bark()（較複雜，暫不處理）

    return undefined;
  }

  /**
   * 查找標識符所屬的容器名稱（類別、函式等）
   */
  private findContainerName(node: ts.Node): string | undefined {
    let current = node.parent;

    while (current) {
      // 類別方法
      if (ts.isMethodDeclaration(current) || ts.isConstructorDeclaration(current)) {
        const classDecl = current.parent;
        if (ts.isClassDeclaration(classDecl) && classDecl.name) {
          return classDecl.name.text;
        }
      }

      // 類別屬性
      if (ts.isPropertyDeclaration(current)) {
        const classDecl = current.parent;
        if (ts.isClassDeclaration(classDecl) && classDecl.name) {
          return classDecl.name.text;
        }
      }

      // 函式宣告
      if (ts.isFunctionDeclaration(current) && current.name) {
        return current.name.text;
      }

      current = current.parent;
    }

    return undefined;
  }
}

/**
 * 建立引用查找器實例
 * @param compilerOptions TypeScript 編譯選項（可選）
 */
export function createReferenceFinder(compilerOptions?: ts.CompilerOptions): ReferenceFinder {
  return new ReferenceFinder(compilerOptions);
}
