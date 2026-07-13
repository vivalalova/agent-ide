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
import { logger } from '@infrastructure/logging/index.js';
import { createScopeAnalyzer, type ScopeAnalyzer } from './scope-analyzer.js';

/**
 * 標識符引用分析結果
 */
interface IdentifierReferenceInfo {
  /** 引用類型 */
  kind: ScopedReferenceKind;
  /** 容器名稱（類別、函式等） */
  containerName?: string;
  /** 是否為方法呼叫（obj.method()） */
  isMethodCall: boolean;
  /**
   * 是否為屬性存取形（obj.method、obj.method()、this.method；不論是否被呼叫）。
   * 用於區分「屬性存取」與「裸識別符」兩種引用形狀——className 過濾對兩者採不同判定。
   */
  isPropertyAccess: boolean;
  /** Receiver 類型（用於區分不同類別的同名方法） */
  receiverType?: string;
}

/**
 * 引用查找器
 * 提供作用域感知的符號引用查找
 */
export class ReferenceFinder {
  private readonly scopeAnalyzer: ScopeAnalyzer = createScopeAnalyzer();

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
            // 如果指定了 className，過濾不屬於該類別的引用
            if (targetClassName && this.shouldExcludeByClassName(refInfo, targetClassName)) {
              return;
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
    } catch (error) {
      logger.warn('ts/reference-finder', `Scoped reference finding failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到手動過濾
      return null;
    }
  }

  /**
   * 判斷某引用是否因不屬於目標類別而應被排除。
   *
   * 依引用的「形狀」分流，而非依賴常常推不出的 receiver 型別：
   * - 目標類別內部（containerName === 目標類別）：保留（含方法定義本身、this.method）。
   * - 屬性存取形（obj.method / obj.method() / this.method）：
   *   - receiver 型別推不出（undefined）→ 保留（寧可誤報不可漏報；find-references 有
   *     --at 後置過濾、deadcode 少刪安全）。
   *   - receiver 型別即目標類別 → 保留。
   *   - receiver 型別等於所在類別（子類 this.method() 呼叫繼承自父類的方法）→ 保留。
   *   - receiver 型別確定為其他類別 → 排除。
   * - 裸識別符形（standalone，非屬性存取）：在目標類別外部即詞法綁定到別的符號 → 排除。
   */
  private shouldExcludeByClassName(
    refInfo: IdentifierReferenceInfo,
    targetClassName: string
  ): boolean {
    // 目標類別內部的引用一律保留（方法定義本身、類別內 this-less 引用等）
    if (refInfo.containerName === targetClassName) {
      return false;
    }

    if (refInfo.isPropertyAccess) {
      // 屬性存取形：靠 receiver 型別判定歸屬
      if (refInfo.receiverType === undefined) {
        return false;
      }
      if (refInfo.receiverType === targetClassName) {
        return false;
      }
      // this.method()：receiverType 等於所在類別（子類呼叫繼承自父類的方法）
      if (refInfo.receiverType === refInfo.containerName) {
        return false;
      }
      return true;
    }

    // 裸識別符形且在目標類別外部：綁定到別的符號，排除
    return true;
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

    // import 語句內的標識符（specifier/alias/default/namespace）只是綁定本身，
    // 不是對該符號的真正使用（D4：避免「只被 import 從未使用」的符號因 import
    // specifier 被誤算成一次使用而永遠判定為存活）
    if (this.scopeAnalyzer.isInImportStatement(node)) {
      return {
        kind: ScopedReferenceKind.Import,
        containerName: this.findContainerName(node),
        isMethodCall: false,
        isPropertyAccess: false
      };
    }

    // 判斷引用類型
    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;
    let isPropertyAccess = false;
    let receiverType: string | undefined;

    // 檢查是否為函式/方法呼叫
    if (parent && ts.isCallExpression(parent)) {
      // 直接呼叫：foo()
      if (parent.expression === node) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = false;
      }
    }

    // 檢查是否為屬性存取：obj.method（不論是否被呼叫）
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) {
      isPropertyAccess = true;
      // 屬性存取皆嘗試推斷 receiver 型別（供 className 過濾判定歸屬）
      receiverType = this.inferReceiverType(parent.expression, sourceFile);

      // 進一步判斷是否為方法呼叫：obj.method()
      const grandParent = parent.parent;
      if (grandParent && ts.isCallExpression(grandParent) && grandParent.expression === parent) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = true;
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
      isPropertyAccess,
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

    // 3. 如果是 this 關鍵字：this.method()
    // 向上查找所屬的 class，返回 class 名稱
    if (expression.kind === ts.SyntaxKind.ThisKeyword) {
      return this.findContainerName(expression);
    }

    // 4. 如果是屬性存取：this.dog.bark()（較複雜，暫不處理）

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
