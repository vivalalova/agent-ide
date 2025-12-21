/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫層次關係（incoming/outgoing）
 */

import * as ts from 'typescript';
import type { Location, Range } from '@shared/types/core.js';
import type { Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { createSymbolFinder, type SymbolFinder } from '@core/shared/symbol-finder.js';

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
   * 使用批次處理優化：按檔案分組，避免重複讀取/解析同一檔案
   *
   * 重要：遞迴分析時使用 filePath:functionName 作為唯一識別，
   * 確保只追蹤真正呼叫目標函數的 caller，不會混淆同名的內建方法（如 Map.get()）
   */
  private async findIncomingCalls(
    functionName: string,
    projectFiles: readonly string[],
    definitionFile: string,
    depth: number
  ): Promise<IncomingCall[]> {
    const incoming: IncomingCall[] = [];
    // 使用 filePath:functionName 作為已訪問的唯一識別
    const visited = new Set<string>();

    /**
     * 遞迴查找呼叫者
     * @param targetName 目標函數名稱
     * @param targetFile 目標函數定義檔案（用於精確識別）
     * @param currentDepth 當前遞迴深度
     */
    const findCallsRecursive = async (
      targetName: string,
      targetFile: string,
      currentDepth: number
    ): Promise<void> => {
      // 使用 filePath:functionName 作為唯一識別，避免同名函數混淆
      const targetKey = `${targetFile}:${targetName}`;
      if (currentDepth > depth || visited.has(targetKey)) {
        return;
      }
      visited.add(targetKey);

      const callSites = await this.symbolFinder.findCallSites(targetName, projectFiles);

      // 過濾掉遞迴自身呼叫
      const filteredCallSites = callSites.filter(
        callSite => !(callSite.location.filePath === targetFile
                      && callSite.functionName === targetName)
      );

      if (filteredCallSites.length === 0) {
        return;
      }

      // 批次查詢所有 callSites 的 enclosing functions（按檔案分組處理）
      const queries = filteredCallSites.map(callSite => ({
        filePath: callSite.location.filePath,
        line: callSite.location.range.start.line
      }));
      const enclosingFunctions = await this.findEnclosingFunctionsMultiFile(queries);

      // 批次取得所有 context（按檔案分組處理）
      const contexts = await this.getLineContextsBatch(queries);

      // 建立 incoming 結果
      // 使用 filePath:functionName 作為唯一鍵，避免同名但不同檔案的函數被去重
      const callersToRecurse = new Map<string, { name: string; file: string }>();

      for (const callSite of filteredCallSites) {
        const key = `${callSite.location.filePath}:${callSite.location.range.start.line}`;
        const callerInfo = enclosingFunctions.get(key);
        const context = contexts.get(key) || '';

        // 深度 > 1 時，需要驗證這個呼叫是否真的呼叫目標函數
        // 如果是方法呼叫（receiver.method()），需要檢查 receiver 是否對應到目標函數的定義
        if (currentDepth > 1 && callSite.isMethodCall) {
          // 檢查是否為內建物件方法（Map, Set, Array 等）
          // 這些方法不應該被當作使用者定義函數的 caller
          const receiver = callSite.receiver || '';
          if (this.isBuiltInObjectMethod(receiver, targetName)) {
            continue;
          }

          // 進一步驗證：檢查 receiver 是否來自目標函數的定義檔案
          // 如果 receiver 是 this.xxx，需要檢查是否對應到 targetFile 中的定義
          if (!this.isCallToTargetFunction(callSite, targetFile, targetName)) {
            continue;
          }
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
      // 使用 caller 的定義檔案作為下一層的 targetFile
      for (const caller of callersToRecurse.values()) {
        await findCallsRecursive(caller.name, caller.file, currentDepth + 1);
      }
    };

    await findCallsRecursive(functionName, definitionFile, 1);
    return incoming;
  }

  /**
   * 檢查 receiver.method() 是否為內建物件的方法
   * 用於排除 Map.get()、Array.push() 等內建方法
   */
  private isBuiltInObjectMethod(receiver: string, methodName: string): boolean {
    // 內建物件及其常見方法
    const builtInMethods: Record<string, Set<string>> = {
      // Map methods
      'Map': new Set(['get', 'set', 'has', 'delete', 'clear', 'forEach', 'keys', 'values', 'entries']),
      // Set methods
      'Set': new Set(['add', 'has', 'delete', 'clear', 'forEach', 'keys', 'values', 'entries']),
      // Array methods
      'Array': new Set(['push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'concat', 'join',
        'indexOf', 'lastIndexOf', 'includes', 'find', 'findIndex', 'filter', 'map', 'reduce',
        'reduceRight', 'forEach', 'some', 'every', 'sort', 'reverse', 'fill', 'copyWithin', 'flat', 'flatMap']),
      // Object methods
      'Object': new Set(['keys', 'values', 'entries', 'assign', 'freeze', 'seal', 'create',
        'defineProperty', 'defineProperties', 'getOwnPropertyNames', 'getOwnPropertySymbols',
        'getPrototypeOf', 'setPrototypeOf', 'is', 'fromEntries']),
      // String methods
      'String': new Set(['charAt', 'charCodeAt', 'concat', 'includes', 'endsWith', 'indexOf',
        'lastIndexOf', 'match', 'replace', 'search', 'slice', 'split', 'startsWith', 'substring',
        'toLowerCase', 'toUpperCase', 'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd', 'repeat']),
      // Promise methods
      'Promise': new Set(['then', 'catch', 'finally', 'all', 'race', 'allSettled', 'any', 'resolve', 'reject']),
      // JSON methods
      'JSON': new Set(['parse', 'stringify']),
      // Math methods
      'Math': new Set(['abs', 'ceil', 'floor', 'round', 'max', 'min', 'pow', 'sqrt', 'random',
        'sin', 'cos', 'tan', 'log', 'exp']),
      // Console methods
      'console': new Set(['log', 'error', 'warn', 'info', 'debug', 'trace', 'dir', 'table', 'time', 'timeEnd'])
    };

    // 檢查 receiver 是否為實例變數（this.xxx）且方法名是內建方法
    // 例如：this.sessions.get() 中的 sessions 可能是 Map
    if (receiver.startsWith('this.')) {
      const instanceName = receiver.substring(5);
      // 常見的 Map/Set 實例命名模式
      const mapInstancePatterns = ['sessions', 'users', 'cache', 'store', 'map', 'maps',
        'notifications', 'orders', 'products', 'transactions', 'items', 'data'];
      const setInstancePatterns = ['set', 'sets', 'visited', 'seen', 'ids'];

      if (mapInstancePatterns.some(p => instanceName.toLowerCase().includes(p))
          && builtInMethods['Map']?.has(methodName)) {
        return true;
      }
      if (setInstancePatterns.some(p => instanceName.toLowerCase().includes(p))
          && builtInMethods['Set']?.has(methodName)) {
        return true;
      }
    }

    // 檢查直接使用內建物件的情況（如 Map.prototype.get）
    for (const [objectName, methods] of Object.entries(builtInMethods)) {
      if (receiver.includes(objectName) && methods.has(methodName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 檢查呼叫是否真的呼叫目標函數
   * 用於 depth > 1 時的精確過濾
   */
  private isCallToTargetFunction(
    callSite: { isMethodCall: boolean; receiver?: string; location: { filePath: string } },
    targetFile: string,
    _targetName: string
  ): boolean {
    // 如果是同一檔案內的呼叫，更可能是真正的呼叫
    if (callSite.location.filePath === targetFile) {
      return true;
    }

    // 如果是 this.method() 呼叫，需要檢查當前檔案是否 import 了 targetFile
    // 這裡簡化處理：假設跨檔案的方法呼叫如果 receiver 是 this.xxxService，
    // 則可能是通過依賴注入呼叫的合法呼叫
    if (callSite.receiver?.startsWith('this.') && callSite.receiver.includes('Service')) {
      return true;
    }

    // 如果 receiver 不是 this.xxx，可能是直接呼叫或其他模式
    // 這種情況下，需要更多上下文才能判斷，暫時假設為有效呼叫
    if (!callSite.receiver?.startsWith('this.')) {
      return true;
    }

    // 預設保守策略：不確定時排除，避免誤報
    // 這裡檢查 receiver 是否看起來像是內建物件的實例
    const receiver = callSite.receiver;
    const lowerReceiver = receiver.toLowerCase();

    // 如果 receiver 看起來像是集合類型的實例，可能是內建方法
    const collectionPatterns = ['map', 'set', 'list', 'array', 'cache', 'store'];
    if (collectionPatterns.some(p => lowerReceiver.includes(p))) {
      return false;
    }

    return true;
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

    const content = await this.readFile(filePath);
    if (!content) {
      return results;
    }

    const parser = this.parserRegistry.getParser(this.getExtension(filePath));
    if (!parser) {
      return results;
    }

    try {
      const ast = await parser.parse(content, filePath);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sourceFile = (ast as any).tsSourceFile as ts.SourceFile | undefined;

      if (!sourceFile) {
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
    } catch {
      // Parser 失敗，返回空結果
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
          console.debug(`[CallHierarchyAnalyzer] findEnclosingFunctionsMultiFile failed for ${filePath}:`, error);
        }
      })
    );

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
          const content = await this.readFile(filePath);
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
          console.debug(`[CallHierarchyAnalyzer] getLineContextsBatch failed for ${filePath}:`, error);
        }
      })
    );

    return results;
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
