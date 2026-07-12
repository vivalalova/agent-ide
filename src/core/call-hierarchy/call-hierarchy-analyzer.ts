/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫層次關係（incoming/outgoing）
 */

import * as ts from 'typescript';
import * as babel from '@babel/types';
import babelTraverse from '@babel/traverse';
import type { Range } from '@shared/types/core.js';
import type { Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { getTypeScriptSourceFile, hasBabelAST } from '@infrastructure/parser/index.js';
import { createSymbolFinder, type CallSite, type SymbolFinder } from '@core/foundations/symbol-finder/index.js';
import { createFileUtils, FileUtils } from '@core/foundations/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { logger } from '@infrastructure/logging/index.js';
import type {
  CallHierarchyData,
  CallHierarchyOptions,
  IncomingCall,
  OutgoingCall,
} from './types.js';

const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫者（incoming）和被呼叫者（outgoing）
 */
export class CallHierarchyAnalyzer {
  private readonly symbolFinder: SymbolFinder;
  private readonly fileUtils: FileUtils;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    fileSystem: IFileSystem
  ) {
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
    this.fileUtils = createFileUtils(fileSystem, parserRegistry);
  }

  /**
   * 分析函數的呼叫層次
   */
  async analyze(
    functionName: string,
    projectFiles: readonly string[],
    options: CallHierarchyOptions
  ): Promise<CallHierarchyData | null> {
    // 1. 找到函數定義
    const definition = await this.findFunctionDefinition(functionName, projectFiles);
    if (!definition) {
      return null;
    }

    return this.analyzeWithDefinition(
      functionName,
      definition.location.filePath,
      definition.location.range,
      projectFiles,
      options
    );
  }

  /**
   * 使用已知的定義位置分析函數的呼叫層次
   * 當呼叫端已經透過 IndexEngine 找到定義時使用此方法
   */
  async analyzeWithDefinition(
    functionName: string,
    definitionFile: string,
    definitionRange: Range,
    projectFiles: readonly string[],
    options: CallHierarchyOptions
  ): Promise<CallHierarchyData> {
    const incoming: IncomingCall[] = [];
    const outgoing: OutgoingCall[] = [];

    // 分析 incoming（誰呼叫了此函數）
    if (options.direction === 'incoming' || options.direction === 'both') {
      const incomingCalls = await this.findIncomingCalls(
        functionName,
        projectFiles,
        definitionFile,
        options.depth,
        options.targetCallSiteFilter
      );
      incoming.push(...incomingCalls);
    }

    // 分析 outgoing（此函數呼叫了誰）
    if (options.direction === 'outgoing' || options.direction === 'both') {
      const outgoingCalls = await this.findOutgoingCalls(
        definitionFile,
        functionName,
        definitionRange,
        options.depth
      );
      outgoing.push(...outgoingCalls);
    }

    return {
      functionName,
      definitionFile,
      definitionLine: definitionRange.start.line,
      incoming,
      outgoing
    };
  }

  /**
   * 找到函數定義
   */
  private async findFunctionDefinition(
    functionName: string,
    projectFiles: readonly string[]
  ): Promise<{ location: { filePath: string; range: Range } } | null> {
    for (const filePath of projectFiles) {
      const definition = await this.symbolFinder.findDefinition(filePath, functionName);
      if (definition && this.isFunctionSymbol(definition.symbol)) {
        return { location: definition.symbol.location };
      }
    }
    return null;
  }

  /**
   * 檢查是否為函數類型的符號
   */
  private isFunctionSymbol(symbol: Symbol): boolean {
    // SymbolType.Function 涵蓋函數和方法
    return symbol.type === 'function';
  }

  /**
   * 找出 incoming 呼叫（誰呼叫了目標函數）
   * 使用批次處理優化：按檔案分組，避免重複讀取/解析同一檔案
   */
  private async findIncomingCalls(
    functionName: string,
    projectFiles: readonly string[],
    definitionFile: string,
    depth: number,
    targetCallSiteFilter?: (callSite: CallSite) => Promise<boolean>
  ): Promise<IncomingCall[]> {
    const incoming: IncomingCall[] = [];
    const visited = new Set<string>();

    const findCallsRecursive = async (
      targetName: string,
      currentDepth: number
    ): Promise<void> => {
      if (currentDepth > depth || visited.has(targetName)) {
        return;
      }
      visited.add(targetName);

      let callSites = await this.symbolFinder.findCallSites(targetName, projectFiles);
      if (currentDepth === 1 && targetCallSiteFilter) {
        callSites = await this.filterCallSites(callSites, targetCallSiteFilter);
      }
      if (callSites.length === 0) {
        return;
      }

      // 批次查詢所有 callSites 的 enclosing functions（按檔案分組處理）
      const queries = callSites.map(callSite => ({
        filePath: callSite.location.filePath,
        line: callSite.location.range.start.line
      }));
      const enclosingFunctions = await this.findEnclosingFunctionsMultiFile(queries);

      // 批次取得所有 context（按檔案分組處理）
      const contexts = await this.getLineContextsBatch(queries);

      // 建立 incoming 結果
      // 使用 filePath:functionName 作為唯一鍵，避免同名但不同檔案的函數被去重
      const callersToRecurse = new Map<string, { name: string; file: string }>();
      for (const callSite of callSites) {
        const key = `${callSite.location.filePath}:${callSite.location.range.start.line}`;
        const callerInfo = enclosingFunctions.get(key);
        const context = contexts.get(key) || '';

        // 只排除目標函數自己的遞迴呼叫；同檔案其他 caller 仍然是有效 incoming。
        if (callSite.location.filePath === definitionFile && callerInfo?.name === targetName) {
          continue;
        }

        incoming.push({
          caller: callerInfo?.name || '<anonymous>',
          location: callSite.location,
          context,
          callerDefinitionFile: callerInfo?.file
        });

        // 收集需要遞迴的 caller（使用 filePath:functionName 作為唯一鍵去重）
        if (currentDepth < depth && callerInfo?.name && callerInfo.name !== '<anonymous>') {
          const callerKey = `${callerInfo.file}:${callerInfo.name}`;
          if (!callersToRecurse.has(callerKey)) {
            callersToRecurse.set(callerKey, { name: callerInfo.name, file: callerInfo.file });
          }
        }
      }

      // 遞迴查找（如果深度允許）
      for (const caller of callersToRecurse.values()) {
        await findCallsRecursive(caller.name, currentDepth + 1);
      }
    };

    await findCallsRecursive(functionName, 1);
    return incoming;
  }

  private async filterCallSites(
    callSites: readonly CallSite[],
    targetCallSiteFilter: (callSite: CallSite) => Promise<boolean>
  ): Promise<CallSite[]> {
    const filteredCallSites: CallSite[] = [];

    for (const callSite of callSites) {
      if (await targetCallSiteFilter(callSite)) {
        filteredCallSites.push(callSite);
      }
    }

    return filteredCallSites;
  }

  /**
   * 找出 outgoing 呼叫（目標函數呼叫了誰）
   * @param depth 預留參數：未來可用於遞迴深度控制或效能優化
   */
  private async findOutgoingCalls(
    filePath: string,
    functionName: string,
    functionRange: Range,
    _depth: number // Reserved: 未來可實作遞迴分析或深度限制優化
  ): Promise<OutgoingCall[]> {
    const outgoing: OutgoingCall[] = [];
    const visited = new Set<string>();

    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return outgoing;
    }

    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser) {
      return outgoing;
    }

    try {
      const ast = await parser.parse(content, filePath);
      const sourceFile = getTypeScriptSourceFile(ast);

      if (!sourceFile) {
        if (hasBabelAST(ast)) {
          return this.findOutgoingCallsFromBabel(ast.babelAST, ast.sourceCode, functionName, filePath, functionRange, visited);
        }
        return outgoing;
      }

      // 找到目標函數的 AST 節點
      const functionNode = this.findFunctionNode(sourceFile, functionName, functionRange);
      if (!functionNode || !functionNode.body) {
        return outgoing;
      }

      // 巢狀的可獨立定址函數/類別節點是邊界，其內部呼叫歸屬該節點自身，不遞迴進去
      const isNestedDefinitionBoundary = (node: ts.Node): boolean =>
        ts.isFunctionDeclaration(node) ||
        (ts.isFunctionExpression(node) && node.name !== undefined) ||
        ts.isMethodDeclaration(node) ||
        ts.isGetAccessor(node) ||
        ts.isSetAccessor(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node);

      // 遍歷函數 body 找出所有 CallExpression
      const findCallsInNode = (node: ts.Node): void => {
        if (isNestedDefinitionBoundary(node)) {
          return;
        }

        if (ts.isCallExpression(node)) {
          const callInfo = this.extractCallInfo(node, sourceFile);
          if (callInfo) {
            const key = `${callInfo.callee}:${callInfo.line}:${callInfo.column}`;
            if (!visited.has(key)) {
              visited.add(key);

              outgoing.push({
                callee: callInfo.callee,
                location: {
                  filePath,
                  range: {
                    start: { line: callInfo.line, column: callInfo.column },
                    end: { line: callInfo.line, column: callInfo.column + callInfo.callee.length }
                  }
                },
                context: callInfo.context,
                isMethodCall: callInfo.isMethodCall,
                receiver: callInfo.receiver
              });
            }
          }
        }

        ts.forEachChild(node, findCallsInNode);
      };

      findCallsInNode(functionNode.body);
    } catch (error) {
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return outgoing;
  }

  /**
   * 使用 Babel AST 找出 outgoing 呼叫（JS 檔案）
   */
  private findOutgoingCallsFromBabel(
    babelAst: import('@babel/parser').ParseResult<babel.File>,
    sourceCode: string,
    functionName: string,
    filePath: string,
    functionRange: Range,
    visited: Set<string>
  ): OutgoingCall[] {
    const outgoing: OutgoingCall[] = [];
    const lines = sourceCode.split('\n');

    // 找到目標函式節點範圍（用於後續判斷是否在函式內）
    let fallbackFunctionPath: import('@babel/traverse').NodePath | null = null;
    let targetFunctionPath: import('@babel/traverse').NodePath | null = null;

    const recordCandidate = (
      path: import('@babel/traverse').NodePath,
      nameNode: babel.Node | null | undefined
    ): void => {
      fallbackFunctionPath ??= path;
      if (nameNode && this.babelNodeMatchesRange(nameNode, functionRange)) {
        targetFunctionPath = path;
        path.stop();
      }
    };

    traverse(babelAst, {
      FunctionDeclaration(path) {
        if (path.node.id?.name === functionName) {
          recordCandidate(path, path.node.id);
        }
      },
      ArrowFunctionExpression(path) {
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id) && parent.id.name === functionName) {
          recordCandidate(path, parent.id);
        }
      },
      FunctionExpression(path) {
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id) && parent.id.name === functionName) {
          recordCandidate(path, parent.id);
        }
      },
      ObjectMethod(path) {
        if (babel.isIdentifier(path.node.key) && path.node.key.name === functionName) {
          recordCandidate(path, path.node.key);
        }
      },
      ClassMethod(path) {
        if (babel.isIdentifier(path.node.key) && path.node.key.name === functionName) {
          recordCandidate(path, path.node.key);
        }
      },
    });

    targetFunctionPath ??= fallbackFunctionPath;
    if (!targetFunctionPath) {
      return outgoing;
    }

    // 在目標函式內找所有 CallExpression
    // 巢狀的可獨立定址函數/類別節點是邊界，其內部呼叫歸屬該節點自身，不遞迴進去
    (targetFunctionPath as import('@babel/traverse').NodePath).traverse({
      FunctionDeclaration(path) {
        path.skip();
      },
      FunctionExpression(path) {
        if (path.node.id) {
          path.skip();
        }
      },
      ObjectMethod(path) {
        path.skip();
      },
      ClassMethod(path) {
        path.skip();
      },
      ClassDeclaration(path) {
        path.skip();
      },
      ClassExpression(path) {
        path.skip();
      },
      CallExpression(callPath) {
        const node = callPath.node;
        const expr = node.callee;
        let callee: string;
        let isMethodCall = false;
        let receiver: string | undefined;

        if (babel.isIdentifier(expr)) {
          callee = expr.name;
        } else if (babel.isMemberExpression(expr) && !expr.computed && babel.isIdentifier(expr.property)) {
          callee = expr.property.name;
          isMethodCall = true;
          if (babel.isIdentifier(expr.object)) {
            receiver = expr.object.name;
          }
        } else {
          return;
        }

        const loc = node.loc;
        if (!loc) { return; }

        const line = loc.start.line; // 1-based
        const column = loc.start.column + 1; // 轉為 1-based
        const key = `${callee}:${line}:${column}`;
        if (visited.has(key)) { return; }
        visited.add(key);

        const lineText = lines[line - 1] || '';

        outgoing.push({
          callee,
          location: {
            filePath,
            range: {
              start: { line, column },
              end: { line, column: column + callee.length }
            }
          },
          context: lineText.trim(),
          isMethodCall,
          receiver
        });
      }
    });

    return outgoing;
  }

  private babelNodeMatchesRange(node: babel.Node, range: Range): boolean {
    const loc = node.loc;
    if (!loc) {
      return false;
    }

    return loc.start.line === range.start.line && loc.start.column + 1 === range.start.column;
  }

  /**
   * 在 AST 中找到目標函數節點
   */
  private findFunctionNode(
    sourceFile: ts.SourceFile,
    functionName: string,
    range: Range
  ): ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | null {
    let fallback: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null;
    let exactMatch: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null;

    const recordCandidate = (
      functionNode: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
      declarationNode: ts.Node
    ): void => {
      fallback ??= functionNode;
      if (this.nodeNameMatchesRange(declarationNode, sourceFile, range)) {
        exactMatch = functionNode;
      }
    };

    const visit = (node: ts.Node): void => {
      if (exactMatch) {return;}

      // FunctionDeclaration
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        recordCandidate(node, node);
        return;
      }

      // MethodDeclaration
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        recordCandidate(node, node);
        return;
      }

      // Arrow function 或 function expression 賦值給變數
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (node.name.text === functionName && node.initializer) {
          if (ts.isArrowFunction(node.initializer)) {
            recordCandidate(node.initializer, node);
            return;
          }
          if (ts.isFunctionExpression(node.initializer)) {
            recordCandidate(node.initializer, node);
            return;
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return exactMatch ?? fallback;
  }

  private nodeNameMatchesRange(node: ts.Node, sourceFile: ts.SourceFile, range: Range): boolean {
    const nameNode = this.getComparableNameNode(node);
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(nameNode.getStart(sourceFile));

    return line + 1 === range.start.line && character + 1 === range.start.column;
  }

  private getComparableNameNode(node: ts.Node): ts.Node {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
      && node.name
      && ts.isIdentifier(node.name)) {
      return node.name;
    }

    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name;
    }

    return node;
  }

  /**
   * 提取 CallExpression 的資訊
   */
  private extractCallInfo(
    node: ts.CallExpression,
    sourceFile: ts.SourceFile
  ): { callee: string; line: number; column: number; context: string; isMethodCall: boolean; receiver?: string } | null {
    const expr = node.expression;
    let callee: string;
    let isMethodCall = false;
    let receiver: string | undefined;

    if (ts.isIdentifier(expr)) {
      callee = expr.text;
    } else if (ts.isPropertyAccessExpression(expr)) {
      callee = expr.name.text;
      isMethodCall = true;
      receiver = expr.expression.getText(sourceFile);
    } else {
      // 不支援的呼叫類型（如 computed property access）
      return null;
    }

    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const lines = sourceFile.text.split('\n');
    const lineText = lines[line] || '';

    return {
      callee,
      line: line + 1,      // 轉為 1-based
      column: character + 1,
      context: lineText.trim(),
      isMethodCall,
      receiver
    };
  }

  /**
   * 批次找出單一檔案中多個行號所在的外層函數
   * 將 O(N) 檔案讀取降為 O(1)
   */
  private async findEnclosingFunctions(
    filePath: string,
    lines: readonly number[]
  ): Promise<Map<number, { name: string; file: string }>> {
    const results = new Map<number, { name: string; file: string }>();

    if (lines.length === 0) {
      return results;
    }

    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return results;
    }

    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser) {
      return results;
    }

    try {
      const ast = await parser.parse(content, filePath);
      const sourceFile = getTypeScriptSourceFile(ast);

      if (!sourceFile) {
        if (hasBabelAST(ast)) {
          return this.findEnclosingFunctionsFromBabel(ast.babelAST, ast.sourceCode, lines, filePath);
        }
        return results;
      }

      // 將行號轉換為 position 並建立映射（跳過超出範圍的行號）
      const lineCount = sourceFile.getLineStarts().length;
      const linePositions = lines
        .filter(line => line >= 1 && line <= lineCount)
        .map(line => ({
          line,
          position: sourceFile.getPositionOfLineAndCharacter(line - 1, 0)
        }));

      // 遍歷 AST 找出每個 position 的 enclosing function
      for (const { line, position } of linePositions) {
        const enclosingName = this.findEnclosingFunctionAtPosition(sourceFile, position);
        if (enclosingName) {
          results.set(line, { name: enclosingName, file: filePath });
        }
      }
    } catch (error) {
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return results;
  }

  /**
   * 批次查詢多個檔案中多個行號的 enclosing functions
   * 按檔案分組後批次處理，避免重複讀取/解析同一檔案
   */
  private async findEnclosingFunctionsMultiFile(
    queries: readonly { filePath: string; line: number }[]
  ): Promise<Map<string, { name: string; file: string }>> {
    const results = new Map<string, { name: string; file: string }>();

    if (queries.length === 0) {
      return results;
    }

    // 按檔案分組（使用 Set 避免重複行號）
    const fileGroups = new Map<string, Set<number>>();
    for (const query of queries) {
      const existing = fileGroups.get(query.filePath);
      if (existing) {
        existing.add(query.line);
      } else {
        fileGroups.set(query.filePath, new Set([query.line]));
      }
    }

    // 批次處理每個檔案
    await Promise.all(
      Array.from(fileGroups.entries()).map(async ([filePath, linesSet]) => {
        try {
          const fileResults = await this.findEnclosingFunctions(filePath, [...linesSet]);
          for (const [line, result] of fileResults) {
            // 使用 filePath:line 作為唯一鍵
            results.set(`${filePath}:${line}`, result);
          }
        } catch (error) {
          // 個別檔案處理失敗不影響其他檔案，記錄偵錯資訊
          logger.verbose('call-hierarchy', `findEnclosingFunctionsMultiFile failed for ${filePath}: ${error}`);
        }
      })
    );

    return results;
  }

  /**
   * 使用 Babel AST 批次找出多個行號所在的外層函數（JS 檔案）
   */
  private findEnclosingFunctionsFromBabel(
    babelAst: import('@babel/parser').ParseResult<babel.File>,
    _sourceCode: string,
    queryLines: readonly number[],
    filePath: string
  ): Map<number, { name: string; file: string }> {
    const results = new Map<number, { name: string; file: string }>();

    if (queryLines.length === 0) {
      return results;
    }

    // 單次遍歷收集所有函數範圍
    type FuncRange = { name: string; startLine: number; endLine: number };
    const funcRanges: FuncRange[] = [];

    traverse(babelAst, {
      FunctionDeclaration(path) {
        const loc = path.node.loc;
        if (!loc || !path.node.id) { return; }
        funcRanges.push({ name: path.node.id.name, startLine: loc.start.line, endLine: loc.end.line });
      },
      ArrowFunctionExpression(path) {
        const loc = path.node.loc;
        if (!loc) { return; }
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id)) {
          funcRanges.push({ name: parent.id.name, startLine: loc.start.line, endLine: loc.end.line });
        }
      },
      FunctionExpression(path) {
        const loc = path.node.loc;
        if (!loc) { return; }
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id)) {
          funcRanges.push({ name: parent.id.name, startLine: loc.start.line, endLine: loc.end.line });
        }
      },
      ObjectMethod(path) {
        const loc = path.node.loc;
        if (!loc || !babel.isIdentifier(path.node.key)) { return; }
        funcRanges.push({ name: path.node.key.name, startLine: loc.start.line, endLine: loc.end.line });
      },
      ClassMethod(path) {
        const loc = path.node.loc;
        if (!loc || !babel.isIdentifier(path.node.key)) { return; }
        funcRanges.push({ name: path.node.key.name, startLine: loc.start.line, endLine: loc.end.line });
      },
    });

    // 對每個查詢行找最小的 enclosing function
    for (const queryLine of new Set(queryLines)) {
      let enclosingName: string | null = null;
      let smallestRange = Infinity;

      for (const { name, startLine, endLine } of funcRanges) {
        if (queryLine >= startLine && queryLine <= endLine) {
          const range = endLine - startLine;
          if (range < smallestRange) {
            smallestRange = range;
            enclosingName = name;
          }
        }
      }

      if (enclosingName) {
        results.set(queryLine, { name: enclosingName, file: filePath });
      }
    }

    return results;
  }

  /**
   * 在 AST 中找出指定 position 的 enclosing function 名稱
   */
  private findEnclosingFunctionAtPosition(
    sourceFile: ts.SourceFile,
    position: number
  ): string | null {
    let enclosingFunction: string | null = null;

    const visit = (node: ts.Node): void => {
      if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
        // FunctionDeclaration
        if (ts.isFunctionDeclaration(node) && node.name) {
          enclosingFunction = node.name.text;
        }
        // MethodDeclaration
        else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
          enclosingFunction = node.name.text;
        }
        // Arrow function 或 function expression 賦值給變數
        else if (ts.isVariableDeclaration(node)
                 && ts.isIdentifier(node.name)
                 && node.initializer
                 && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
          enclosingFunction = node.name.text;
        }

        ts.forEachChild(node, visit);
      }
    };

    visit(sourceFile);
    return enclosingFunction;
  }

  /**
   * 批次取得多個檔案中多個行號的程式碼內容
   * 按檔案分組後批次處理，避免重複讀取同一檔案
   */
  private async getLineContextsBatch(
    queries: readonly { filePath: string; line: number }[]
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    if (queries.length === 0) {
      return results;
    }

    // 按檔案分組（使用 Set 避免重複行號）
    const fileGroups = new Map<string, Set<number>>();
    for (const query of queries) {
      const existing = fileGroups.get(query.filePath);
      if (existing) {
        existing.add(query.line);
      } else {
        fileGroups.set(query.filePath, new Set([query.line]));
      }
    }

    // 批次處理每個檔案
    await Promise.all(
      Array.from(fileGroups.entries()).map(async ([filePath, linesSet]) => {
        try {
          const content = await this.fileUtils.readFile(filePath);
          if (!content) {
            return;
          }

          const contentLines = content.split('\n');
          const lineCount = contentLines.length;
          for (const line of linesSet) {
            // 跳過超出範圍的行號
            if (line < 1 || line > lineCount) {
              continue;
            }
            const lineContent = contentLines[line - 1]?.trim() || '';
            results.set(`${filePath}:${line}`, lineContent);
          }
        } catch (error) {
          // 個別檔案處理失敗不影響其他檔案，記錄偵錯資訊
          logger.verbose('call-hierarchy', `getLineContextsBatch failed for ${filePath}: ${error}`);
        }
      })
    );

    return results;
  }
}

/**
 * 建立 CallHierarchyAnalyzer 實例
 */
export function createCallHierarchyAnalyzer(
  parserRegistry: ParserRegistry,
  fileSystem: IFileSystem
): CallHierarchyAnalyzer {
  return new CallHierarchyAnalyzer(parserRegistry, fileSystem);
}
