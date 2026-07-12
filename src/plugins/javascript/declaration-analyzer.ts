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
            for (const decl of path.node.declarations) {
              if (babel.isIdentifier(decl.id) && decl.id.name === symbolName) {
                if (this.isNodeLineMatch(path.node, startLine)) {
                  targetNode = path.node;
                  path.stop();
                }
              }
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

      if (!targetNode) {
        return null;
      }

      const node = targetNode as babel.Node;
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

      // 修正：當起始位置不是從行首開始（column > 0）時，
      // 表示該行有其他程式碼（如前一個宣告的 }），應從下一行開始刪除。
      // 這是因為呼叫端的刪除邏輯是按整行刪除，不考慮 column。
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
    } catch (error) {
      logger.warn('js/declaration-analyzer', `Parse failed: ${error}`);
      return null;
    }
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
   * @param line - 函數所在行號
   * @returns 格式化後的簽章或 null
   */
  formatSignature(
    code: string,
    functionName: string,
    line: number
  ): FormattedSignature | null {
    const ast = this.parseWithCache(code, {
      sourceType: 'unambiguous',
      plugins: ['jsx']
    });

    if (!ast) {
      return null;
    }

    let foundParams: babel.Node[] | null = null;

    traverse(ast, {
      FunctionDeclaration: (path: NodePath<babel.FunctionDeclaration>) => {
        if (path.node.id?.name === functionName && this.isNodeLineMatch(path.node, line)) {
          foundParams = path.node.params;
          path.stop();
        }
      },

      VariableDeclarator: (path: NodePath<babel.VariableDeclarator>) => {
        if (babel.isIdentifier(path.node.id)
            && path.node.id.name === functionName
            && path.node.init
            && (babel.isArrowFunctionExpression(path.node.init) || babel.isFunctionExpression(path.node.init))
            && this.isNodeLineMatch(path.node, line)) {
          foundParams = path.node.init.params;
          path.stop();
        }
      },

      ClassMethod: (path: NodePath<babel.ClassMethod>) => {
        if (babel.isIdentifier(path.node.key)
            && path.node.key.name === functionName
            && this.isNodeLineMatch(path.node, line)) {
          foundParams = path.node.params;
          path.stop();
        }
      }
    });

    if (!foundParams) {
      return null;
    }

    const parameters = this.extractBabelParametersFromAny(foundParams, code);

    return {
      parameters,
      returnType: 'any'
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
