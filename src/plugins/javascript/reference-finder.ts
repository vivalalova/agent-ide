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
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { logger } from '@infrastructure/logging/index.js';
import {
  computeContentHash,
  shouldExcludeByClassName as sharedShouldExcludeByClassName
} from '@plugins/shared/index.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/**
 * 引用分析結果
 */
interface ReferenceAnalysis {
  /** 引用類型 */
  kind: ScopedReferenceKind;
  /** 容器名稱（類別或函式） */
  containerName?: string;
  /** 是否為方法呼叫（obj.method()） */
  isMethodCall: boolean;
  /**
   * 是否為屬性存取形（obj.method、obj.method()；不論是否被呼叫）。
   * 用於區分「屬性存取」與「裸識別符」兩種引用形狀——className 過濾對兩者採不同判定。
   */
  isPropertyAccess: boolean;
  /** Receiver 類型名稱（用於區分不同類別的同名方法，如 dog.bark() 中 dog 的類型為 Dog） */
  receiverType?: string;
}

/**
 * 變數類型映射（變數名 -> 類型名）
 * 用於 receiver 類型推斷快取
 */
type VariableTypeMap = Map<string, string>;

/**
 * AST 快取項目
 */
interface ASTCacheEntry {
  /** 已解析的 AST */
  ast: babel.File;
  /** 變數類型映射（變數名 -> new 的類型名） */
  variableTypes: VariableTypeMap;
}

/**
 * JavaScript 引用查找器
 * 使用 Babel 語義分析來精確匹配符號引用
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */
export class ReferenceFinder {
  /** AST 快取（程式碼 hash -> 快取項目），LRU 由 MemoryCache 自動處理 */
  private readonly astCache: MemoryCache<string, ASTCacheEntry> = createLRUCache(50);

  /**
   * 取得或建立 AST 快取（僅解析 AST，不做 traverse）
   * 注意：LRU 淘汰由 MemoryCache 自動處理
   */
  private getOrCreateASTCache(code: string): ASTCacheEntry | null {
    const hash = computeContentHash(code);
    // MemoryCache.get() 自動更新 lastAccessedAt
    const cached = this.astCache.get(hash);

    if (cached) {
      return cached;
    }

    try {
      const ast = babelParse(code, {
        sourceType: 'unambiguous',
        plugins: ['jsx']
      });

      // 僅建立空的 variableTypes，在 findScopedReferences 中一併收集
      const variableTypes: VariableTypeMap = new Map();

      const entry: ASTCacheEntry = { ast, variableTypes };
      this.astCache.set(hash, entry); // MemoryCache 自動處理 LRU 淘汰

      return entry;
    } catch (error) {
      logger.warn('js/reference-finder', `JS AST parse failed: ${error}`);
      return null;
    }
  }

  /**
   * 清除 AST 快取
   */
  clearCache(): void {
    this.astCache.clear();
  }

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
    const cacheEntry = this.getOrCreateASTCache(code);
    if (!cacheEntry) {
      return null;
    }

    const { ast, variableTypes } = cacheEntry;
    const references: ScopedReference[] = [];
    const targetClassName = options?.className;
    const filePath = 'temp.js';

    // 檢查是否需要建立 variableTypes（首次遍歷時一併收集）
    const needsBuildVariableTypes = variableTypes.size === 0;

    // 單次遍歷：同時建立 variableTypes 和收集引用
    traverse(ast, {
      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        // 僅在首次需要時收集變數類型
        if (needsBuildVariableTypes && babel.isIdentifier(path.node.id)) {
          const init = path.node.init;
          if (init && babel.isNewExpression(init) && babel.isIdentifier(init.callee)) {
            variableTypes.set(path.node.id.name, init.callee.name);
          }
        }
      },
      Identifier: (path: NodePath<babel.Identifier>) => {
        if (path.node.name !== symbolName) {
          return;
        }

        // 過濾：跳過物件屬性的 key（非計算屬性）
        const parent = path.parent;
        if (babel.isObjectProperty(parent) && parent.key === path.node && !parent.computed) {
          return;
        }

        // 過濾：ES2022 私有欄位/方法（`#secret`）的裸名 Identifier 是 PrivateName.id
        // 的內部子節點，交由下方獨立的 PrivateName visitor 處理（需要涵蓋
        // 正確的宣告/使用形狀判定），此處略過避免同一引用被重複收集兩次。
        if (babel.isPrivateName(parent)) {
          return;
        }

        // 過濾：無別名的具名 import/export specifier（`import { x }` / `export { x }`）
        // 在 Babel AST 中是兩個位置完全相同的 Identifier 節點（imported/local 或
        // local/exported），visitor 會各觸發一次而產生同位置的重複引用。只保留
        // 本地綁定那一個節點；有別名時兩節點位置不同，兩者都是真實引用，不去重。
        if (this.isDuplicateSpecifierTwin(path)) {
          return;
        }

        // 分析引用詳情（使用快取的變數類型映射）
        const refInfo = this.analyzeIdentifierReference(path, variableTypes);

        if (refInfo) {
          // 如果指定了 className，過濾不屬於該類別的引用
          if (
            targetClassName
            && this.shouldExcludeByClassName(refInfo, targetClassName, symbolName, path)
          ) {
            return;
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
      },
      // Bracket 成員存取：obj['method'] / obj[`method`]
      // 鍵是字串／無插值樣板字面值，不是 Identifier；Identifier visitor 掃不到，
      // 會讓 a['run']() 這類方法呼叫對 deadcode/refs 隱形（對齊 TS ElementAccess）。
      MemberExpression: (path: NodePath<babel.MemberExpression>) => {
        if (!path.node.computed) {
          return;
        }

        const keyNode = path.node.property;
        const keyName = this.getStaticComputedMemberKey(keyNode);
        if (keyName !== symbolName) {
          return;
        }

        const refInfo = this.analyzeComputedMemberReference(path, variableTypes);
        if (!refInfo) {
          return;
        }

        if (
          targetClassName
          && this.shouldExcludeByClassName(refInfo, targetClassName, symbolName, path)
        ) {
          return;
        }

        references.push({
          location: {
            filePath,
            range: this.getNodeRange(keyNode)
          },
          kind: refInfo.kind,
          isExactMatch: true,
          containerName: refInfo.containerName
        });
      },
      // ES2022 私有欄位/方法（`#secret`）：宣告（ClassPrivateProperty/
      // ClassPrivateMethod 的 key）與使用處（`this.#secret` 的 MemberExpression
      // property）AST node kind 都是 PrivateName，非 Identifier，上方的
      // Identifier visitor 完全掃不到（對齊 TS 側 ts.PrivateIdentifier 修復，
      // 見 plugins/typescript/reference-finder.ts）。
      PrivateName: (path: NodePath<babel.PrivateName>) => {
        if (path.node.id.name !== symbolName) {
          return;
        }

        const parent = path.parent;
        const isDeclaration =
          (babel.isClassPrivateProperty(parent) || babel.isClassPrivateMethod(parent))
          && parent.key === path.node;
        const isMemberAccess = babel.isMemberExpression(parent) && parent.property === path.node;

        if (!isDeclaration && !isMemberAccess) {
          return;
        }

        const refInfo = this.analyzePrivateNameReference(path, isDeclaration, variableTypes);

        if (
          targetClassName
          && this.shouldExcludeByClassName(refInfo, targetClassName, symbolName, path)
        ) {
          return;
        }

        references.push({
          // 替換範圍取內部裸名 Identifier（PrivateName.id）的 loc，天然排除 `#`
          // 前綴本身（Babel 為 PrivateName 額外包了一層 id 子節點，不同於 TS 側
          // PrivateIdentifier 單一 token 需手動切片）；下游 rename 用 symbol.name
          // （裸名）替換此範圍時，`#` 落在範圍外而原樣保留（"#secret" →
          // 範圍外的 "#" + 範圍內 "secret"→"hidden" = "#hidden"）。
          location: { filePath, range: this.getNodeRange(path.node.id) },
          kind: refInfo.kind,
          isExactMatch: true,
          containerName: refInfo.containerName
        });
      }
    });

    return references;
  }

  /**
   * 取得 computed 成員存取的靜態字串鍵名。
   * 支援 StringLiteral（obj['foo']）與無插值 TemplateLiteral（obj[`foo`]）。
   */
  private getStaticComputedMemberKey(
    property: babel.Expression | babel.PrivateName
  ): string | undefined {
    if (babel.isStringLiteral(property)) {
      return property.value;
    }

    // 無插值樣板：`method` → quasis 單一片段且 expressions 為空
    if (
      babel.isTemplateLiteral(property)
      && property.expressions.length === 0
      && property.quasis.length === 1
    ) {
      return property.quasis[0]?.value.cooked ?? undefined;
    }

    return undefined;
  }

  /**
   * 分析 computed 成員存取（obj['method'] / obj[`method`]）的引用詳情
   */
  private analyzeComputedMemberReference(
    path: NodePath<babel.MemberExpression>,
    variableTypes: VariableTypeMap
  ): ReferenceAnalysis | null {
    const member = path.node;
    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;

    const grandParent = path.parent;
    if (babel.isCallExpression(grandParent) && grandParent.callee === member) {
      kind = ScopedReferenceKind.Call;
      isMethodCall = true;
    }

    return {
      kind,
      containerName: this.findContainerName(path),
      isMethodCall,
      isPropertyAccess: true,
      receiverType: this.inferReceiverType(member.object, variableTypes)
    };
  }

  /**
   * 分析 ES2022 私有欄位/方法（`#secret`）PrivateName 節點的引用詳情。
   * 對齊 analyzeIdentifierReference／analyzeComputedMemberReference：宣告點
   * （ClassPrivateProperty/ClassPrivateMethod 的 key）為 Definition；成員存取
   * （`this.#secret`／`obj.#secret`）依是否被呼叫區分 Call/Write/Read。
   */
  private analyzePrivateNameReference(
    path: NodePath<babel.PrivateName>,
    isDeclaration: boolean,
    variableTypes: VariableTypeMap
  ): ReferenceAnalysis {
    if (isDeclaration) {
      return {
        kind: ScopedReferenceKind.Definition,
        containerName: this.findContainerName(path),
        isMethodCall: false,
        isPropertyAccess: false
      };
    }

    const member = path.parent as babel.MemberExpression;
    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;

    const grandParent = path.parentPath?.parent;
    if (babel.isCallExpression(grandParent) && grandParent.callee === member) {
      kind = ScopedReferenceKind.Call;
      isMethodCall = true;
    } else if (babel.isAssignmentExpression(grandParent) && grandParent.left === member) {
      kind = ScopedReferenceKind.Write;
    }

    return {
      kind,
      containerName: this.findContainerName(path),
      isMethodCall,
      isPropertyAccess: true,
      receiverType: this.inferReceiverType(member.object, variableTypes)
    };
  }

  /**
   * 判斷某引用是否因不屬於目標類別而應被排除。
   * 過濾規則為 TS/JS 共用策略，唯一定義見 `@plugins/shared/reference-class-filter.js`
   * 的 `shouldExcludeByClassName`；此處只負責提供 JS 側的
   * hasEnclosingTargetFunction 判定（Babel scope binding）。
   */
  private shouldExcludeByClassName(
    refInfo: ReferenceAnalysis,
    targetClassName: string,
    symbolName: string,
    path: NodePath
  ): boolean {
    return sharedShouldExcludeByClassName(
      refInfo,
      targetClassName,
      symbolName,
      () => this.hasEnclosingTargetFunction(path, symbolName)
    );
  }

  /**
   * 判斷節點最近的同名詞法綁定是否為 FunctionDeclaration（巢狀函式慣例的宣告形式）。
   * 對齊 TS hasEnclosingTargetFunction：function 宣告具 hoisting，於整個外層區塊可見；
   * 若最近綁定是 const/let 等同名 shadow，則不視為目標函式的直接引用。
   */
  private hasEnclosingTargetFunction(path: NodePath, name: string): boolean {
    // 宣告名本身：function name() {} 的 id
    if (
      path.isIdentifier()
      && babel.isFunctionDeclaration(path.parent)
      && path.parent.id === path.node
      && path.parent.id.name === name
    ) {
      return true;
    }

    const binding = path.scope.getBinding(name);
    if (!binding) {
      return false;
    }
    return binding.path.isFunctionDeclaration();
  }

  /**
   * 分析 JavaScript 標識符引用的詳細資訊
   * @param path Babel 標識符節點路徑
   * @param variableTypes 變數類型映射（來自快取）
   * @returns 引用分析結果，如果無法分析則返回 null
   */
  private analyzeIdentifierReference(
    path: NodePath<babel.Identifier>,
    variableTypes: VariableTypeMap
  ): ReferenceAnalysis | null {
    const parent = path.parent;

    // import 語句內的標識符（named/default/namespace specifier 的 local 綁定）
    // 只是綁定本身，不是對該符號的真正使用（對齊 TS 側 D4 修復：避免「只被
    // import 從未使用」的符號因 import specifier 被誤算成一次使用而永遠判定為存活）
    if (this.isInImportStatement(path)) {
      return {
        kind: ScopedReferenceKind.Import,
        containerName: this.findContainerName(path),
        isMethodCall: false,
        isPropertyAccess: false
      };
    }

    let kind: ScopedReferenceKind = ScopedReferenceKind.Read;
    let isMethodCall = false;
    let isPropertyAccess = false;
    let receiverType: string | undefined;

    // 檢查是否為函式呼叫
    if (babel.isCallExpression(parent) && parent.callee === path.node) {
      kind = ScopedReferenceKind.Call;
      isMethodCall = false;
    }

    // 檢查是否為屬性存取：obj.method（不論是否被呼叫）
    if (babel.isMemberExpression(parent) && parent.property === path.node && !parent.computed) {
      isPropertyAccess = true;
      // 屬性存取皆嘗試推斷 receiver 型別（供 className 過濾判定歸屬）
      receiverType = this.inferReceiverType(parent.object, variableTypes);

      // 進一步判斷是否為方法呼叫：obj.method()
      const grandParent = path.parentPath?.parent;
      if (babel.isCallExpression(grandParent) && grandParent.callee === parent) {
        kind = ScopedReferenceKind.Call;
        isMethodCall = true;
      }
    }

    // 檢查是否為寫入（賦值左側）——賦值是使用，不是定義
    if (babel.isAssignmentExpression(parent) && parent.left === path.node) {
      kind = ScopedReferenceKind.Write;
    }

    // 檢查是否為宣告點（變數／函式／類別／方法等 binding 處）
    if (babel.isVariableDeclarator(parent) && parent.id === path.node) {
      kind = ScopedReferenceKind.Definition;
    } else if (babel.isFunctionDeclaration(parent) && parent.id === path.node) {
      kind = ScopedReferenceKind.Definition;
    } else if (babel.isClassDeclaration(parent) && parent.id === path.node) {
      kind = ScopedReferenceKind.Definition;
    } else if (
      (babel.isClassMethod(parent) || babel.isClassProperty(parent) || babel.isObjectMethod(parent))
      && parent.key === path.node
      && !parent.computed
    ) {
      kind = ScopedReferenceKind.Definition;
    } else if (path.listKey === 'params') {
      // 參數綁定宣告點（含函式／方法／箭頭函式 params）
      kind = ScopedReferenceKind.Definition;
    }

    // 取得所屬容器名稱
    const containerName = this.findContainerName(path);

    return {
      kind,
      containerName,
      isMethodCall,
      isPropertyAccess,
      receiverType
    };
  }

  /**
   * 推斷 JavaScript receiver 的類型名稱
   * 使用快取的變數類型映射，避免重複解析 AST
   */
  private inferReceiverType(
    expression: babel.Expression | babel.Super | babel.V8IntrinsicIdentifier,
    variableTypes: VariableTypeMap
  ): string | undefined {
    // 1. new 表達式：(new Dog()).bark()
    if (babel.isNewExpression(expression)) {
      if (babel.isIdentifier(expression.callee)) {
        return expression.callee.name;
      }
    }

    // 2. 標識符：直接從快取查找類型
    if (babel.isIdentifier(expression)) {
      return variableTypes.get(expression.name);
    }

    return undefined;
  }

  /**
   * 判斷該 Identifier 是否為無別名具名 specifier 的重複孿生節點
   * （`import { x }` 的 `imported`、`export { x }` 的 `exported`）。
   */
  private isDuplicateSpecifierTwin(path: NodePath<babel.Identifier>): boolean {
    const parent = path.parent;
    if (babel.isImportSpecifier(parent)) {
      return parent.imported === path.node && parent.imported.start === parent.local.start;
    }
    if (babel.isExportSpecifier(parent)) {
      return parent.exported === path.node && parent.exported.start === parent.local.start;
    }
    return false;
  }

  /**
   * 檢查標識符是否位於 import 語句內（named/default/namespace specifier 的 local 節點）
   */
  private isInImportStatement(path: NodePath<babel.Identifier>): boolean {
    return path.findParent((p) => babel.isImportDeclaration(p.node)) !== null;
  }

  /**
   * 查找節點所屬的容器名稱
   * @param path Babel 節點路徑（Identifier 或 MemberExpression 等）
   * @returns 容器名稱（類別或函式），如果無法找到則返回 undefined
   */
  private findContainerName(path: NodePath): string | undefined {
    let current: NodePath | null = path.parentPath;

    while (current) {
      const node = current.node;

      // 類別方法／屬性（含 ES2022 私有欄位/方法 ClassPrivateProperty/ClassPrivateMethod）
      if (
        babel.isClassMethod(node)
        || babel.isClassProperty(node)
        || babel.isClassPrivateProperty(node)
        || babel.isClassPrivateMethod(node)
      ) {
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
