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
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/** AST 快取最大容量（位元組）- 50MB */
const AST_CACHE_MAX_BYTES = 50 * 1024 * 1024;

/** 每個 AST 節點估算的平均大小（位元組） */
const ESTIMATED_BYTES_PER_NODE = 100;

/** 程式碼雜湊樣本長度（前 N 字元） */
const CODE_HASH_SAMPLE_LENGTH = 100;

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
  /** 估算的 AST 大小（位元組） */
  estimatedSize: number;
}

/**
 * JavaScript 引用查找器
 * 使用 Babel 語義分析來精確匹配符號引用
 */
export class ReferenceFinder {
  /** AST 快取（程式碼 hash -> 快取項目），使用 Map 保持插入順序實現 LRU */
  private astCache: Map<string, ASTCacheEntry> = new Map();

  /** 當前快取大小估算（位元組） */
  private currentCacheBytes = 0;

  /**
   * 計算程式碼的雜湊值（用於快取 key）
   * 使用 djb2 演算法計算雜湊，比簡易長度+前綴更可靠
   */
  private computeCodeHash(code: string): string {
    let hash = 5381;
    const sampleLength = Math.min(code.length, CODE_HASH_SAMPLE_LENGTH);

    for (let i = 0; i < sampleLength; i++) {
      hash = ((hash << 5) + hash) + code.charCodeAt(i);
      hash = hash & hash; // 轉為 32 位元整數
    }

    // 結合長度確保不同大小的檔案不會碰撞
    return `${code.length}:${hash >>> 0}`;
  }

  /**
   * 取得或建立 AST 快取（僅解析 AST，不做 traverse）
   */
  private getOrCreateASTCache(code: string): ASTCacheEntry | null {
    const hash = this.computeCodeHash(code);
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

      // 估算 AST 大小
      const estimatedSize = this.estimateASTSize(ast);

      const entry: ASTCacheEntry = { ast, variableTypes, estimatedSize };
      this.addToCache(hash, entry);

      return entry;
    } catch {
      return null;
    }
  }

  /**
   * 估算 AST 大小（位元組）
   * 使用 program.body 數量估算，避免完整遍歷
   * 估算公式：頂層語句數 * 平均節點深度 * 每節點位元組
   */
  private estimateASTSize(ast: babel.File): number {
    // 平均每個頂層語句包含約 20 個節點（經驗估算）
    const AVERAGE_NODES_PER_STATEMENT = 20;
    const topLevelStatements = ast.program.body.length;
    const estimatedNodeCount = topLevelStatements * AVERAGE_NODES_PER_STATEMENT;
    return estimatedNodeCount * ESTIMATED_BYTES_PER_NODE;
  }

  /**
   * 將項目加入快取（基於大小的 LRU 策略）
   */
  private addToCache(hash: string, entry: ASTCacheEntry): void {
    // 如果超過限制，移除最舊項目直到有足夠空間
    while (
      this.currentCacheBytes + entry.estimatedSize > AST_CACHE_MAX_BYTES
      && this.astCache.size > 0
    ) {
      const firstKey = this.astCache.keys().next().value;
      if (firstKey) {
        const removed = this.astCache.get(firstKey);
        if (removed) {
          this.currentCacheBytes -= removed.estimatedSize;
        }
        this.astCache.delete(firstKey);
      }
    }

    this.astCache.set(hash, entry);
    this.currentCacheBytes += entry.estimatedSize;
  }

  /**
   * 清除 AST 快取
   */
  clearCache(): void {
    this.astCache.clear();
    this.currentCacheBytes = 0;
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

        // 過濾：跳過 import 的原始名稱
        if (babel.isImportSpecifier(parent) && parent.imported === path.node) {
          return;
        }

        // 分析引用詳情（使用快取的變數類型映射）
        const refInfo = this.analyzeIdentifierReference(path, variableTypes);

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

        // 使用快取的變數類型映射來推斷 receiver 類型
        receiverType = this.inferReceiverType(parent.object, variableTypes);
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
   * 查找 JavaScript 標識符所屬的容器名稱
   * @param path Babel 標識符節點路徑
   * @returns 容器名稱（類別或函式），如果無法找到則返回 undefined
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
