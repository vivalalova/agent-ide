/**
 * JavaScript 宣告分析器
 * 負責解析宣告範圍、import 宣告、函數簽章和 JSDoc 文件
 */

import { parse as babelParse, type ParserOptions } from '@babel/parser';
import * as babel from '@babel/types';
import babelTraverse, { NodePath } from '@babel/traverse';

import type {
  ImportDeclaration,
  ImportNamedSpecifier,
  FormattedSignature,
  FormattedParameter,
  Documentation
} from '@infrastructure/parser/index.js';
import type { Range } from '@shared/types/index.js';
import { isLineMatch, parseJSDocContent, computeContentHash } from '@plugins/shared/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { logger } from '@infrastructure/logging/index.js';

// Handle both ESM and CJS module formats
const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/**
 * JavaScript 宣告分析器
 * 提供宣告範圍、import 解析、函數簽章和 JSDoc 文件提取功能
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */
export class DeclarationAnalyzer {
  /** AST 快取（hash -> AST），LRU 由 MemoryCache 自動處理 */
  private readonly astCache: MemoryCache<string, babel.File> = createLRUCache(10);

  /**
   * 解析並快取 AST
   * 注意：LRU 淘汰由 MemoryCache 自動處理
   */
  private parseWithCache(
    code: string,
    options: ParserOptions
  ): babel.File | null {
    const hash = computeContentHash(code);

    // 檢查快取（MemoryCache.get() 自動更新 lastAccessedAt）
    const cached = this.astCache.get(hash);
    if (cached) {
      return cached;
    }

    try {
      const ast = babelParse(code, options);
      this.astCache.set(hash, ast); // MemoryCache 自動處理 LRU 淘汰
      return ast;
    } catch (error) {
      logger.warn('js/declaration-analyzer', `Parse failed: ${error}`);
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
   * 取得符號的完整宣告範圍（包含前導註解）
   * @param code - 原始程式碼
   * @param symbolName - 符號名稱
   * @param symbolType - 符號類型（function, class, variable, constant）
   * @param startLine - 預期的起始行號
   * @returns 宣告範圍或 null
   */
  getFullDeclarationRange(
    code: string,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): Range | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
      attachComment: true
    });

    if (!ast) {
      return null;
    }

    try {

      let targetNode: babel.Node | null = null;
      let declaratorMatch: { declarations: babel.VariableDeclarator[]; index: number } | null = null;

      traverse(ast, {
        FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
          if (symbolType === 'function' && path.node.id?.name === symbolName) {
            if (this.isNodeLineMatch(path.node, startLine)) {
              targetNode = path.node;
              path.stop();
            }
          }
        },

        ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
          if (symbolType === 'class' && path.node.id?.name === symbolName) {
            if (this.isNodeLineMatch(path.node, startLine)) {
              targetNode = path.node;
              path.stop();
            }
          }
        },

        VariableDeclaration: (path: NodePath<babel.VariableDeclaration>) => {
          if (symbolType === 'variable' || symbolType === 'constant' || symbolType === 'function') {
            const declarations = path.node.declarations;
            const index = declarations.findIndex(
              decl => babel.isIdentifier(decl.id) && decl.id.name === symbolName
            );
            if (index !== -1 && this.isNodeLineMatch(path.node, startLine)) {
              // 多宣告子語句（如 `let a, b;`）：偵測粒度＝刪除粒度，只刪這個宣告子
              // （含前後逗號手術），對齊 TS 側 resolveMatchedDeclarationNode 的行為語意。
              // 僅 variable/constant 適用；function（箭頭函式賦值給變數）維持整句範圍不變。
              if ((symbolType === 'variable' || symbolType === 'constant') && declarations.length > 1) {
                declaratorMatch = { declarations, index };
              } else {
                targetNode = path.node;
              }
              path.stop();
            }
          }
        },

        // 處理 class method（ClassMethod）
        ClassMethod: (path: NodePath<babel.ClassMethod>) => {
          if (symbolType === 'function' && babel.isIdentifier(path.node.key) && path.node.key.name === symbolName) {
            if (this.isNodeLineMatch(path.node, startLine)) {
              targetNode = path.node;
              path.stop();
            }
          }
        }
      });

      if (declaratorMatch) {
        const match = declaratorMatch as { declarations: babel.VariableDeclarator[]; index: number };
        return this.computeDeclaratorRunRemovalRange(
          code, match.declarations, match.index, match.index, ast.comments ?? []
        );
      }

      if (!targetNode) {
        return null;
      }

      return this.computeFullNodeRange(targetNode as babel.Node);
    } catch (error) {
      logger.warn('js/declaration-analyzer', `Parse failed: ${error}`);
      return null;
    }
  }

  /**
   * 計算多宣告子語句（如 `let a, b;`）中，一組已知 dead 的宣告子名稱協調後的刪除範圍（對齊
   * TS 側 computeDeclaratorGroupRemovalRanges 的行為語意，Babel AST 版）
   *
   * 逐宣告子各自呼叫 getFullDeclarationRange 時，恆回傳整條 VariableDeclaration 範圍，
   * 同語句有多個 dead 宣告子（或部分 dead）時會誤刪存活宣告子或算出重疊範圍。本方法在
   * 同一次呼叫中掌握全部宣告子的 dead 狀態，統一協調：
   * - 全部宣告子皆 dead → 回傳單一元素（整條語句範圍，含前導 trivia）
   * - 部分 dead → 只把「連續的 dead 宣告子」合併成一個 run，每個 run 各自做首/中/末的
   *   逗號手術，run 與 run 之間、run 與存活宣告子之間保證不重疊
   *
   * @param code 原始程式碼
   * @param anchorSymbolName 群組中任一宣告子名稱，用來定位所屬的 VariableDeclaration
   * @param startLine anchorSymbolName 所在行號（1-based）
   * @param deadNames 同一語句中已知為 dead 的宣告子名稱集合（含 anchorSymbolName）
   * @returns 依序回傳每個 dead run 的刪除範圍；找不到符合的宣告、非多宣告子語句、或宣告子
   *          含非簡單識別符（如解構）時回傳 null，呼叫端應 fallback 至逐一呼叫
   *          getFullDeclarationRange
   */
  computeDeclaratorGroupRemovalRanges(
    code: string,
    anchorSymbolName: string,
    startLine: number,
    deadNames: ReadonlySet<string>
  ): Range[] | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
      attachComment: true
    });

    if (!ast) {
      return null;
    }

    try {
      let targetDeclaration: babel.VariableDeclaration | null = null;

      traverse(ast, {
        VariableDeclaration: (path: NodePath<babel.VariableDeclaration>) => {
          const hasAnchor = path.node.declarations.some(
            decl => babel.isIdentifier(decl.id) && decl.id.name === anchorSymbolName
          );
          if (hasAnchor && this.isNodeLineMatch(path.node, startLine)) {
            targetDeclaration = path.node;
            path.stop();
          }
        }
      });

      if (!targetDeclaration) {
        return null;
      }

      const declaration = targetDeclaration as babel.VariableDeclaration;
      const declarations = declaration.declarations;

      // 單一宣告子，非多宣告子語句，呼叫端應 fallback 至 getFullDeclarationRange
      if (declarations.length <= 1) {
        return null;
      }

      const names = declarations.map(decl => (babel.isIdentifier(decl.id) ? decl.id.name : null));

      // 含非簡單識別符（如解構 `let { a, b } = x`）時，run 合併邏輯無法安全判定歸屬，fallback
      if (names.some(name => name === null)) {
        return null;
      }

      const deadFlags = names.map(name => deadNames.has(name as string));

      if (deadFlags.every(flag => flag)) {
        // 全部宣告子皆 dead：整條語句一起刪除，避免逐宣告子各自手術造成的重疊
        return [this.computeFullNodeRange(declaration)];
      }

      const comments = ast.comments ?? [];
      const ranges: Range[] = [];
      let runStart = -1;
      for (let i = 0; i <= deadFlags.length; i++) {
        const isDead = i < deadFlags.length && deadFlags[i];
        if (isDead && runStart === -1) {
          runStart = i;
        } else if (!isDead && runStart !== -1) {
          ranges.push(this.computeDeclaratorRunRemovalRange(code, declarations, runStart, i - 1, comments));
          runStart = -1;
        }
      }

      return ranges;
    } catch (error) {
      logger.warn('js/declaration-analyzer', `Parse failed: ${error}`);
      return null;
    }
  }

  /**
   * 計算節點的完整範圍（包含前導註解），並依既有規則調整起點：
   * 當起始位置不是從行首開始（column > 0）時，表示該行有其他程式碼（如前一個宣告的 }），
   * 應從下一行開始刪除，因為呼叫端的刪除邏輯是按整行刪除，不考慮 column。
   */
  private computeFullNodeRange(node: babel.Node): Range {
    let startOffset = node.start ?? 0;
    let startLineNum = node.loc?.start.line ?? 1;
    let startColumn = node.loc?.start.column ?? 0;

    // 包含前導註解
    if (node.leadingComments && node.leadingComments.length > 0) {
      const firstComment = node.leadingComments[0];
      if (firstComment.start !== undefined && firstComment.start !== null) {
        startOffset = firstComment.start;
      }
      if (firstComment.loc) {
        startLineNum = firstComment.loc.start.line;
        startColumn = firstComment.loc.start.column;
      }
    }

    if (startColumn > 0) {
      startLineNum++;
      startColumn = 0;
    }

    return {
      start: {
        line: startLineNum,
        column: startColumn + 1,
        offset: startOffset
      },
      end: {
        line: node.loc?.end.line ?? 1,
        column: (node.loc?.end.column ?? 0) + 1,
        offset: node.end ?? 0
      }
    };
  }

  /**
   * 計算多宣告子語句中，一段「連續宣告子 run」（單一宣告子時 startIndex === endIndex）
   * 的精確刪除範圍（文字手術），確保同語句內多個 run 各自的範圍彼此不重疊。
   *
   * 三種位置（以整個 run 的邊界判斷，而非單一宣告子）：
   * - run 不含末位：連同 run 之後的逗號（刪到 run 後一個宣告子的起始位置）
   * - run 含末位（且非起始於首位）：連同 run 之前的逗號（從 run 前一個宣告子的結尾開始刪）
   * - run 涵蓋全部宣告子：交由呼叫端改走整句刪除路徑，不應呼叫本方法
   *
   * 逗號前若夾著屬於前一個（存活）宣告子的註解、逗號後若夾著屬於下一個（存活）宣告子的
   * 前導註解，皆保留該註解，邊界退讓到註解外側。
   */
  private computeDeclaratorRunRemovalRange(
    code: string,
    declarations: readonly babel.VariableDeclarator[],
    startIndex: number,
    endIndex: number,
    comments: readonly babel.Comment[]
  ): Range {
    const isLastRun = endIndex === declarations.length - 1;

    let start: { offset: number; line: number; column: number };
    if (isLastRun && startIndex > 0) {
      const prev = declarations[startIndex - 1];
      const current = declarations[startIndex];
      const prevEnd = prev.end ?? 0;
      const commaOffset = this.findSeparatorCommaOffset(code, prevEnd, current.start ?? 0, comments);
      const commentsBeforeComma = this.findCommentsInRange(comments, prevEnd, commaOffset);
      const lastComment = commentsBeforeComma[commentsBeforeComma.length - 1];
      start = lastComment
        ? {
          offset: lastComment.end ?? commaOffset,
          line: lastComment.loc?.end.line ?? 1,
          column: lastComment.loc?.end.column ?? 0
        }
        : { offset: prevEnd, line: prev.loc?.end.line ?? 1, column: prev.loc?.end.column ?? 0 };
    } else {
      const current = declarations[startIndex];
      start = {
        offset: current.start ?? 0,
        line: current.loc?.start.line ?? 1,
        column: current.loc?.start.column ?? 0
      };
    }

    let end: { offset: number; line: number; column: number };
    if (isLastRun) {
      const last = declarations[endIndex];
      end = { offset: last.end ?? 0, line: last.loc?.end.line ?? 1, column: last.loc?.end.column ?? 0 };
    } else {
      const current = declarations[endIndex];
      const next = declarations[endIndex + 1];
      const currentEnd = current.end ?? 0;
      const nextStart = next.start ?? 0;
      const commaOffset = this.findSeparatorCommaOffset(code, currentEnd, nextStart, comments);
      const commentsAfterComma = this.findCommentsInRange(comments, commaOffset + 1, nextStart);
      const firstComment = commentsAfterComma[0];
      end = firstComment
        ? {
          offset: firstComment.start ?? nextStart,
          line: firstComment.loc?.start.line ?? 1,
          column: firstComment.loc?.start.column ?? 0
        }
        : { offset: nextStart, line: next.loc?.start.line ?? 1, column: next.loc?.start.column ?? 0 };
    }

    return {
      start: { line: start.line, column: start.column + 1, offset: start.offset },
      end: { line: end.line, column: end.column + 1, offset: end.offset }
    };
  }

  /**
   * 在 [from, to) 範圍內尋找分隔宣告子的逗號字元位置，略過區間內的註解文字本身含有逗號
   * 字元的情形（如 `let a /* x, y *\/, b`），避免誤判分隔位置
   */
  private findSeparatorCommaOffset(
    code: string,
    from: number,
    to: number,
    comments: readonly babel.Comment[]
  ): number {
    for (let i = from; i < to; i++) {
      if (code[i] === ',' && !this.isInsideAnyComment(i, comments)) {
        return i;
      }
    }
    // 理論上不會發生（宣告子之間必有逗號分隔），fallback 回 to 維持既有行為
    return to;
  }

  private isInsideAnyComment(offset: number, comments: readonly babel.Comment[]): boolean {
    return comments.some(comment => (comment.start ?? -1) <= offset && offset < (comment.end ?? -1));
  }

  /**
   * 找出完全落在 [from, to) 範圍內的註解（用於判斷分隔逗號前後是否夾著需要保留的宣告子註解）
   */
  private findCommentsInRange(
    comments: readonly babel.Comment[],
    from: number,
    to: number
  ): babel.Comment[] {
    if (from >= to) {
      return [];
    }
    return comments.filter(comment => (comment.start ?? -1) >= from && (comment.end ?? Infinity) <= to);
  }

  /**
   * 解析程式碼中的所有 import 宣告
   * @param code - 原始程式碼
   * @returns import 宣告陣列或 null
   */
  getImportDeclarations(code: string): ImportDeclaration[] | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx']
    });

    if (!ast) {
      return null;
    }

    const declarations: ImportDeclaration[] = [];

    traverse(ast, {
      ImportDeclaration: (path: NodePath<babel.ImportDeclaration>) => {
        const decl = this.parseBabelImportDeclaration(path.node, code);
        if (decl) {
          declarations.push(decl);
        }
      }
    });

    return declarations;
  }

  /**
   * 格式化函數簽章
   * JavaScript 沒有型別標註，型別統一為 'any'
   * @param code - 原始程式碼
   * @param functionName - 函數名稱
   * @param line - 函數所在行號（可選；未提供時取第一個匹配的宣告）
   * @returns 格式化後的簽章或 null
   */
  formatSignature(
    code: string,
    functionName: string,
    line?: number
  ): FormattedSignature | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx']
    });

    if (!ast) {
      return null;
    }

    let foundParams: babel.Node[] | null = null;
    let foundStartLine: number | undefined;

    traverse(ast, {
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        if (path.node.id?.name === functionName
            && (line === undefined || this.isNodeLineMatch(path.node, line))) {
          foundParams = path.node.params;
          foundStartLine = path.node.loc?.start.line;
          path.stop();
        }
      },

      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        if (babel.isIdentifier(path.node.id)
            && path.node.id.name === functionName
            && path.node.init
            && (babel.isArrowFunctionExpression(path.node.init) || babel.isFunctionExpression(path.node.init))
            && (line === undefined || this.isNodeLineMatch(path.node, line))) {
          foundParams = path.node.init.params;
          foundStartLine = path.node.loc?.start.line;
          path.stop();
        }
      },

      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        if (babel.isIdentifier(path.node.key)
            && path.node.key.name === functionName
            && (line === undefined || this.isNodeLineMatch(path.node, line))) {
          foundParams = path.node.params;
          foundStartLine = path.node.loc?.start.line;
          path.stop();
        }
      }
    });

    if (!foundParams || foundStartLine === undefined) {
      return null;
    }

    const parameters = this.extractBabelParametersFromAny(foundParams, code);

    return {
      parameters,
      returnType: 'any',
      startLine: foundStartLine
    };
  }

  /**
   * 提取符號的 JSDoc 文件註解
   * @param code - 原始程式碼
   * @param symbolName - 符號名稱
   * @param symbolType - 符號類型
   * @param line - 符號所在行號
   * @returns JSDoc 文件或 null
   */
  getDocumentation(
    code: string,
    symbolName: string,
    symbolType: string,
    line: number
  ): Documentation | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
      attachComment: true
    });

    if (!ast) {
      return null;
    }

    let targetNode: babel.Node | null = null;

    traverse(ast, {
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        if (symbolType === 'function' && path.node.id?.name === symbolName) {
          if (this.isNodeLineMatch(path.node, line)) {
            targetNode = path.node;
            path.stop();
          }
        }
      },

      ClassDeclaration: (path: NodePath<babel.ClassDeclaration>) => {
        if (symbolType === 'class' && path.node.id?.name === symbolName) {
          if (this.isNodeLineMatch(path.node, line)) {
            targetNode = path.node;
            path.stop();
          }
        }
      },

      VariableDeclaration: (path: NodePath<babel.VariableDeclaration>) => {
        if (symbolType === 'variable' || symbolType === 'constant' || symbolType === 'function') {
          for (const decl of path.node.declarations) {
            if (babel.isIdentifier(decl.id) && decl.id.name === symbolName) {
              if (this.isNodeLineMatch(path.node, line)) {
                targetNode = path.node;
                path.stop();
              }
            }
          }
        }
      }
    });

    if (!targetNode) {
      return null;
    }

    const node = targetNode as babel.Node;
    const leadingComments = node.leadingComments;
    if (!leadingComments || leadingComments.length === 0) {
      return null;
    }

    // 尋找 JSDoc 註解（以 /** 開頭）
    const jsDocComment = leadingComments.find(
      (comment: babel.Comment) => comment.type === 'CommentBlock' && comment.value.startsWith('*')
    );

    if (!jsDocComment) {
      return null;
    }

    const rawText = `/*${jsDocComment.value}*/`;
    const { description, tags } = parseJSDocContent(jsDocComment.value);

    return {
      rawText,
      description,
      tags
    };
  }

  /**
   * 檢查節點行號是否匹配（允許 JSDoc 造成的偏移）
   */
  private isNodeLineMatch(node: babel.Node, targetStartLine: number): boolean {
    const nodeStartLine = node.loc?.start.line ?? 0;
    return isLineMatch(nodeStartLine, targetStartLine);
  }

  /**
   * 解析單個 Babel import 宣告節點
   */
  private parseBabelImportDeclaration(
    node: babel.ImportDeclaration,
    code: string
  ): ImportDeclaration | null {
    const moduleSpecifier = node.source.value;

    const range = {
      start: {
        line: node.loc?.start.line ?? 1,
        column: (node.loc?.start.column ?? 0) + 1,
        offset: node.start ?? 0
      },
      end: {
        line: node.loc?.end.line ?? 1,
        column: (node.loc?.end.column ?? 0) + 1,
        offset: node.end ?? 0
      }
    };

    const rawStatement = code.substring(node.start ?? 0, node.end ?? 0);

    // JavaScript 不支援 type-only import
    const isTypeOnly = false;

    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;
    const namedImports: ImportNamedSpecifier[] = [];

    for (const specifier of node.specifiers) {
      if (babel.isImportDefaultSpecifier(specifier)) {
        defaultImport = specifier.local.name;
      } else if (babel.isImportNamespaceSpecifier(specifier)) {
        namespaceImport = specifier.local.name;
      } else if (babel.isImportSpecifier(specifier)) {
        const imported = specifier.imported;
        const importedName = babel.isIdentifier(imported) ? imported.name : imported.value;
        const localName = specifier.local.name;

        const spec: ImportNamedSpecifier = {
          name: importedName
        };

        if (importedName !== localName) {
          spec.alias = localName;
        }

        namedImports.push(spec);
      }
    }

    return {
      range,
      moduleSpecifier,
      isTypeOnly,
      defaultImport,
      namespaceImport,
      namedImports,
      rawStatement
    };
  }

  /**
   * 提取 Babel 函數參數
   */
  private extractBabelParametersFromAny(
    params: babel.Node[],
    code: string
  ): FormattedParameter[] {
    const parameters: FormattedParameter[] = [];

    for (const param of params) {
      if (babel.isIdentifier(param)) {
        parameters.push({
          name: param.name,
          type: 'any',
          optional: false
        });
      } else if (babel.isAssignmentPattern(param)) {
        if (babel.isIdentifier(param.left)) {
          const start = param.right.start;
          const end = param.right.end;
          const defaultValue = start !== null
            && start !== undefined
            && end !== null
            && end !== undefined
            ? code.substring(start, end)
            : undefined;
          parameters.push({
            name: param.left.name,
            type: 'any',
            optional: true,
            defaultValue
          });
        }
      } else if (babel.isRestElement(param)) {
        if (babel.isIdentifier(param.argument)) {
          parameters.push({
            name: `...${param.argument.name}`,
            type: 'any[]',
            optional: false
          });
        }
      } else if (babel.isObjectPattern(param) || babel.isArrayPattern(param)) {
        const start = param.start;
        const end = param.end;
        const paramText = start !== null
          && start !== undefined
          && end !== null
          && end !== undefined
          ? code.substring(start, end)
          : '{}';
        parameters.push({
          name: paramText,
          type: 'any',
          optional: false
        });
      }
    }

    return parameters;
  }
}
