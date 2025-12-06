/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫層次關係（incoming/outgoing）
 */

import * as ts from 'typescript';
import type { Location, Range } from '@shared/types/core.js';
import type { Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { createSymbolFinder, type SymbolFinder } from './symbol-finder.js';

/** Outgoing 呼叫資訊（目標函數呼叫了誰） */
export interface OutgoingCall {
  readonly callee: string;
  readonly location: Location;
  readonly context: string;
  readonly isMethodCall: boolean;
  readonly receiver?: string;
}

/** Incoming 呼叫資訊（誰呼叫了目標函數） */
export interface IncomingCall {
  readonly caller: string;
  readonly location: Location;
  readonly context: string;
  readonly callerDefinitionFile?: string;
}

/** 呼叫層次分析選項 */
export interface CallHierarchyOptions {
  readonly direction: 'incoming' | 'outgoing' | 'both';
  readonly depth: number;
  readonly maxResults?: number;
}

/** 呼叫層次分析結果 */
export interface CallHierarchyData {
  readonly functionName: string;
  readonly definitionFile: string;
  readonly definitionLine: number;
  readonly incoming: IncomingCall[];
  readonly outgoing: OutgoingCall[];
}

/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫者（incoming）和被呼叫者（outgoing）
 */
export class CallHierarchyAnalyzer {
  private readonly symbolFinder: SymbolFinder;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
  ) {
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
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
        options.depth
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
  ): Promise<{ location: Location } | null> {
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
   */
  private async findIncomingCalls(
    functionName: string,
    projectFiles: readonly string[],
    definitionFile: string,
    depth: number
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

      const callSites = await this.symbolFinder.findCallSites(targetName, projectFiles);

      for (const callSite of callSites) {
        // 排除定義檔案中的自身呼叫（如果是遞迴）
        if (callSite.location.filePath === definitionFile
            && callSite.functionName === targetName) {
          continue;
        }

        // 找出呼叫點所在的函數
        const callerInfo = await this.findEnclosingFunction(
          callSite.location.filePath,
          callSite.location.range.start.line
        );

        const context = await this.getLineContext(
          callSite.location.filePath,
          callSite.location.range.start.line
        );

        incoming.push({
          caller: callerInfo?.name || '<anonymous>',
          location: callSite.location,
          context,
          callerDefinitionFile: callerInfo?.file
        });

        // 遞迴查找（如果深度允許）
        if (currentDepth < depth && callerInfo?.name && callerInfo.name !== '<anonymous>') {
          await findCallsRecursive(callerInfo.name, currentDepth + 1);
        }
      }
    };

    await findCallsRecursive(functionName, 1);
    return incoming;
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

    const content = await this.readFile(filePath);
    if (!content) {
      return outgoing;
    }

    const parser = this.parserRegistry.getParser(this.getExtension(filePath));
    if (!parser) {
      return outgoing;
    }

    try {
      const ast = await parser.parse(content, filePath);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceFile = (ast as any).tsSourceFile as ts.SourceFile | undefined;

      if (!sourceFile) {
        return outgoing;
      }

      // 找到目標函數的 AST 節點
      const functionNode = this.findFunctionNode(sourceFile, functionName, functionRange);
      if (!functionNode || !functionNode.body) {
        return outgoing;
      }

      // 遍歷函數 body 找出所有 CallExpression
      const findCallsInNode = (node: ts.Node): void => {
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
                    start: { line: callInfo.line, column: callInfo.column, offset: undefined },
                    end: { line: callInfo.line, column: callInfo.column + callInfo.callee.length, offset: undefined }
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
    } catch {
      // Parser 失敗，返回空結果
    }

    return outgoing;
  }

  /**
   * 在 AST 中找到目標函數節點
   * @param range 預留參數：未來可用於精確定位同名函數
   */
  private findFunctionNode(
    sourceFile: ts.SourceFile,
    functionName: string,
    _range: Range // Reserved: 未來可用於區分同名但不同位置的函數
  ): ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | null {
    let result: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression | null = null;

    const visit = (node: ts.Node): void => {
      if (result) {return;}

      // FunctionDeclaration
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        result = node;
        return;
      }

      // MethodDeclaration
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        result = node;
        return;
      }

      // Arrow function 或 function expression 賦值給變數
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (node.name.text === functionName && node.initializer) {
          if (ts.isArrowFunction(node.initializer)) {
            result = node.initializer;
            return;
          }
          if (ts.isFunctionExpression(node.initializer)) {
            result = node.initializer;
            return;
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return result;
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
   * 找出某行所在的外層函數
   */
  private async findEnclosingFunction(
    filePath: string,
    line: number
  ): Promise<{ name: string; file: string } | null> {
    const content = await this.readFile(filePath);
    if (!content) {return null;}

    const parser = this.parserRegistry.getParser(this.getExtension(filePath));
    if (!parser) {return null;}

    try {
      const ast = await parser.parse(content, filePath);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceFile = (ast as any).tsSourceFile as ts.SourceFile | undefined;

      if (!sourceFile) {return null;}

      const position = sourceFile.getPositionOfLineAndCharacter(line - 1, 0);
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

      return enclosingFunction ? { name: enclosingFunction, file: filePath } : null;
    } catch {
      return null;
    }
  }

  /**
   * 取得某行的程式碼內容
   */
  private async getLineContext(filePath: string, line: number): Promise<string> {
    const content = await this.readFile(filePath);
    if (!content) {return '';}
    const lines = content.split('\n');
    return lines[line - 1]?.trim() || '';
  }

  /**
   * 讀取檔案內容
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch {
      return null;
    }
  }

  /**
   * 取得檔案副檔名
   */
  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
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
