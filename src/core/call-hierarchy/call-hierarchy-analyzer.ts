/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫層次關係（incoming/outgoing）
 */

import * as ts from 'typescript';
import * as path from 'path';
import * as babel from '@babel/types';
import babelTraverse from '@babel/traverse';
import type { Location, Range } from '@shared/types/core.js';
import type { Symbol } from '@shared/types/symbol.js';
import { isImportedSymbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { getTypeScriptSourceFile, hasBabelAST } from '@infrastructure/parser/index.js';
import { createSymbolFinder, type CallSite, type SymbolFinder } from '@core/foundations/symbol-finder/index.js';
import { createFileUtils, FileUtils } from '@core/foundations/index.js';
import { loadTsconfigPathConfig } from '@plugins/typescript/tsconfig-loader.js';
import { resolveBarePathAliasAsync } from '@shared/path-alias-resolver.js';
import { getImportResolutionExtensions, hasRuntimeImportExtensionCandidates } from '@shared/types/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { logger } from '@infrastructure/logging/index.js';
import type {
  CallHierarchyData,
  CallHierarchyOptions,
  IncomingCall,
  OutgoingCall,
} from './types.js';

const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

interface FunctionDefinition {
  readonly location: { filePath: string; range: Range };
}

interface ImportedBinding {
  readonly importedName: string;
  readonly moduleSpecifier: string;
}

interface ResolvedCalleeDefinition extends FunctionDefinition {
  readonly functionName: string;
}

/**
 * findTypeScriptImportedBinding / findBabelImportedBinding 與其 shadow 檢查共用的最小輸入
 * 形狀：outgoing 分析的 OutgoingCall、incoming 錨定用的 CallSite 皆可結構相容傳入，
 * 避免為 incoming 另建一份重複的 import 解析邏輯（Single Source of Truth）。
 */
interface CallBindingQuery {
  readonly callee: string;
  readonly location: Location;
  readonly isMethodCall: boolean;
  readonly receiver?: string;
}

type BabelParseResult = import('@babel/parser').ParseResult<babel.File>;

/**
 * Call Hierarchy Analyzer
 * 分析函數的呼叫者（incoming）和被呼叫者（outgoing）
 */
export class CallHierarchyAnalyzer {
  private readonly symbolFinder: SymbolFinder;
  private readonly fileUtils: FileUtils;

  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileSystem: IFileSystem
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
        options.depth,
        projectFiles
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
  ): Promise<FunctionDefinition | null> {
    // function 型別優先；variable/constant（arrow/function expression 賦值）僅在
    // 全專案找不到 function 定義時才 fallback，避免同名非函數變數搶走定義
    let fallback: FunctionDefinition | null = null;
    for (const filePath of projectFiles) {
      const definition = await this.symbolFinder.findDefinition(filePath, functionName);
      if (!definition || !this.isFunctionSymbol(definition.symbol)) {
        continue;
      }
      if (definition.symbol.type === 'function') {
        return { location: definition.symbol.location };
      }
      fallback ??= { location: definition.symbol.location };
    }
    return fallback;
  }

  /**
   * 檢查是否為函數類型的符號
   */
  private isFunctionSymbol(symbol: Symbol): boolean {
    // CLI 端將 variable/constant 中的 arrow/function expression 也視為可呼叫符號。
    return symbol.type === 'function' || symbol.type === 'variable' || symbol.type === 'constant';
  }

  /**
   * 檢查某檔案是否有目標名稱的「真正本地宣告」（非單純 import binding）。
   * 用於 incoming 錨定：JS parser 對 import specifier 也會產生 type: variable 的 Symbol
   * （見 isImportedSymbol 註解），若不排除會誤把「只是 import 了同名符號」的檔案當成
   * 有自己的本地定義，進而誤排除真正指向本次目標定義的呼叫者。
   */
  private async hasGenuineLocalDefinition(filePath: string, name: string): Promise<boolean> {
    const definition = await this.symbolFinder.findDefinition(filePath, name);
    return definition !== null
      && this.isFunctionSymbol(definition.symbol)
      && !isImportedSymbol(definition.symbol);
  }

  /**
   * 解析檔案的 AST（TypeScript SourceFile 或 Babel AST），供 import binding 解析共用。
   */
  private async parseFileForBindingResolution(
    filePath: string
  ): Promise<{ sourceFile?: ts.SourceFile; babelAst?: BabelParseResult } | null> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return null;
    }

    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser) {
      return null;
    }

    try {
      const ast = await parser.parse(content, filePath);
      const sourceFile = getTypeScriptSourceFile(ast);
      if (sourceFile) {
        return { sourceFile };
      }
      if (hasBabelAST(ast)) {
        return { babelAst: ast.babelAST };
      }
      return null;
    } catch (error) {
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 判斷跨檔案的 incoming callSite 是否真的指向 targetDefinitionFile 這個具體定義。
   * 與 outgoing 遞迴展開共用同一套 import binding 解析（findTypeScriptImportedBinding /
   * findBabelImportedBinding + resolveProjectImportPath），positive 驗證 callSite 的識別符
   * 實際 import 自哪個檔案，而非只憑名稱文字相符就採信（同名但無關的另一個定義會被排除）。
   */
  private async isCallSiteAnchoredToDefinition(
    callSite: CallSite,
    targetName: string,
    targetDefinitionFile: string,
    projectFiles: readonly string[],
    fileAstCache: Map<string, { sourceFile?: ts.SourceFile; babelAst?: BabelParseResult } | null>
  ): Promise<boolean> {
    const callSiteFile = callSite.location.filePath;

    let parsed = fileAstCache.get(callSiteFile);
    if (parsed === undefined) {
      parsed = await this.parseFileForBindingResolution(callSiteFile);
      fileAstCache.set(callSiteFile, parsed);
    }

    if (parsed) {
      const query: CallBindingQuery = {
        callee: targetName,
        location: callSite.location,
        isMethodCall: callSite.isMethodCall,
        receiver: callSite.receiver
      };

      try {
        const importedBinding = parsed.sourceFile
          ? this.findTypeScriptImportedBinding(parsed.sourceFile, query)
          : parsed.babelAst
            ? this.findBabelImportedBinding(parsed.babelAst, query)
            : null;

        if (importedBinding) {
          // 有明確的 import binding：唯有解析到本次目標定義檔才算真正 caller；
          // 解析到別的檔案或完全解析不到（如外部套件、無法解析的 alias）都代表這個
          // 識別符另有所指，非本次目標定義，直接排除，不落回下方的本地宣告 fallback。
          const resolvedFile = await this.resolveProjectImportPath(
            importedBinding.moduleSpecifier,
            callSiteFile,
            projectFiles
          );
          return resolvedFile === targetDefinitionFile;
        }
      } catch (error) {
        // AST 節點形狀不符（如測試替身回傳的假 AST）時退回下方的本地宣告 fallback，
        // 與檔案同層其他 AST 解析錯誤處理一致，不讓單一異常 AST 中斷整體 incoming 分析。
        diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `Import binding resolution failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // 無可判定的 import binding（無 import 宣告，或被同名區域宣告在該呼叫點遮蔽）：
    // fallback 為「該檔案是否有自己的真正本地宣告」——有代表呼叫自己的版本（排除），
    // 沒有則保守視為可能指向本次目標（維持既有行為，避免誤刪未覆蓋到的合法情境）。
    return !(await this.hasGenuineLocalDefinition(callSiteFile, targetName));
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
    const anchorDecisionCache = new Map<string, boolean>();
    const fileAstCache = new Map<string, { sourceFile?: ts.SourceFile; babelAst?: BabelParseResult } | null>();

    const findCallsRecursive = async (
      targetName: string,
      currentDepth: number,
      targetDefinitionFile: string
    ): Promise<void> => {
      const targetKey = `${targetDefinitionFile}:${targetName}`;
      if (currentDepth > depth || visited.has(targetKey)) {
        return;
      }
      visited.add(targetKey);

      let callSites = await this.symbolFinder.findCallSites(targetName, projectFiles);

      // depth 1 且帶有 `--at` 衍生的 targetCallSiteFilter 時，呼叫端已透過該 filter
      // 精確判定 callSite 是否指向本次鎖定的定義，不需再套用下方以檔案為單位的錨定捷徑。
      // 其餘情況（depth 1 無 `--at`，或任何遞迴層）都必須以 targetDefinitionFile 錨定，
      // 否則會把「另一檔案裡同名但無關的本地定義」誤判為本次目標的 caller。
      if (currentDepth === 1 && targetCallSiteFilter) {
        callSites = await this.filterCallSites(callSites, targetCallSiteFilter);
      } else {
        const anchoredCallSites: CallSite[] = [];
        for (const callSite of callSites) {
          const callSiteFile = callSite.location.filePath;
          if (callSiteFile === targetDefinitionFile) {
            anchoredCallSites.push(callSite);
            continue;
          }

          // 跨檔案呼叫點：positive 驗證其 import binding 是否實際解析到 targetDefinitionFile
          // （見 isCallSiteAnchoredToDefinition），而非只憑名稱文字相符就採信。
          const cacheKey = `${callSiteFile}:${targetName}:${targetDefinitionFile}`;
          let isAnchored = anchorDecisionCache.get(cacheKey);
          if (isAnchored === undefined) {
            isAnchored = await this.isCallSiteAnchoredToDefinition(
              callSite,
              targetName,
              targetDefinitionFile,
              projectFiles,
              fileAstCache
            );
            anchorDecisionCache.set(cacheKey, isAnchored);
          }

          if (isAnchored) {
            anchoredCallSites.push(callSite);
          }
        }
        callSites = anchoredCallSites;
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
        if (callSite.location.filePath === targetDefinitionFile && callerInfo?.name === targetName) {
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
        await findCallsRecursive(caller.name, currentDepth + 1, caller.file);
      }
    };

    await findCallsRecursive(functionName, 1, definitionFile);
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
   * @param depth 遞迴深度
   */
  private async findOutgoingCalls(
    filePath: string,
    functionName: string,
    functionRange: Range,
    depth: number,
    projectFiles: readonly string[],
    visitedDefinitions: Set<string> = new Set(),
    visitedCallSites: Set<string> = new Set()
  ): Promise<OutgoingCall[]> {
    const outgoing: OutgoingCall[] = [];
    const definitionKey = `${filePath}:${functionName}`;
    if (visitedDefinitions.has(definitionKey)) {
      return outgoing;
    }
    visitedDefinitions.add(definitionKey);

    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return outgoing;
    }

    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    if (!parser) {
      return outgoing;
    }

    let typeScriptSourceFile: ts.SourceFile | undefined;
    let babelAst: BabelParseResult | undefined;

    try {
      const ast = await parser.parse(content, filePath);
      const sourceFile = getTypeScriptSourceFile(ast);
      typeScriptSourceFile = sourceFile ?? undefined;

      if (!sourceFile) {
        if (hasBabelAST(ast)) {
          babelAst = ast.babelAST;
          outgoing.push(...this.findOutgoingCallsFromBabel(
            ast.babelAST,
            ast.sourceCode,
            functionName,
            filePath,
            functionRange,
            visitedCallSites
          ));
        }
      } else {
        // 找到目標函數的 AST 節點
        const functionNode = this.findFunctionNode(sourceFile, functionName, functionRange);
        if (!functionNode || !functionNode.body) {
          return outgoing;
        }

        // 巢狀的可獨立定址函數/類別節點是邊界，其內部呼叫歸屬該節點自身，不遞迴進去。
        // 賦值給變數的 arrow function / function expression 視同具名函數（可被單獨定址、
        // 遞迴展開時會走 findFunctionDefinition 另行解析），故也是邊界；但直接內嵌於呼叫
        // 參數位置的匿名 callback（未賦值給變數，如 IIFE 或 `arr.map(x => ...)`）維持非邊界，
        // 讓其內部呼叫仍歸屬外層函數（外層本體確實同步執行/傳遞了該 callback）。
        const isVariableAssignedFunctionLike = (node: ts.Node): boolean =>
          (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
          node.parent !== undefined &&
          ts.isVariableDeclaration(node.parent) &&
          node.parent.initializer === node;

        const isNestedDefinitionBoundary = (node: ts.Node): boolean =>
          ts.isFunctionDeclaration(node) ||
          (ts.isFunctionExpression(node) && node.name !== undefined) ||
          isVariableAssignedFunctionLike(node) ||
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
              const key = `${filePath}:${callInfo.callee}:${callInfo.line}:${callInfo.column}`;
              if (!visitedCallSites.has(key)) {
                visitedCallSites.add(key);

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
      }
    } catch (error) {
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (depth > 1) {
      const directCalls = [...outgoing];
      for (const call of directCalls) {
        const calleeDefinition = await this.findCalleeDefinition(
          call,
          filePath,
          projectFiles,
          typeScriptSourceFile,
          babelAst
        );
        if (!calleeDefinition) {
          continue;
        }

        const deeperCalls = await this.findOutgoingCalls(
          calleeDefinition.location.filePath,
          calleeDefinition.functionName,
          calleeDefinition.location.range,
          depth - 1,
          projectFiles,
          visitedDefinitions,
          visitedCallSites
        );
        outgoing.push(...deeperCalls);
      }
    }

    return outgoing;
  }

  /**
   * 解析遞迴展開的 callee。跨檔案時只接受 caller 的 import binding；
   * 沒有可確定的 import 或同檔宣告時直接不展開，避免全專案同名函式誤綁。
   */
  private async findCalleeDefinition(
    call: OutgoingCall,
    callerFile: string,
    projectFiles: readonly string[],
    sourceFile?: ts.SourceFile,
    babelAst?: BabelParseResult
  ): Promise<ResolvedCalleeDefinition | null> {
    const importedBinding = sourceFile
      ? this.findTypeScriptImportedBinding(sourceFile, call)
      : babelAst
        ? this.findBabelImportedBinding(babelAst, call)
        : null;

    if (importedBinding) {
      const importedFile = await this.resolveProjectImportPath(
        importedBinding.moduleSpecifier,
        callerFile,
        projectFiles
      );
      if (!importedFile) {
        return null;
      }

      const definition = await this.findFunctionDefinition(importedBinding.importedName, [importedFile]);
      return definition
        ? { ...definition, functionName: importedBinding.importedName }
        : null;
    }

    // 方法呼叫若不是 namespace import，缺少 receiver 型別時無法安全判定其宣告。
    if (call.isMethodCall) {
      return null;
    }

    const definition = await this.findFunctionDefinition(call.callee, [callerFile]);
    return definition ? { ...definition, functionName: call.callee } : null;
  }

  private findTypeScriptImportedBinding(
    sourceFile: ts.SourceFile,
    call: CallBindingQuery
  ): ImportedBinding | null {
    const bindingName = call.isMethodCall ? call.receiver : call.callee;
    if (bindingName && this.isLexicallyShadowedAtCallSite(sourceFile, call, bindingName)) {
      return null;
    }

    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const importClause = statement.importClause;
      if (!importClause || importClause.isTypeOnly) {
        continue;
      }

      if (importClause.name?.text === call.callee) {
        return {
          importedName: call.callee,
          moduleSpecifier: statement.moduleSpecifier.text
        };
      }

      const namedBindings = importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        const element = namedBindings.elements.find(
          candidate => !candidate.isTypeOnly && candidate.name.text === call.callee
        );
        if (element) {
          return {
            importedName: element.propertyName?.text ?? element.name.text,
            moduleSpecifier: statement.moduleSpecifier.text
          };
        }
      }

      if (
        call.isMethodCall
        && namedBindings
        && ts.isNamespaceImport(namedBindings)
        && namedBindings.name.text === call.receiver
      ) {
        return {
          importedName: call.callee,
          moduleSpecifier: statement.moduleSpecifier.text
        };
      }
    }

    return null;
  }

  private isLexicallyShadowedAtCallSite(
    sourceFile: ts.SourceFile,
    call: CallBindingQuery,
    bindingName: string
  ): boolean {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(bindingName)) {
      return false;
    }

    const { line, column } = call.location.range.start;
    const lineStarts = sourceFile.getLineStarts();
    if (line < 1 || line > lineStarts.length) {
      return false;
    }
    const lineStart = lineStarts[line - 1];
    const lineEnd = line < lineStarts.length ? lineStarts[line] : sourceFile.end;
    const position = Math.min(lineStart + Math.max(0, column - 1), lineEnd);
    const ancestors: ts.Node[] = [];

    const collectAncestors = (node: ts.Node): void => {
      if (position < node.pos || position >= node.end) {
        return;
      }
      ancestors.push(node);
      ts.forEachChild(node, collectAncestors);
    };
    collectAncestors(sourceFile);

    for (const ancestor of ancestors) {
      if (ts.isSourceFile(ancestor) || ts.isBlock(ancestor) || ts.isModuleBlock(ancestor)) {
        if (ancestor.statements.some(statement => this.declarationBindsName(statement, bindingName))) {
          return true;
        }
      }

      if (ts.isFunctionLike(ancestor)) {
        if (ancestor.parameters.some(parameter => this.bindingNameMatches(parameter.name, bindingName))) {
          return true;
        }
        if (ancestor.name && ts.isIdentifier(ancestor.name) && ancestor.name.text === bindingName) {
          return true;
        }
      }

      if (ts.isCatchClause(ancestor) && ancestor.variableDeclaration
        && this.bindingNameMatches(ancestor.variableDeclaration.name, bindingName)) {
        return true;
      }
    }

    return false;
  }

  private declarationBindsName(statement: ts.Statement, bindingName: string): boolean {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration =>
        this.bindingNameMatches(declaration.name, bindingName)
      );
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      return statement.name.text === bindingName;
    }
    return false;
  }

  private bindingNameMatches(name: ts.BindingName, bindingName: string): boolean {
    if (ts.isIdentifier(name)) {
      return name.text === bindingName;
    }
    return name.elements.some(element =>
      ts.isBindingElement(element) && this.bindingNameMatches(element.name, bindingName)
    );
  }

  private findBabelImportedBinding(
    babelAst: BabelParseResult,
    call: CallBindingQuery
  ): ImportedBinding | null {
    if (this.isBabelLexicallyShadowedAtCallSite(babelAst, call)) {
      return null;
    }

    for (const statement of babelAst.program.body) {
      if (!babel.isImportDeclaration(statement)) {
        continue;
      }

      for (const specifier of statement.specifiers) {
        if (babel.isImportDefaultSpecifier(specifier) && specifier.local.name === call.callee) {
          return {
            importedName: call.callee,
            moduleSpecifier: statement.source.value
          };
        }

        if (babel.isImportSpecifier(specifier) && specifier.local.name === call.callee) {
          return {
            importedName: babel.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value,
            moduleSpecifier: statement.source.value
          };
        }

        if (
          call.isMethodCall
          && babel.isImportNamespaceSpecifier(specifier)
          && specifier.local.name === call.receiver
        ) {
          return {
            importedName: call.callee,
            moduleSpecifier: statement.source.value
          };
        }
      }
    }

    return null;
  }

  private isBabelLexicallyShadowedAtCallSite(
    babelAst: BabelParseResult,
    call: CallBindingQuery
  ): boolean {
    const bindingName = call.isMethodCall ? call.receiver : call.callee;
    if (!bindingName) {
      return false;
    }

    const { line, column } = call.location.range.start;
    let shadowed = false;
    traverse(babelAst, {
      CallExpression: callPath => {
        const loc = callPath.node.loc;
        if (!loc || loc.start.line !== line || loc.start.column + 1 !== column) {
          return;
        }

        const binding = callPath.scope.getBinding(bindingName);
        if (binding) {
          shadowed = !binding.path.isImportDefaultSpecifier()
            && !binding.path.isImportNamespaceSpecifier()
            && !binding.path.isImportSpecifier();
        }
        callPath.stop();
      }
    });

    return shadowed;
  }

  private async resolveProjectImportPath(
    moduleSpecifier: string,
    fromFile: string,
    projectFiles: readonly string[]
  ): Promise<string | null> {
    let basePath: string;
    if (path.isAbsolute(moduleSpecifier)) {
      basePath = path.resolve(moduleSpecifier);
    } else if (moduleSpecifier.startsWith('.')) {
      basePath = path.resolve(path.dirname(fromFile), moduleSpecifier);
    } else {
      const tsconfig = await loadTsconfigPathConfig(path.dirname(fromFile), this.fileSystem);
      const aliasPath = await resolveBarePathAliasAsync(
        moduleSpecifier,
        tsconfig.pathAliases,
        async candidate => await this.fileSystem.exists(candidate)
          && await this.fileSystem.isFile(candidate)
      );
      if (aliasPath) {
        basePath = aliasPath;
      } else if (tsconfig.baseUrl) {
        basePath = path.resolve(tsconfig.baseUrl, moduleSpecifier);
      } else {
        return null;
      }
    }
    const importExtension = path.extname(basePath);
    const normalizedBasePath = hasRuntimeImportExtensionCandidates(importExtension)
      ? basePath.slice(0, -importExtension.length)
      : basePath;
    const extensions = getImportResolutionExtensions(importExtension);
    const candidates = new Set<string>([basePath, normalizedBasePath]);

    for (const extension of extensions) {
      candidates.add(normalizedBasePath + extension);
      candidates.add(path.join(normalizedBasePath, `index${extension}`));
    }

    const projectFilesByPath = new Map(projectFiles.map(file => [path.resolve(file), file]));
    for (const candidate of candidates) {
      const projectFile = projectFilesByPath.get(path.resolve(candidate));
      if (projectFile) {
        return projectFile;
      }
    }

    return null;
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
    // 巢狀的可獨立定址函數/類別節點是邊界，其內部呼叫歸屬該節點自身，不遞迴進去。
    // 賦值給變數的 arrow function / function expression 視同具名函數，亦是邊界；
    // 未賦值給變數的匿名 callback（IIFE、`arr.map(x => ...)`）維持非邊界。
    (targetFunctionPath as import('@babel/traverse').NodePath).traverse({
      FunctionDeclaration(path) {
        path.skip();
      },
      FunctionExpression(path) {
        if (path.node.id || babel.isVariableDeclarator(path.parent)) {
          path.skip();
        }
      },
      ArrowFunctionExpression(path) {
        if (babel.isVariableDeclarator(path.parent)) {
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
        const key = `${filePath}:${callee}:${line}:${column}`;
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
