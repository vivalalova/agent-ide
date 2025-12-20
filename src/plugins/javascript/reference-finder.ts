/**
 * JavaScript 引用查找器
 * 負責作用域感知的符號引用查找和分析
 */

import { parse as babelParse } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

import {
  ScopedReferenceKind,
  type ScopedFindReferencesOptions,
  type ScopedReference
} from '@infrastructure/parser/index.js';
import type { Range } from '@shared/types/index.js';
import { babelLocationToPosition } from './types.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as any).default || babelTraverse;

/**
 * 引用分析結果
 */
interface ReferenceAnalysis {
  /** 引用類型 */
  kind: ScopedReferenceKind;
  /** 容器名稱（類別或函式） */
  containerName?: string;
  /** 是否為方法呼叫 */
  isMethodCall: boolean;
  /** receiver 類型名稱 */
  receiverType?: string;
}

/**
 * JavaScript 引用查找器
 * 使用 Babel 語義分析來精確匹配符號引用
 */
export class ReferenceFinder {
  /**
   * 作用域感知的符號引用查找
   * 使用 Babel 語義分析來精確匹配符號引用，區分不同類別的同名方法
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
      const ast = babelParse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx']
      });

      const references: ScopedReference[] = [];
      const targetClassName = options?.className;
      const filePath = 'temp.js';

      traverse(ast, {
        Identifier: (path: NodePath<babel.Identifier>) => {
          if (path.node.name !== symbolName) {
            return;
          }

          // 過濾：跳過物件屬性的 key（非計算屬性）
          const parent = path.parent;
          if (babel.isObjectProperty(parent) && parent.key === path.node && !parent.computed) {
            return;
          }

          // 過濾：跳過 import 的原始名稱
          if (babel.isImportSpecifier(parent) && parent.imported === path.node) {
            return;
          }

          // 分析引用詳情
          const refInfo = this.analyzeIdentifierReference(path, code, targetClassName);

          if (refInfo) {
            // 如果指定了 className，過濾不匹配的引用
            if (targetClassName && refInfo.containerName !== targetClassName) {
              if (refInfo.isMethodCall && refInfo.receiverType !== targetClassName) {
                return;
              }
            }

            const location = {
              filePath,
              range: this.getNodeRange(path.node)
            };

            references.push({
              location,
              kind: refInfo.kind,
              isExactMatch: true,
              containerName: refInfo.containerName
            });
          }
        }
      });

      return references;
    } catch {
      // 解析失敗，返回 null 讓呼叫端 fallback 到手動過濾
      return null;
    }
  }

  /**
   * 分析 JavaScript 標識符引用的詳細資訊
   */
  private analyzeIdentifierReference(
    path: NodePath<babel.Identifier>,
    code: string,
    _targetClassName?: string
  ): ReferenceAnalysis | null {
    const parent = path.parent;
    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;
    let receiverType: string | undefined;

    // 檢查是否為函式呼叫
    if (babel.isCallExpression(parent) && parent.callee === path.node) {
      kind = ScopedReferenceKind.Call;
      isMethodCall = false;
    }

    // 檢查是否為方法呼叫：obj.method()
    if (babel.isMemberExpression(parent) && parent.property === path.node && !parent.computed) {
      const grandParent = path.parentPath?.parent;
      if (babel.isCallExpression(grandParent) && grandParent.callee === parent) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = true;

        // 嘗試取得 receiver 的類型名稱
        receiverType = this.inferReceiverType(parent.object, code);
      }
    }

    // 檢查是否為寫入（賦值左側）
    if (babel.isAssignmentExpression(parent) && parent.left === path.node) {
      kind = ScopedReferenceKind.Write;
    }

    // 檢查是否為宣告
    if (babel.isVariableDeclarator(parent) && parent.id === path.node) {
      kind = ScopedReferenceKind.Write;
    }

    // 取得所屬容器名稱
    const containerName = this.findContainerName(path);

    return {
      kind,
      containerName,
      isMethodCall,
      receiverType
    };
  }

  /**
   * 推斷 JavaScript receiver 的類型名稱
   */
  private inferReceiverType(
    expression: babel.Expression | babel.Super | babel.V8IntrinsicIdentifier,
    code: string
  ): string | undefined {
    // 1. new 表達式：(new Dog()).bark()
    if (babel.isNewExpression(expression)) {
      if (babel.isIdentifier(expression.callee)) {
        return expression.callee.name;
      }
    }

    // 2. 標識符：需要查找其宣告
    if (babel.isIdentifier(expression)) {
      const varName = expression.name;

      // 簡單解析：查找 const dog = new Dog()
      try {
        const ast = babelParse(code, {
          sourceType: 'unambiguous',
          plugins: ['jsx']
        });

        let result: string | undefined;

        traverse(ast, {
          VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
            if (result) { return; }
            if (babel.isIdentifier(path.node.id) && path.node.id.name === varName) {
              const init = path.node.init;
              if (init && babel.isNewExpression(init)) {
                if (babel.isIdentifier(init.callee)) {
                  result = init.callee.name;
                }
              }
            }
          }
        });

        return result;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * 查找 JavaScript 標識符所屬的容器名稱
   */
  private findContainerName(path: NodePath<babel.Identifier>): string | undefined {
    let current: NodePath | null = path.parentPath;

    while (current) {
      const node = current.node;

      // 類別方法
      if (babel.isClassMethod(node)) {
        const classPath = current.parentPath;
        if (classPath && babel.isClassBody(classPath.node)) {
          const classDecl = classPath.parentPath?.node;
          if (classDecl && babel.isClassDeclaration(classDecl) && classDecl.id) {
            return classDecl.id.name;
          }
        }
      }

      // 類別屬性
      if (babel.isClassProperty(node)) {
        const classPath = current.parentPath;
        if (classPath && babel.isClassBody(classPath.node)) {
          const classDecl = classPath.parentPath?.node;
          if (classDecl && babel.isClassDeclaration(classDecl) && classDecl.id) {
            return classDecl.id.name;
          }
        }
      }

      // 函式宣告
      if (babel.isFunctionDeclaration(node) && node.id) {
        return node.id.name;
      }

      current = current.parentPath;
    }

    return undefined;
  }

  /**
   * 將 Babel AST 節點轉換為 Range
   */
  private getNodeRange(node: babel.Node): Range {
    if (node.loc) {
      return babelLocationToPosition(node.loc);
    }

    // 如果沒有位置資訊，返回預設範圍
    return {
      start: { line: 0, column: 0, offset: 0 },
      end: { line: 0, column: 0, offset: 0 }
    };
  }
}
