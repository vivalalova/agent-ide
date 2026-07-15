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
        const parent = node.parent;

        // 一般標識符引用：foo、obj.foo、this.foo
        const isPlainIdentifierMatch = ts.isIdentifier(node) && node.text === symbolName
          // 過濾：跳過字串字面值中的符號（由 AST 遍歷自動處理）
          && !(parent && ts.isStringLiteral(parent));

        // Bracket 成員存取：obj['foo']（ElementAccessExpression 的 key 是字串字面值，
        // 不是 Identifier，原本的 isIdentifier 檢查完全掃不到，導致 a['run']() 這類
        // 方法呼叫對 deadcode/refs 隱形）
        const isBracketKeyMatch = ts.isStringLiteral(node) && node.text === symbolName
          && !!parent && ts.isElementAccessExpression(parent) && parent.argumentExpression === node;

        if (isPlainIdentifierMatch || isBracketKeyMatch) {
          // 判斷引用類型和所屬容器
          const refInfo = this.analyzeIdentifierReference(node, sourceFile);

          if (refInfo) {
            // 如果指定了 className，過濾不屬於該類別的引用
            if (targetClassName && this.shouldExcludeByClassName(refInfo, targetClassName, symbolName)) {
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
   *   例外：targetClassName === symbolName（呼叫端傳入的「容器名」其實就是符號本身，
   *   如巢狀函式以自身作為 scope 名稱的慣例）時，不代表存在別的同名符號互相排擠，
   *   此裸識別符本來就是目標符號的直接引用，不應被容器名不相符擋掉。
   */
  private shouldExcludeByClassName(
    refInfo: IdentifierReferenceInfo,
    targetClassName: string,
    symbolName: string
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

    // targetClassName 即符號自身名稱：無其他同名符號可混淆，裸識別符直接保留
    if (targetClassName === symbolName) {
      return false;
    }

    // 裸識別符形且在目標類別外部：綁定到別的符號，排除
    return true;
  }

  /**
   * 分析標識符引用的詳細資訊
   * 判斷引用類型（讀取/寫入/呼叫）和所屬容器
   * @param node TypeScript 標識符節點，或 bracket 存取的字串字面值鍵（obj['foo']）
   * @param sourceFile 來源檔案
   * @returns 引用分析結果，如果無法分析則返回 null
   */
  private analyzeIdentifierReference(
    node: ts.Identifier | ts.StringLiteral,
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

    // 檢查是否為 bracket 成員存取：obj['method']（不論是否被呼叫）
    // 語意與屬性存取（obj.method）相同，只是鍵以字串字面值表達
    if (parent && ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
      isPropertyAccess = true;
      receiverType = this.inferReceiverType(parent.expression, sourceFile);

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

    // 檢查是否為宣告（變數宣告、參數、函式宣告等）
    if (
      parent
      && (ts.isVariableDeclaration(parent)
        || ts.isParameter(parent)
        || ts.isPropertyDeclaration(parent)
        || ts.isFunctionDeclaration(parent))
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
    // 1. 如果是標識符，依詞法作用域由近到遠找「最近」的同名宣告並推斷類型
    //    （非整檔第一個同名宣告——同名變數在不同函式各自宣告不同型別時，
    //    整檔優先序會把後面函式的 receiver 誤判成第一個宣告所屬的類別）
    if (ts.isIdentifier(expression)) {
      const varName = expression.text;
      const decl = this.findNearestVariableDeclaration(expression, varName, sourceFile);
      if (!decl) {
        return undefined;
      }

      // 檢查類型註解：const dog: Dog
      if (decl.type && ts.isTypeReferenceNode(decl.type) && ts.isIdentifier(decl.type.typeName)) {
        return decl.type.typeName.text;
      }

      // 檢查初始化器：const dog = new Dog()
      if (decl.initializer && ts.isNewExpression(decl.initializer) && ts.isIdentifier(decl.initializer.expression)) {
        return decl.initializer.expression.text;
      }

      // 找到最近的同名宣告但推不出型別：不得再往外層作用域找（會誤把外層同名
      // 但無關的宣告當成型別來源），視為無法推斷
      return undefined;
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
   * 由近到遠依詞法作用域鏈查找 varName 最近的 VariableDeclaration。
   * 從 usage 節點所在的最近作用域開始搜尋（不進入巢狀子作用域，維持
   * let/const 的區塊作用域語意），找不到才往外一層作用域繼續找，直到
   * SourceFile 頂層為止。找到即回傳（即使該宣告推不出型別也不再往外找，
   * 因為它已遮蔽外層同名宣告）。
   */
  private findNearestVariableDeclaration(
    usageNode: ts.Node,
    varName: string,
    sourceFile: ts.SourceFile
  ): ts.VariableDeclaration | undefined {
    let searchFrom: ts.Node = usageNode;

    while (true) {
      const scope = this.getEnclosingScope(searchFrom);
      const decl = this.findVariableDeclarationDirectlyIn(scope, varName);
      if (decl) {
        return decl;
      }

      if (scope === sourceFile || !scope.parent) {
        return undefined;
      }
      searchFrom = scope.parent;
    }
  }

  /**
   * 取得節點最近的作用域容器（Block/函式/SourceFile），語意同 ScopeAnalyzer.getScopeContainer，
   * 差異僅在此處需要包含節點自身（節點本身即作用域邊界時，直接以自己為起點）。
   */
  private getEnclosingScope(node: ts.Node): ts.Node {
    let current: ts.Node | undefined = node;
    while (current) {
      if (this.isScopeBoundaryNode(current)) {
        return current;
      }
      current = current.parent;
    }
    return node.getSourceFile();
  }

  /** 判斷節點是否為作用域邊界（Block、函式各型、SourceFile） */
  private isScopeBoundaryNode(node: ts.Node): boolean {
    return ts.isBlock(node)
      || ts.isFunctionDeclaration(node)
      || ts.isFunctionExpression(node)
      || ts.isArrowFunction(node)
      || ts.isMethodDeclaration(node)
      || ts.isConstructorDeclaration(node)
      || ts.isSourceFile(node);
  }

  /**
   * 在指定作用域節點內查找 varName 的 VariableDeclaration，不進入巢狀子作用域
   * （巢狀 Block/函式屬於更內層作用域，其宣告對外層不可見）。
   */
  private findVariableDeclarationDirectlyIn(
    scopeNode: ts.Node,
    varName: string
  ): ts.VariableDeclaration | undefined {
    let result: ts.VariableDeclaration | undefined;

    const visit = (node: ts.Node): void => {
      if (result) {
        return;
      }

      if (node !== scopeNode && this.isScopeBoundaryNode(node)) {
        return; // 不進入巢狀子作用域
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === varName
      ) {
        result = node;
        return;
      }

      ts.forEachChild(node, visit);
    };

    visit(scopeNode);
    return result;
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
