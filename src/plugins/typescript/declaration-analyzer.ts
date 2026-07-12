/**
 * TypeScript 宣告分析器
 * 負責解析宣告範圍、import 宣告、函數簽章和 JSDoc 文件
 */

import * as ts from 'typescript';
import type {
  ImportDeclaration,
  ImportNamedSpecifier,
  FormattedSignature,
  FormattedParameter,
  Documentation,
  DocumentationTag
} from '@infrastructure/parser/index.js';
import type { Range } from '@shared/types/index.js';
import { isLineMatch } from '@plugins/shared/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { logger } from '@infrastructure/logging/index.js';

/**
 * 宣告分析器類別
 * 提供 TypeScript 程式碼的宣告解析功能
 */
export class DeclarationAnalyzer {
  /**
   * SourceFile 快取（使用 MemoryCache 自動 LRU 淘汰）
   * key: code 的 hash（長度 + 前後各 100 字元）
   * value: ts.SourceFile
   */
  private readonly sourceFileCache: MemoryCache<string, ts.SourceFile> = createLRUCache(100);

  /**
   * 建立宣告分析器實例
   * @param compilerOptions TypeScript 編譯器選項
   */
  constructor(private readonly compilerOptions?: ts.CompilerOptions) {}

  /**
   * 取得或建立 SourceFile（使用 MemoryCache 自動 LRU）
   * @param code 原始程式碼
   * @returns SourceFile
   */
  private getOrCreateSourceFile(code: string): ts.SourceFile {
    // 使用簡單的 hash：長度 + 前 100 字元 + 後 100 字元
    const hash = `${code.length}_${code.slice(0, 100)}_${code.slice(-100)}`;

    // 檢查快取（MemoryCache 自動更新 lastAccessedAt）
    const cached = this.sourceFileCache.get(hash);
    if (cached) {
      return cached;
    }

    // 建立新的 SourceFile
    const sourceFile = ts.createSourceFile(
      'temp.ts',
      code,
      this.compilerOptions?.target || ts.ScriptTarget.ES2020,
      true
    );

    // 快取並返回（MemoryCache 自動處理 LRU 淘汰）
    this.sourceFileCache.set(hash, sourceFile);
    return sourceFile;
  }

  /**
   * 取得完整宣告範圍（包含前導註解）
   * @param code 原始程式碼
   * @param symbolName 符號名稱
   * @param symbolType 符號類型
   * @param startLine 起始行號（1-based）
   * @returns 完整範圍或 null
   */
  getFullDeclarationRange(
    code: string,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): Range | null {
    try {
      const sourceFile = this.getOrCreateSourceFile(code);

      const targetNode = this.findDeclarationNode(sourceFile, symbolName, symbolType, startLine);
      if (!targetNode) {
        return null;
      }

      // 多宣告子語句（如 `let a, b;`）：findDeclarationNode 已回傳精確的目標 VariableDeclaration
      // 節點（而非整個 VariableStatement），偵測粒度＝刪除粒度，只刪這個宣告子（含前後逗號手術）
      if (ts.isVariableDeclaration(targetNode)) {
        return this.computeDeclaratorRemovalRange(sourceFile, targetNode);
      }

      // 取得完整範圍（包含前導註解）
      // getFullStart() 包含前導 trivia（空白、註解）
      // getStart() 是實際程式碼開始位置
      // getEnd() 是結束位置
      const fullStart = targetNode.getFullStart();
      const end = targetNode.getEnd();

      const startPos = sourceFile.getLineAndCharacterOfPosition(fullStart);
      const endPos = sourceFile.getLineAndCharacterOfPosition(end);

      // 修正：當 trivia 開始於行中間（column > 0，即不是行首）時，
      // 表示該行有其他程式碼（如前一個宣告的 }），應從下一行開始刪除。
      // 這是因為呼叫端的刪除邏輯是按整行刪除，不考慮 column。
      let adjustedStartLine = startPos.line + 1;
      let adjustedStartColumn = startPos.character + 1;
      if (startPos.character > 0) {
        // trivia 不是從行首開始，調整到下一行
        adjustedStartLine = startPos.line + 2;
        adjustedStartColumn = 1;
      }

      return {
        start: {
          line: adjustedStartLine,
          column: adjustedStartColumn,
          offset: fullStart
        },
        end: {
          line: endPos.line + 1,
          column: endPos.character + 1,
          offset: end
        }
      };
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到字串匹配
      return null;
    }
  }

  /**
   * 在 AST 中尋找符合條件的宣告節點
   * @param sourceFile TypeScript SourceFile
   * @param symbolName 符號名稱
   * @param symbolType 符號類型
   * @param startLine 起始行號（1-based）
   * @returns 符合條件的節點或 null
   */
  findDeclarationNode(
    sourceFile: ts.SourceFile,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): ts.Node | null {
    let result: ts.Node | null = null;

    const visit = (node: ts.Node): void => {
      if (result) { return; } // 已找到，停止搜尋

      const nodeStartLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

      if (this.isMatchingDeclaration(node, symbolName, symbolType, nodeStartLine, startLine)) {
        result = this.resolveMatchedDeclarationNode(node, symbolName, symbolType);
        return;
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return result;
  }

  /**
   * 將 isMatchingDeclaration 判定為符合的節點，收斂為實際要刪除的目標節點
   *
   * 對多宣告子的 VariableStatement（如 `let a, b;`），偵測粒度是單一宣告子
   * （每個變數各自獨立判定是否為 dead code），刪除粒度必須與之一致，
   * 故回傳精確的目標 VariableDeclaration 節點，而非整個語句。
   * 單一宣告子時維持回傳整個語句節點（含前導註解等既有行為不變）。
   */
  private resolveMatchedDeclarationNode(node: ts.Node, symbolName: string, symbolType: string): ts.Node {
    if (
      (symbolType === 'variable' || symbolType === 'constant')
      && ts.isVariableStatement(node)
      && node.declarationList.declarations.length > 1
    ) {
      const target = node.declarationList.declarations.find(
        decl => ts.isIdentifier(decl.name) && decl.name.text === symbolName
      );
      if (target) {
        return target;
      }
    }
    return node;
  }

  /**
   * 計算多宣告子語句中，單一宣告子的精確刪除範圍（文字手術）
   *
   * 三種位置：
   * - 首位／中間：連同其後的逗號（刪到下一個宣告子的起始位置）
   * - 末位：連同其前的逗號（從前一個宣告子的結尾開始刪）
   */
  private computeDeclaratorRemovalRange(sourceFile: ts.SourceFile, declarator: ts.VariableDeclaration): Range {
    // VariableDeclaration.parent 型別是 VariableDeclarationList | CatchClause；
    // 透過 resolveMatchedDeclarationNode 產生的節點必然來自 VariableStatement.declarationList，
    // 此處窄化型別以安全存取 .declarations（CatchClause 分支僅為防禦性 fallback，理論上不會走到）
    const parent = declarator.parent;
    const declarations = ts.isVariableDeclarationList(parent) ? parent.declarations : [declarator];
    const index = declarations.indexOf(declarator);
    const isLast = index === declarations.length - 1;

    const startPos = isLast && index > 0
      ? declarations[index - 1].getEnd()
      : declarator.getStart(sourceFile);
    const endPos = isLast
      ? declarator.getEnd()
      : declarations[index + 1].getStart(sourceFile);

    const startLC = sourceFile.getLineAndCharacterOfPosition(startPos);
    const endLC = sourceFile.getLineAndCharacterOfPosition(endPos);

    return {
      start: { line: startLC.line + 1, column: startLC.character + 1, offset: startPos },
      end: { line: endLC.line + 1, column: endLC.character + 1, offset: endPos }
    };
  }

  /**
   * 檢查節點是否符合目標宣告
   * @param node AST 節點
   * @param symbolName 符號名稱
   * @param symbolType 符號類型
   * @param nodeStartLine 節點起始行號
   * @param targetStartLine 目標起始行號
   * @returns 是否符合
   */
  isMatchingDeclaration(
    node: ts.Node,
    symbolName: string,
    symbolType: string,
    nodeStartLine: number,
    targetStartLine: number
  ): boolean {
    // 行號必須匹配（允許 JSDoc 造成的偏移）
    if (!isLineMatch(nodeStartLine, targetStartLine)) {
      return false;
    }

    // 根據符號類型匹配節點類型
    switch (symbolType) {
      case 'class':
        if (ts.isClassDeclaration(node) && node.name?.text === symbolName) {
          return true;
        }
        break;

      case 'function':
        if (ts.isFunctionDeclaration(node) && node.name?.text === symbolName) {
          return true;
        }
        // 檢查 class method（MethodDeclaration）
        if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === symbolName) {
          return true;
        }
        // 檢查 arrow function 變數宣告
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === symbolName) {
              if (decl.initializer
                  && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
                return true;
              }
            }
          }
        }
        break;

      case 'variable':
      case 'constant':
        if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name) && decl.name.text === symbolName) {
              return true;
            }
          }
        }
        break;

      case 'interface':
        if (ts.isInterfaceDeclaration(node) && node.name.text === symbolName) {
          return true;
        }
        break;

      case 'type':
        if (ts.isTypeAliasDeclaration(node) && node.name.text === symbolName) {
          return true;
        }
        break;

      case 'enum':
        if (ts.isEnumDeclaration(node) && node.name.text === symbolName) {
          return true;
        }
        break;

      case 'namespace':
      case 'module':
        if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === symbolName) {
          return true;
        }
        break;
    }

    return false;
  }

  /**
   * 解析程式碼中的所有 import 宣告
   * 使用 TypeScript Compiler API 精確解析
   * @param code 原始程式碼
   * @returns import 宣告陣列或 null
   */
  getImportDeclarations(code: string): ImportDeclaration[] | null {
    try {
      const sourceFile = this.getOrCreateSourceFile(code);

      const declarations: ImportDeclaration[] = [];

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node)) {
          const decl = this.parseImportDeclaration(node, sourceFile, code);
          if (decl) {
            declarations.push(decl);
          }
        }
      });

      return declarations;
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到字串解析
      return null;
    }
  }

  /**
   * 解析單個 import 宣告節點
   * @param node import 宣告節點
   * @param sourceFile TypeScript SourceFile
   * @param code 原始程式碼
   * @returns ImportDeclaration 或 null
   */
  parseImportDeclaration(
    node: ts.ImportDeclaration,
    sourceFile: ts.SourceFile,
    code: string
  ): ImportDeclaration | null {
    // 取得模組路徑
    if (!ts.isStringLiteral(node.moduleSpecifier)) {
      return null;
    }
    const moduleSpecifier = node.moduleSpecifier.text;

    // 取得範圍（1-based）
    const startPos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const endPos = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const range = {
      start: { line: startPos.line + 1, column: startPos.character + 1, offset: node.getStart(sourceFile) },
      end: { line: endPos.line + 1, column: endPos.character + 1, offset: node.getEnd() }
    };

    // 取得原始語句文字
    const rawStatement = code.substring(node.getStart(sourceFile), node.getEnd());

    // 判斷是否為 type-only import
    const isTypeOnly = node.importClause?.isTypeOnly ?? false;

    let defaultImport: string | undefined;
    let namespaceImport: string | undefined;
    const namedImports: ImportNamedSpecifier[] = [];

    const importClause = node.importClause;
    if (importClause) {
      // Default import: import Foo from '...'
      if (importClause.name) {
        defaultImport = importClause.name.text;
      }

      // Named bindings
      const namedBindings = importClause.namedBindings;
      if (namedBindings) {
        if (ts.isNamespaceImport(namedBindings)) {
          // Namespace import: import * as Foo from '...'
          namespaceImport = namedBindings.name.text;
        } else if (ts.isNamedImports(namedBindings)) {
          // Named imports: import { A, B as C } from '...'
          for (const element of namedBindings.elements) {
            const spec: ImportNamedSpecifier = {
              name: element.propertyName?.text ?? element.name.text,
              isTypeOnly: element.isTypeOnly
            };
            // 如果有 propertyName，表示有別名：import { foo as bar }
            // propertyName = 'foo', name = 'bar'
            if (element.propertyName) {
              spec.alias = element.name.text;
            }
            namedImports.push(spec);
          }
        }
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
   * 格式化函數簽章
   * 使用 TypeScript Compiler API 精確解析，正確處理複雜泛型巢狀
   * @param code 原始程式碼
   * @param functionName 函數名稱
   * @param line 行號（1-based），可選。若未提供，將找到第一個匹配的函數
   * @returns 格式化簽章或 null
   */
  formatSignature(
    code: string,
    functionName: string,
    line?: number
  ): FormattedSignature | null {
    try {
      const sourceFile = this.getOrCreateSourceFile(code);

      const targetNode = this.findFunctionNode(sourceFile, functionName, line);
      if (!targetNode) {
        return null;
      }

      const parameters = this.extractParameters(targetNode, sourceFile);
      const returnType = this.extractReturnType(targetNode, sourceFile);
      const typeParameters = this.extractTypeParameters(targetNode);

      // 計算函數起始行號（1-based）
      const startLine = sourceFile.getLineAndCharacterOfPosition(targetNode.getStart(sourceFile)).line + 1;

      return {
        parameters,
        returnType,
        typeParameters: typeParameters.length > 0 ? typeParameters : undefined,
        startLine
      };
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到正則匹配
      return null;
    }
  }

  /**
   * 尋找符合條件的函數節點
   * @param sourceFile TypeScript SourceFile
   * @param functionName 函數名稱
   * @param targetLine 目標行號（1-based），可選。若未提供，將找到第一個匹配的函數
   * @returns 函數節點或 null
   */
  findFunctionNode(
    sourceFile: ts.SourceFile,
    functionName: string,
    targetLine?: number
  ): ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | null {
    let result: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | null = null;

    const visit = (node: ts.Node): void => {
      if (result) { return; }

      const nodeStartLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

      // 檢查函數宣告
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        if (targetLine === undefined || isLineMatch(nodeStartLine, targetLine)) {
          result = node;
          return;
        }
      }

      // 檢查方法宣告
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        if (targetLine === undefined || isLineMatch(nodeStartLine, targetLine)) {
          result = node;
          return;
        }
      }

      // 檢查箭頭函數（變數宣告）
      if (ts.isVariableDeclaration(node)
          && ts.isIdentifier(node.name)
          && node.name.text === functionName
          && node.initializer
          && ts.isArrowFunction(node.initializer)) {
        if (targetLine === undefined || isLineMatch(nodeStartLine, targetLine)) {
          result = node.initializer;
          return;
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);
    return result;
  }

  /**
   * 提取函數參數
   * @param node 函數節點
   * @param sourceFile TypeScript SourceFile
   * @returns 格式化參數陣列
   */
  extractParameters(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
    sourceFile: ts.SourceFile
  ): FormattedParameter[] {
    const parameters: FormattedParameter[] = [];

    for (const param of node.parameters) {
      const isRest = !!param.dotDotDotToken;

      if (!ts.isIdentifier(param.name)) {
        // 跳過解構參數等複雜情況，使用整體表示
        const paramText = param.getText(sourceFile);
        parameters.push({
          name: paramText.split(':')[0].trim(),
          type: param.type ? param.type.getText(sourceFile) : 'any',
          optional: !!param.questionToken || !!param.initializer,
          rest: isRest
        });
        continue;
      }

      const paramName = param.name.text;
      const paramType = param.type ? param.type.getText(sourceFile) : 'any';
      const optional = !!param.questionToken || !!param.initializer;
      const defaultValue = param.initializer ? param.initializer.getText(sourceFile) : undefined;

      parameters.push({
        name: paramName,
        type: paramType,
        optional,
        defaultValue,
        rest: isRest
      });
    }

    return parameters;
  }

  /**
   * 提取函數回傳型別
   * @param node 函數節點
   * @param sourceFile TypeScript SourceFile
   * @returns 回傳型別字串
   */
  extractReturnType(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
    sourceFile: ts.SourceFile
  ): string {
    if (node.type) {
      return node.type.getText(sourceFile);
    }
    return 'void';
  }

  /**
   * 提取泛型參數
   * @param node 函數節點
   * @returns 泛型參數名稱陣列
   */
  extractTypeParameters(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): string[] {
    if (!node.typeParameters) {
      return [];
    }

    return node.typeParameters.map(tp => tp.name.text);
  }

  /**
   * 提取符號的 JSDoc 文件註解
   * 使用 TypeScript Compiler API 精確識別屬於該節點的 JSDoc
   * @param code 原始程式碼
   * @param symbolName 符號名稱
   * @param symbolType 符號類型
   * @param line 行號（1-based）
   * @returns Documentation 或 null
   */
  getDocumentation(
    code: string,
    symbolName: string,
    symbolType: string,
    line: number
  ): Documentation | null {
    try {
      const sourceFile = this.getOrCreateSourceFile(code);

      const targetNode = this.findDeclarationNode(sourceFile, symbolName, symbolType, line);
      if (!targetNode) {
        return null;
      }

      // 使用 TypeScript 內建 API 取得 JSDoc
      const jsDocComments = ts.getJSDocCommentsAndTags(targetNode);
      if (jsDocComments.length === 0) {
        return null;
      }

      // 提取原始文字和標籤
      const tags: DocumentationTag[] = [];
      let description: string | undefined;
      const rawTextParts: string[] = [];

      for (const jsDoc of jsDocComments) {
        if (ts.isJSDoc(jsDoc)) {
          // JSDoc 註解節點
          const jsDocText = jsDoc.getFullText(sourceFile);
          rawTextParts.push(jsDocText.trim());

          // 提取描述
          if (jsDoc.comment) {
            const commentText = typeof jsDoc.comment === 'string'
              ? jsDoc.comment
              : jsDoc.comment.map(part => part.getText(sourceFile)).join('');
            if (commentText && !description) {
              description = commentText.trim();
            }
          }

          // 提取標籤
          if (jsDoc.tags) {
            for (const tag of jsDoc.tags) {
              const tagName = tag.tagName.text;
              const tagText = this.extractJSDocTagText(tag, sourceFile);
              tags.push({ name: tagName, text: tagText });
            }
          }
        }
      }

      if (rawTextParts.length === 0) {
        return null;
      }

      return {
        rawText: rawTextParts.join('\n'),
        description,
        tags
      };
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到行號回掃
      return null;
    }
  }

  /**
   * 提取 JSDoc 標籤的文字內容
   * @param tag JSDoc 標籤節點
   * @param sourceFile TypeScript SourceFile
   * @returns 標籤文字
   */
  extractJSDocTagText(tag: ts.JSDocTag, sourceFile: ts.SourceFile): string {
    const parts: string[] = [];

    // 處理 @param 等有名稱的標籤
    if (ts.isJSDocParameterTag(tag) || ts.isJSDocPropertyTag(tag)) {
      if (tag.name) {
        parts.push(tag.name.getText(sourceFile));
      }
    }

    // 處理 @returns/@return 標籤（沒有名稱，只有 comment）

    // 處理註解文字
    if (tag.comment) {
      const commentText = typeof tag.comment === 'string'
        ? tag.comment
        : tag.comment.map(part => part.getText(sourceFile)).join('');
      if (commentText) {
        parts.push(commentText.trim());
      }
    }

    return parts.join(' ').trim();
  }
}

/**
 * 建立宣告分析器實例
 * @param compilerOptions TypeScript 編譯器選項
 * @returns DeclarationAnalyzer 實例
 */
export function createDeclarationAnalyzer(compilerOptions?: ts.CompilerOptions): DeclarationAnalyzer {
  return new DeclarationAnalyzer(compilerOptions);
}
