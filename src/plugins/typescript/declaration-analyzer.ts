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
import { isLineMatch, computeContentHash } from '@plugins/shared/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { logger } from '@infrastructure/logging/index.js';

/**
 * 宣告分析器類別
 * 提供 TypeScript 程式碼的宣告解析功能
 */
export class DeclarationAnalyzer {
  /**
   * SourceFile 快取（使用 MemoryCache 自動 LRU 淘汰）
   * key: code 的 SHA256 全內容雜湊（computeContentHash）
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
    const hash = computeContentHash(code);

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
      return this.computeFullNodeRange(sourceFile, targetNode);
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到字串匹配
      return null;
    }
  }

  /**
   * 計算節點的完整範圍（包含前導 trivia：空白、註解）
   * getFullStart() 包含前導 trivia，getStart() 是實際程式碼開始位置，getEnd() 是結束位置
   *
   * 當 trivia 開始於行中間（column > 0，即不是行首）時，表示該行有其他程式碼
   * （如前一個宣告的 }），應從下一行開始刪除，因為呼叫端的刪除邏輯是按整行刪除，不考慮 column。
   */
  private computeFullNodeRange(sourceFile: ts.SourceFile, node: ts.Node): Range {
    const fullStart = node.getFullStart();
    const end = node.getEnd();

    const startPos = sourceFile.getLineAndCharacterOfPosition(fullStart);
    const endPos = sourceFile.getLineAndCharacterOfPosition(end);

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
    return this.computeDeclaratorRunRemovalRange(sourceFile, declarations, index, index);
  }

  /**
   * 計算多宣告子語句中，一段「連續宣告子 run」（單一宣告子時 startIndex === endIndex）
   * 的精確刪除範圍（文字手術），確保同語句內多個 run 各自的範圍彼此不重疊（D5）。
   *
   * 三種位置（以整個 run 的邊界判斷，而非單一宣告子）：
   * - run 不含末位：連同 run 之後的逗號（刪到 run 後一個宣告子的起始位置）
   * - run 含末位（且非起始於首位）：連同 run 之前的逗號（從 run 前一個宣告子的結尾開始刪）
   * - run 涵蓋全部宣告子：交由呼叫端改走整句刪除路徑，不應呼叫本方法
   *
   * trivia 歸屬（R2-3）：分隔逗號前的 trivia 屬於前一個宣告子、逗號後的 trivia 屬於
   * 後一個宣告子。非末位 run 的終點與末位 run 的起點若跨過分隔逗號侵入存活宣告子的
   * trivia 區，會把存活宣告子自身的註解一併刪除；因此邊界須先落在分隔逗號本身，
   * 再檢查逗號另一側是否有存活宣告子的註解，有則把邊界退讓到註解外側予以保留。
   */
  private computeDeclaratorRunRemovalRange(
    sourceFile: ts.SourceFile,
    declarations: readonly ts.VariableDeclaration[],
    startIndex: number,
    endIndex: number
  ): Range {
    const isLastRun = endIndex === declarations.length - 1;

    let startPos: number;
    if (isLastRun && startIndex > 0) {
      const prevEnd = declarations[startIndex - 1].getEnd();
      // 逗號前若夾著屬於前一個（存活）宣告子的註解，保留註解，只從註解結尾之後開始刪
      const commentsBeforeComma = this.scanCommentRangesInGap(
        sourceFile, prevEnd, declarations[startIndex].getStart(sourceFile)
      );
      startPos = commentsBeforeComma.length > 0
        ? commentsBeforeComma[commentsBeforeComma.length - 1].end
        : prevEnd;
    } else {
      startPos = declarations[startIndex].getStart(sourceFile);
    }

    let endPos: number;
    if (isLastRun) {
      endPos = declarations[endIndex].getEnd();
    } else {
      const nextStart = declarations[endIndex + 1].getStart(sourceFile);
      const commaStart = this.findSeparatorCommaStart(sourceFile, declarations[endIndex].getEnd(), nextStart);
      // 逗號後若夾著屬於下一個（存活）宣告子的前導註解，保留註解，只刪到註解開始之前
      const commentsAfterComma = this.scanCommentRangesInGap(sourceFile, commaStart + 1, nextStart);
      endPos = commentsAfterComma.length > 0 ? commentsAfterComma[0].pos : nextStart;
    }

    const startLC = sourceFile.getLineAndCharacterOfPosition(startPos);
    const endLC = sourceFile.getLineAndCharacterOfPosition(endPos);

    return {
      start: { line: startLC.line + 1, column: startLC.character + 1, offset: startPos },
      end: { line: endLC.line + 1, column: endLC.character + 1, offset: endPos }
    };
  }

  /**
   * 在 [from, to) 範圍內尋找分隔宣告子的逗號 token 起始位置
   * 使用 scanner 逐 token 掃描（而非字串搜尋），避免區間內的註解本身含有逗號字元時
   * 誤判分隔位置
   */
  private findSeparatorCommaStart(sourceFile: ts.SourceFile, from: number, to: number): number {
    const scanner = ts.createScanner(sourceFile.languageVersion, /* skipTrivia */ true, sourceFile.languageVariant, sourceFile.text);
    scanner.setTextPos(from);
    while (scanner.getTextPos() < to) {
      const token = scanner.scan();
      if (token === ts.SyntaxKind.CommaToken) {
        return scanner.getTextPos() - 1;
      }
      if (token === ts.SyntaxKind.EndOfFileToken) {
        break;
      }
    }
    // 理論上不會發生（宣告子之間必有逗號分隔），fallback 回 to 維持既有行為
    return to;
  }

  /**
   * 在 [from, to) 範圍內掃描所有註解 trivia（不要求前面有換行，涵蓋同行內註解），
   * 停在第一個非空白、非註解的真實字元（即分隔逗號或下一個宣告子本身）。
   * 用於判斷分隔逗號前後是否夾著需要保留的宣告子註解。
   */
  private scanCommentRangesInGap(
    sourceFile: ts.SourceFile, from: number, to: number
  ): Array<{ pos: number; end: number }> {
    if (from >= to) {
      return [];
    }
    const scanner = ts.createScanner(
      sourceFile.languageVersion, /* skipTrivia */ false, sourceFile.languageVariant, sourceFile.text,
      undefined, from, to - from
    );
    const ranges: Array<{ pos: number; end: number }> = [];
    let token = scanner.scan();
    while (token !== ts.SyntaxKind.EndOfFileToken) {
      if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
        ranges.push({ pos: scanner.getTokenPos(), end: scanner.getTextPos() });
      } else if (token !== ts.SyntaxKind.WhitespaceTrivia && token !== ts.SyntaxKind.NewLineTrivia) {
        break;
      }
      token = scanner.scan();
    }
    return ranges;
  }

  /**
   * 計算多宣告子語句中，一組已知 dead 的宣告子名稱協調後的刪除範圍（D5：跨宣告子避免重疊）
   *
   * 逐宣告子各自呼叫 getFullDeclarationRange 時，「首位吃尾逗號」與「末位吃前逗號」的
   * 規則在同語句有多個 dead 宣告子時會各自算出重疊的刪除範圍，--apply 後把換行與分號
   * 一併吞掉，造成語法毀損。本方法在同一次呼叫中掌握全部宣告子的 dead 狀態，統一協調：
   * - 全部宣告子皆 dead → 回傳單一元素（整條語句範圍，含前導 trivia），回到 D1 修復前
   *   對整句的處理路徑
   * - 部分 dead → 只把「連續的 dead 宣告子」合併成一個 run，每個 run 各自做首/中/末的
   *   逗號手術，run 與 run 之間、run 與存活宣告子之間保證不重疊
   *
   * @param code 原始程式碼
   * @param anchorSymbolName 群組中任一宣告子名稱，用來定位所屬的 VariableStatement
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
    try {
      const sourceFile = this.getOrCreateSourceFile(code);
      const targetNode = this.findDeclarationNode(sourceFile, anchorSymbolName, 'variable', startLine);
      if (!targetNode || !ts.isVariableDeclaration(targetNode)) {
        // 非多宣告子語句（單一宣告子時 findDeclarationNode 回傳整個 VariableStatement，
        // 不會窄化為 VariableDeclaration），呼叫端應 fallback
        return null;
      }

      const declarationList = targetNode.parent;
      if (!ts.isVariableDeclarationList(declarationList)) {
        return null;
      }
      const statement = declarationList.parent;
      if (!ts.isVariableStatement(statement)) {
        return null;
      }

      const declarations = declarationList.declarations;
      const names = declarations.map(decl => (ts.isIdentifier(decl.name) ? decl.name.text : null));

      // 含非簡單識別符（如解構 `let { a, b } = x`）時，run 合併邏輯無法安全判定歸屬，fallback
      if (names.some(name => name === null)) {
        return null;
      }

      const deadFlags = names.map(name => deadNames.has(name as string));

      if (deadFlags.every(flag => flag)) {
        // 全部宣告子皆 dead：整條語句一起刪除，避免逐宣告子各自手術造成的重疊
        return [this.computeFullNodeRange(sourceFile, statement)];
      }

      const ranges: Range[] = [];
      let runStart = -1;
      for (let i = 0; i <= deadFlags.length; i++) {
        const isDead = i < deadFlags.length && deadFlags[i];
        if (isDead && runStart === -1) {
          runStart = i;
        } else if (!isDead && runStart !== -1) {
          ranges.push(this.computeDeclaratorRunRemovalRange(sourceFile, declarations, runStart, i - 1));
          runStart = -1;
        }
      }

      return ranges;
    } catch (error) {
      logger.warn('ts/declaration-analyzer', `AST extraction failed: ${error}`);
      // 解析失敗，返回 null 讓呼叫端 fallback 到逐一獨立處理
      return null;
    }
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
