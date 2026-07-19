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
import {
  createFileUtils,
  FileUtils,
  matchProjectFileFromCandidates,
  resolveProjectImportCandidates,
  type ReexportForward,
  parseReexportForwards
} from '@core/foundations/index.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';
import { tsPositionToPosition, tsNodeToRange } from '@plugins/typescript/types.js';
import { findNearestLexicalDeclarationName, identifierShadowedByLocalDeclaration } from '@plugins/typescript/lexical-scope-binding.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage } from '@shared/errors/index.js';
import { logger } from '@infrastructure/logging/index.js';
import type {
  CallHierarchyData,
  CallHierarchyOptions,
  IncomingCall,
  OutgoingCall,
} from './types.js';

const traverse = (babelTraverse as unknown as { default?: typeof babelTraverse }).default || babelTraverse;

/** 匿名 default export 在展開 outgoing 時使用的合成名稱（檔內無識別符可對） */
const ANONYMOUS_DEFAULT_EXPORT_NAME = '<default>';

/** barrel re-export 鏈路防護：迴圈防護（visited set）之外的合理深度上限 */
const MAX_REEXPORT_CHAIN_DEPTH = 20;

interface FunctionDefinition {
  readonly location: { filePath: string; range: Range };
}

interface ImportedBinding {
  /**
   * 具名 import：遠端 export 名；default import：固定為 `'default'`（不得用 local 別名當 export 名）。
   */
  readonly importedName: string;
  readonly moduleSpecifier: string;
  /** default import（`import x from '…'`）時為 true */
  readonly isDefaultImport?: boolean;
}

type BabelParseResult = import('@babel/parser').ParseResult<babel.File>;

type FileAstCache = Map<string, { sourceFile?: ts.SourceFile; babelAst?: BabelParseResult } | null>;

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
        definitionRange,
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
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * 判斷 incoming callSite 是否真的指向 targetDefinition 這個具體定義。
   * - 同檔：以詞法綁定（lexical-scope-binding）／方法呼叫語意錨定，禁止 short-circuit 全收
   * - 跨檔：與 outgoing 遞迴展開共用 import binding 解析，positive 驗證識別符實際 import 自哪個檔案
   */
  private async isCallSiteAnchoredToDefinition(
    callSite: CallSite,
    targetName: string,
    targetDefinitionFile: string,
    targetDefinitionRange: Range,
    projectFiles: readonly string[],
    fileAstCache: FileAstCache
  ): Promise<boolean> {
    const callSiteFile = callSite.location.filePath;

    let parsed = fileAstCache.get(callSiteFile);
    if (parsed === undefined) {
      parsed = await this.parseFileForBindingResolution(callSiteFile);
      fileAstCache.set(callSiteFile, parsed);
    }

    // 同檔：必須對每個 callSite 做 binding/shadow／method 錨定
    if (callSiteFile === targetDefinitionFile) {
      return this.isSameFileCallSiteAnchoredToDefinition(
        callSite,
        targetName,
        targetDefinitionRange,
        parsed
      );
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
          // 有明確的 import binding：唯有解析到本次目標定義檔（或經 barrel re-export
          // 鏈跟隨後抵達本次目標定義檔）才算真正 caller；解析到別的檔案或完全解析不到
          // （如外部套件、無法解析的 alias）都代表這個識別符另有所指，非本次目標定義，
          // 直接排除，不落回下方的本地宣告 fallback。
          const resolvedFile = await this.resolveProjectImportPath(
            importedBinding.moduleSpecifier,
            callSiteFile,
            projectFiles
          );
          if (!resolvedFile) {
            return false;
          }
          if (resolvedFile === targetDefinitionFile) {
            return true;
          }
          // resolvedFile 是 barrel 檔（純 `export { targetName } from './real.js'`）時，
          // 單跳比對會誤排除合法 caller，需跟隨 re-export 鏈確認是否仍抵達目標定義檔。
          const chainTargets = await this.resolveReexportChainTargets(resolvedFile, targetName, projectFiles);
          return chainTargets.some(target => target.file === targetDefinitionFile);
        }
      } catch (error) {
        // AST 節點形狀不符（如測試替身回傳的假 AST）時退回下方的本地宣告 fallback，
        // 與檔案同層其他 AST 解析錯誤處理一致，不讓單一異常 AST 中斷整體 incoming 分析。
        diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `Import binding resolution failed: ${getErrorMessage(error)}`);
      }
    }

    // 無可判定的 import binding（無 import 宣告，或被同名區域宣告在該呼叫點遮蔽）：
    // fallback 為「該檔案是否有自己的真正本地宣告」——有代表呼叫自己的版本（排除），
    // 沒有則保守視為可能指向本次目標（維持既有行為，避免誤刪未覆蓋到的合法情境）。
    return !(await this.hasGenuineLocalDefinition(callSiteFile, targetName));
  }

  /**
   * 同檔 callSite 是否綁定到指定定義（range 為符號識別符位置）。
   * 方法呼叫不會綁到 free function；free 呼叫以 nearest lexical declaration 比對定義。
   */
  private isSameFileCallSiteAnchoredToDefinition(
    callSite: CallSite,
    targetName: string,
    targetDefinitionRange: Range,
    parsed: { sourceFile?: ts.SourceFile; babelAst?: BabelParseResult } | null
  ): boolean {
    if (!parsed) {
      // 無法解析時僅排除明顯的 method call 誤收；free call 維持舊行為以免誤刪
      return !callSite.isMethodCall;
    }

    if (parsed.sourceFile) {
      return this.isTypeScriptSameFileCallSiteAnchored(
        parsed.sourceFile,
        callSite,
        targetName,
        targetDefinitionRange
      );
    }

    if (parsed.babelAst) {
      return this.isBabelSameFileCallSiteAnchored(
        parsed.babelAst,
        callSite,
        targetName,
        targetDefinitionRange
      );
    }

    return !callSite.isMethodCall;
  }

  private isTypeScriptSameFileCallSiteAnchored(
    sourceFile: ts.SourceFile,
    callSite: CallSite,
    targetName: string,
    targetDefinitionRange: Range
  ): boolean {
    const definitionIsMethod = this.isTypeScriptDefinitionAMethod(
      sourceFile,
      targetName,
      targetDefinitionRange
    );

    if (callSite.isMethodCall) {
      // 無 receiver 型別時，僅接受 this.method 且定義落在同一 enclosing class 的 method
      if (!definitionIsMethod) {
        return false;
      }
      return this.isTypeScriptThisMethodCallInDefiningClass(
        sourceFile,
        callSite,
        targetName,
        targetDefinitionRange
      );
    }

    if (definitionIsMethod) {
      // free call 不綁 class method 定義
      return false;
    }

    const calleeIdentifier = this.findTypeScriptCallSiteCalleeIdentifier(
      sourceFile,
      callSite,
      targetName
    );
    if (!calleeIdentifier) {
      return false;
    }

    const nearest = findNearestLexicalDeclarationName(sourceFile, calleeIdentifier, targetName);
    if (!nearest) {
      return false;
    }

    return this.identifierStartsAtRange(nearest, sourceFile, targetDefinitionRange);
  }

  private isBabelSameFileCallSiteAnchored(
    babelAst: BabelParseResult,
    callSite: CallSite,
    targetName: string,
    targetDefinitionRange: Range
  ): boolean {
    const { line, column } = callSite.location.range.start;
    let anchored = false;

    traverse(babelAst, {
      CallExpression: callPath => {
        const loc = callPath.node.loc;
        if (!loc || loc.start.line !== line || loc.start.column + 1 !== column) {
          return;
        }

        const callee = callPath.node.callee;
        if (callSite.isMethodCall) {
          if (!babel.isMemberExpression(callee) || callee.computed || !babel.isIdentifier(callee.property)) {
            callPath.stop();
            return;
          }
          if (callee.property.name !== targetName) {
            callPath.stop();
            return;
          }
          // free function 定義不收 method call；method 定義僅接受 this.method 且宣告在同一 class
          if (!babel.isThisExpression(callee.object)) {
            callPath.stop();
            return;
          }
          const classPath = callPath.findParent(parent => parent.isClassDeclaration() || parent.isClassExpression());
          if (!classPath || !classPath.isClass()) {
            callPath.stop();
            return;
          }
          const classBody = classPath.node.body;
          if (!babel.isClassBody(classBody)) {
            callPath.stop();
            return;
          }
          anchored = classBody.body.some(member => {
            if (!babel.isClassMethod(member) || member.kind !== 'method') {
              return false;
            }
            const key = member.key;
            if (!babel.isIdentifier(key) || key.name !== targetName || !key.loc) {
              return false;
            }
            return key.loc.start.line === targetDefinitionRange.start.line
              && key.loc.start.column + 1 === targetDefinitionRange.start.column;
          });
          callPath.stop();
          return;
        }

        if (!babel.isIdentifier(callee) || callee.name !== targetName) {
          callPath.stop();
          return;
        }

        const binding = callPath.scope.getBinding(targetName);
        if (!binding) {
          callPath.stop();
          return;
        }

        // class method 綁定不應被 free call 命中
        if (binding.path.isClassMethod()) {
          callPath.stop();
          return;
        }

        const declNameLoc = this.getBabelBindingDeclarationNameLoc(binding.path, targetName);
        if (declNameLoc) {
          anchored = declNameLoc.line === targetDefinitionRange.start.line
            && declNameLoc.column + 1 === targetDefinitionRange.start.column;
        }
        callPath.stop();
      }
    });

    return anchored;
  }

  private getBabelBindingDeclarationNameLoc(
    bindingPath: import('@babel/traverse').NodePath,
    targetName: string
  ): { line: number; column: number } | null {
    const node = bindingPath.node;
    if (babel.isFunctionDeclaration(node) && node.id?.name === targetName && node.id.loc) {
      return node.id.loc.start;
    }
    if (babel.isVariableDeclarator(node) && babel.isIdentifier(node.id) && node.id.name === targetName && node.id.loc) {
      return node.id.loc.start;
    }
    if (babel.isClassMethod(node) && babel.isIdentifier(node.key) && node.key.name === targetName && node.key.loc) {
      return node.key.loc.start;
    }
    // function / class 自身名稱（binding.path 可能指向 Identifier）
    if (babel.isIdentifier(node) && node.name === targetName && node.loc) {
      return node.loc.start;
    }
    return null;
  }

  private isTypeScriptDefinitionAMethod(
    sourceFile: ts.SourceFile,
    targetName: string,
    definitionRange: Range
  ): boolean {
    const nameNode = this.findTypeScriptIdentifierAtRange(sourceFile, targetName, definitionRange);
    return !!nameNode && ts.isMethodDeclaration(nameNode.parent) && nameNode.parent.name === nameNode;
  }

  private isTypeScriptThisMethodCallInDefiningClass(
    sourceFile: ts.SourceFile,
    callSite: CallSite,
    targetName: string,
    definitionRange: Range
  ): boolean {
    if (callSite.receiver !== 'this') {
      return false;
    }

    const definitionName = this.findTypeScriptIdentifierAtRange(sourceFile, targetName, definitionRange);
    if (!definitionName || !ts.isMethodDeclaration(definitionName.parent)) {
      return false;
    }

    // 從 MethodDeclaration 本身往上找 enclosing class（parent 即可能是 ClassDeclaration）
    let definitionClass: ts.ClassLikeDeclaration | undefined;
    let current: ts.Node | undefined = definitionName.parent;
    while (current) {
      if (ts.isClassDeclaration(current) || ts.isClassExpression(current)) {
        definitionClass = current;
        break;
      }
      current = current.parent;
    }
    if (!definitionClass) {
      return false;
    }

    const callPosition = this.getPositionFromLocation(sourceFile, callSite.location.range.start);
    if (callPosition === null) {
      return false;
    }

    // call 必須落在同一 class 本體內
    return callPosition >= definitionClass.getStart(sourceFile) && callPosition < definitionClass.end;
  }

  private findTypeScriptCallSiteCalleeIdentifier(
    sourceFile: ts.SourceFile,
    callSite: CallSite,
    targetName: string
  ): ts.Identifier | undefined {
    const callExpression = this.findTypeScriptCallOrNewAtLocation(sourceFile, callSite.location);
    if (!callExpression) {
      return undefined;
    }

    const expr = callExpression.expression;
    if (ts.isIdentifier(expr) && expr.text === targetName) {
      return expr;
    }
    return undefined;
  }

  private findTypeScriptCallOrNewAtLocation(
    sourceFile: ts.SourceFile,
    location: Location
  ): ts.CallExpression | ts.NewExpression | undefined {
    const position = this.getPositionFromLocation(sourceFile, location.range.start);
    if (position === null) {
      return undefined;
    }

    let match: ts.CallExpression | ts.NewExpression | undefined;
    const visit = (node: ts.Node): void => {
      if (match) {
        return;
      }
      if (
        (ts.isCallExpression(node) || ts.isNewExpression(node))
        && node.getStart(sourceFile) === position
      ) {
        match = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return match;
  }

  private findTypeScriptIdentifierAtRange(
    sourceFile: ts.SourceFile,
    name: string,
    range: Range
  ): ts.Identifier | undefined {
    const position = this.getPositionFromLocation(sourceFile, range.start);
    if (position === null) {
      return undefined;
    }

    let match: ts.Identifier | undefined;
    const visit = (node: ts.Node): void => {
      if (match) {
        return;
      }
      if (ts.isIdentifier(node) && node.text === name && node.getStart(sourceFile) === position) {
        match = node;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return match;
  }

  private getPositionFromLocation(
    sourceFile: ts.SourceFile,
    position: { line: number; column: number }
  ): number | null {
    // mock / 不完整 AST 可能只有空物件，沒有真實 SourceFile 方法
    if (
      typeof sourceFile.getLineStarts !== 'function' ||
      typeof sourceFile.getPositionOfLineAndCharacter !== 'function'
    ) {
      return null;
    }
    const lineStarts = sourceFile.getLineStarts();
    if (position.line < 1 || position.line > lineStarts.length) {
      return null;
    }
    try {
      return sourceFile.getPositionOfLineAndCharacter(position.line - 1, Math.max(0, position.column - 1));
    } catch {
      return null;
    }
  }

  private identifierStartsAtRange(
    identifier: ts.Identifier,
    sourceFile: ts.SourceFile,
    range: Range
  ): boolean {
    const pos = tsPositionToPosition(sourceFile, identifier.getStart(sourceFile));
    return pos.line === range.start.line && pos.column === range.start.column;
  }

  /**
   * 找出 incoming 呼叫（誰呼叫了目標函數）
   * 使用批次處理優化：按檔案分組，避免重複讀取/解析同一檔案
   */
  private async findIncomingCalls(
    functionName: string,
    projectFiles: readonly string[],
    definitionFile: string,
    definitionRange: Range,
    depth: number,
    targetCallSiteFilter?: (callSite: CallSite) => Promise<boolean>
  ): Promise<IncomingCall[]> {
    const incoming: IncomingCall[] = [];
    const visited = new Set<string>();
    const anchorDecisionCache = new Map<string, boolean>();
    const fileAstCache: FileAstCache = new Map();

    const findCallsRecursive = async (
      targetName: string,
      currentDepth: number,
      targetDefinitionFile: string,
      targetDefinitionRange: Range
    ): Promise<void> => {
      // 以定義位置錨定 visited，避免同檔同名不同綁定互相污染；更深層同樣用 range 區分
      const targetKey = `${targetDefinitionFile}:${targetName}:${targetDefinitionRange.start.line}:${targetDefinitionRange.start.column}`;
      if (currentDepth > depth || visited.has(targetKey)) {
        return;
      }
      visited.add(targetKey);

      let callSites = await this.symbolFinder.findCallSites(targetName, projectFiles);

      // depth 1 且帶有 `--at` 衍生的 targetCallSiteFilter 時，呼叫端已透過該 filter
      // 精確判定 callSite 是否指向本次鎖定的定義。更深層無該 filter，必須以
      // targetDefinitionFile + range 做 binding/shadow 錨定（同檔不可 short-circuit 全收）。
      if (currentDepth === 1 && targetCallSiteFilter) {
        callSites = await this.filterCallSites(callSites, targetCallSiteFilter);
      } else {
        const anchoredCallSites: CallSite[] = [];
        for (const callSite of callSites) {
          // cache 必須含 callSite 位置：同檔同名不同綁定／跨檔 shadow 後結果可能不同
          const cacheKey = [
            callSite.location.filePath,
            callSite.location.range.start.line,
            callSite.location.range.start.column,
            targetName,
            targetDefinitionFile,
            targetDefinitionRange.start.line,
            targetDefinitionRange.start.column
          ].join(':');
          let isAnchored = anchorDecisionCache.get(cacheKey);
          if (isAnchored === undefined) {
            isAnchored = await this.isCallSiteAnchoredToDefinition(
              callSite,
              targetName,
              targetDefinitionFile,
              targetDefinitionRange,
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

      // 遞迴查找：解析 caller 定義 range，更深層同樣做 binding 錨定（Q7）
      for (const caller of callersToRecurse.values()) {
        const callerDefinition = await this.findFunctionDefinition(caller.name, [caller.file]);
        if (!callerDefinition) {
          continue;
        }
        await findCallsRecursive(
          caller.name,
          currentDepth + 1,
          caller.file,
          callerDefinition.location.range
        );
      }
    };

    await findCallsRecursive(functionName, 1, definitionFile, definitionRange);
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
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${getErrorMessage(error)}`);
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
   * default import 必須解析遠端 default export 本體，不得用 local 別名當 export 名查找。
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

      if (importedBinding.isDefaultImport) {
        return this.findDefaultExportFunctionDefinition(importedFile);
      }

      // barrel 檔（純 `export { name } from './real.js'`）本身無本地宣告，需跟隨
      // re-export 鏈追到真正定義檔才找得到符號（見 resolveReexportChainTargets）。
      const chainTargets = await this.resolveReexportChainTargets(
        importedFile,
        importedBinding.importedName,
        projectFiles
      );
      for (const target of chainTargets) {
        const definition = await this.findFunctionDefinition(target.name, [target.file]);
        if (definition) {
          return { ...definition, functionName: target.name };
        }
      }
      return null;
    }

    // 方法呼叫若不是 namespace import，缺少 receiver 型別時無法安全判定其宣告。
    if (call.isMethodCall) {
      return null;
    }

    const definition = await this.findFunctionDefinition(call.callee, [callerFile]);
    return definition ? { ...definition, functionName: call.callee } : null;
  }

  /**
   * 解析模組檔的 default export 函式定義（具名或匿名），供 default import 的 outgoing 遞迴展開。
   * 支援：`export default function name` / `export default function` /
   * `export default () =>` / `export default name` / `export { name as default }`。
   */
  private async findDefaultExportFunctionDefinition(
    filePath: string
  ): Promise<ResolvedCalleeDefinition | null> {
    const parsed = await this.parseFileForBindingResolution(filePath);
    if (!parsed) {
      return null;
    }

    if (parsed.sourceFile) {
      return this.findTypeScriptDefaultExportFunctionDefinition(parsed.sourceFile, filePath);
    }
    if (parsed.babelAst) {
      return this.findBabelDefaultExportFunctionDefinition(parsed.babelAst, filePath);
    }
    return null;
  }

  private findTypeScriptDefaultExportFunctionDefinition(
    sourceFile: ts.SourceFile,
    filePath: string
  ): ResolvedCalleeDefinition | null {
    for (const statement of sourceFile.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && this.hasDefaultModifier(statement)
      ) {
        // class default export 不是可展開的函式本體
        if (ts.isClassDeclaration(statement)) {
          return null;
        }
        if (!statement.body) {
          return null;
        }
        if (statement.name) {
          return this.toResolvedDefinition(filePath, statement.name.text, statement.name, sourceFile);
        }
        // 匿名 `export default function() {}`：以函式節點起點為 range，合成名稱供 findFunctionNode 對位
        return this.toResolvedDefinition(filePath, ANONYMOUS_DEFAULT_EXPORT_NAME, statement, sourceFile);
      }

      if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
        const expr = statement.expression;
        if (ts.isIdentifier(expr)) {
          const definition = this.findLocalFunctionDefinitionByName(sourceFile, filePath, expr.text);
          if (definition) {
            return definition;
          }
          return null;
        }
        if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) {
          if (ts.isFunctionExpression(expr) && expr.name) {
            return this.toResolvedDefinition(filePath, expr.name.text, expr.name, sourceFile);
          }
          return this.toResolvedDefinition(filePath, ANONYMOUS_DEFAULT_EXPORT_NAME, expr, sourceFile);
        }
        return null;
      }

      if (
        ts.isExportDeclaration(statement)
        && !statement.moduleSpecifier
        && statement.exportClause
        && !ts.isNamespaceExport(statement.exportClause)
      ) {
        const defaultElement = statement.exportClause.elements.find(element => element.name.text === 'default');
        if (defaultElement?.propertyName && ts.isIdentifier(defaultElement.propertyName)) {
          return this.findLocalFunctionDefinitionByName(
            sourceFile,
            filePath,
            defaultElement.propertyName.text
          );
        }
      }
    }

    return null;
  }

  private findBabelDefaultExportFunctionDefinition(
    babelAst: BabelParseResult,
    filePath: string
  ): ResolvedCalleeDefinition | null {
    for (const statement of babelAst.program.body) {
      if (!babel.isExportDefaultDeclaration(statement)) {
        continue;
      }

      const decl = statement.declaration;
      if (babel.isFunctionDeclaration(decl) || babel.isFunctionExpression(decl)) {
        if (decl.id?.loc) {
          return {
            functionName: decl.id.name,
            location: {
              filePath,
              range: {
                start: { line: decl.id.loc.start.line, column: decl.id.loc.start.column + 1 },
                end: { line: decl.id.loc.end.line, column: decl.id.loc.end.column + 1 }
              }
            }
          };
        }
        if (!decl.loc) {
          return null;
        }
        return {
          functionName: ANONYMOUS_DEFAULT_EXPORT_NAME,
          location: {
            filePath,
            range: {
              start: { line: decl.loc.start.line, column: decl.loc.start.column + 1 },
              end: { line: decl.loc.end.line, column: decl.loc.end.column + 1 }
            }
          }
        };
      }

      if (babel.isArrowFunctionExpression(decl)) {
        if (!decl.loc) {
          return null;
        }
        return {
          functionName: ANONYMOUS_DEFAULT_EXPORT_NAME,
          location: {
            filePath,
            range: {
              start: { line: decl.loc.start.line, column: decl.loc.start.column + 1 },
              end: { line: decl.loc.end.line, column: decl.loc.end.column + 1 }
            }
          }
        };
      }

      if (babel.isIdentifier(decl) && decl.loc) {
        // export default name — 在同檔找對應函式宣告
        let found: ResolvedCalleeDefinition | null = null;
        traverse(babelAst, {
          FunctionDeclaration: path => {
            if (path.node.id?.name === decl.name && path.node.id.loc) {
              found = {
                functionName: decl.name,
                location: {
                  filePath,
                  range: {
                    start: { line: path.node.id.loc.start.line, column: path.node.id.loc.start.column + 1 },
                    end: { line: path.node.id.loc.end.line, column: path.node.id.loc.end.column + 1 }
                  }
                }
              };
              path.stop();
            }
          },
          VariableDeclarator: path => {
            if (
              babel.isIdentifier(path.node.id)
              && path.node.id.name === decl.name
              && path.node.id.loc
              && (babel.isArrowFunctionExpression(path.node.init) || babel.isFunctionExpression(path.node.init))
            ) {
              found = {
                functionName: decl.name,
                location: {
                  filePath,
                  range: {
                    start: { line: path.node.id.loc.start.line, column: path.node.id.loc.start.column + 1 },
                    end: { line: path.node.id.loc.end.line, column: path.node.id.loc.end.column + 1 }
                  }
                }
              };
              path.stop();
            }
          }
        });
        return found;
      }
    }

    return null;
  }

  private findLocalFunctionDefinitionByName(
    sourceFile: ts.SourceFile,
    filePath: string,
    name: string
  ): ResolvedCalleeDefinition | null {
    let result: ResolvedCalleeDefinition | null = null;
    const visit = (node: ts.Node): void => {
      if (result) {
        return;
      }
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
        result = this.toResolvedDefinition(filePath, name, node.name, sourceFile);
        return;
      }
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === name
        && node.initializer
        && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        result = this.toResolvedDefinition(filePath, name, node.name, sourceFile);
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    return result;
  }

  private toResolvedDefinition(
    filePath: string,
    functionName: string,
    rangeNode: ts.Node,
    sourceFile: ts.SourceFile
  ): ResolvedCalleeDefinition {
    return {
      functionName,
      location: {
        filePath,
        range: tsNodeToRange(rangeNode, sourceFile)
      }
    };
  }

  private hasDefaultModifier(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) {
      return false;
    }
    return !!ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword);
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

      // default import：綁定的是模組 default export，importedName 不得用 local 別名
      if (!call.isMethodCall && importClause.name?.text === call.callee) {
        return {
          importedName: 'default',
          moduleSpecifier: statement.moduleSpecifier.text,
          isDefaultImport: true
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

  /**
   * 呼叫點上的識別符是否被更近的非 import 詞法宣告遮蔽。
   * 委派 lexical-scope-binding（含 for/for-of/for-in initializer、catch、case block 等）。
   */
  private isLexicallyShadowedAtCallSite(
    sourceFile: ts.SourceFile,
    call: CallBindingQuery,
    bindingName: string
  ): boolean {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(bindingName)) {
      return false;
    }

    const identifier = this.findTypeScriptBindingIdentifierAtCallSite(sourceFile, call, bindingName);
    if (!identifier) {
      return false;
    }

    return identifierShadowedByLocalDeclaration(identifier, sourceFile);
  }

  /**
   * 在 call 位置找到要做 shadow 檢查的識別符：
   * free call → callee；method call → receiver（namespace import 的 ns）。
   */
  private findTypeScriptBindingIdentifierAtCallSite(
    sourceFile: ts.SourceFile,
    call: CallBindingQuery,
    bindingName: string
  ): ts.Identifier | undefined {
    const callExpression = this.findTypeScriptCallOrNewAtLocation(sourceFile, call.location);
    if (!callExpression) {
      return undefined;
    }

    const expr = callExpression.expression;
    if (!call.isMethodCall) {
      return ts.isIdentifier(expr) && expr.text === bindingName ? expr : undefined;
    }

    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === bindingName) {
      return expr.expression;
    }
    return undefined;
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
        if (!call.isMethodCall && babel.isImportDefaultSpecifier(specifier) && specifier.local.name === call.callee) {
          return {
            importedName: 'default',
            moduleSpecifier: statement.source.value,
            isDefaultImport: true
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

  /**
   * 讀取檔案並解析其 re-export 轉發宣告（純 barrel `export { x } from './y'` /
   * `export * from './y'`）。與 rename 的 target-exposure-resolver 共用同一套
   * @core/foundations parseReexportForwards（Single Source of Truth），此處只負責
   * 讀檔＋快篩後呼叫。
   */
  private async getReexportForwards(filePath: string): Promise<ReexportForward[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content || !content.includes('export') || !content.includes('from')) {
      return [];
    }
    return parseReexportForwards(filePath, content);
  }

  /**
   * 跟隨 barrel re-export 鏈，找出 `fileAbs` 內 `name` 這個綁定最終追到的候選宣告位置
   * 清單：若 fileAbs 對 name 只是純轉發（`export { name } from './real.js'` 或
   * `export * from './real.js'`），沿轉發鏈往下追（具名轉發可能一路改名，故 name 隨鏈路
   * 更新，如 `export { real as alias } from './real.js'`）；沒有比對到任何轉發即視為葉
   * 節點（該處應有本地宣告，交由呼叫端以 findFunctionDefinition／等值比對驗證）。
   *
   * visited set 防成環，depth 上限為額外防禦；outgoing（findCalleeDefinition）與
   * incoming（isCallSiteAnchoredToDefinition）共用此同一條解析，不各自展開一份。
   *
   * namespace re-export（`export * as ns from`）不在此鏈路範圍：consumer 端需經
   * `ns.member` 存取，並非直接同名匯出，語意與具名/`export *` 轉發不同，超出本次
   * barrel 鏈路缺陷（純具名轉發）的範圍。
   */
  private async resolveReexportChainTargets(
    fileAbs: string,
    name: string,
    projectFiles: readonly string[],
    visited: Set<string> = new Set(),
    depth = 0
  ): Promise<Array<{ file: string; name: string }>> {
    const visitKey = `${fileAbs}:${name}`;
    if (depth > MAX_REEXPORT_CHAIN_DEPTH || visited.has(visitKey)) {
      return [];
    }
    visited.add(visitKey);

    const forwards = await this.getReexportForwards(fileAbs);
    const matchingForwards = forwards.filter(
      forward => !forward.isNamespaceExport
        && (forward.exportedName === undefined || forward.exportedName === name)
    );

    if (matchingForwards.length === 0) {
      return [{ file: fileAbs, name }];
    }

    const targets: Array<{ file: string; name: string }> = [];
    for (const forward of matchingForwards) {
      const nextFile = await this.resolveProjectImportPath(forward.moduleSpecifier, fileAbs, projectFiles);
      if (!nextFile) {
        continue;
      }
      const nextName = forward.importedName ?? name;
      targets.push(
        ...await this.resolveReexportChainTargets(nextFile, nextName, projectFiles, visited, depth + 1)
      );
    }
    return targets;
  }

  private async resolveProjectImportPath(
    moduleSpecifier: string,
    fromFile: string,
    projectFiles: readonly string[]
  ): Promise<string | null> {
    // tsconfig 只在 bare specifier（非絕對、非相對）才需要，絕對/相對路徑的候選組裝
    // 不依賴 alias/baseUrl，提前避開不必要的 tsconfig 載入 I/O。
    const isBareSpecifier = !path.isAbsolute(moduleSpecifier) && !moduleSpecifier.startsWith('.');
    const tsconfig = isBareSpecifier
      ? await loadTsconfigPathConfigOrWarn(path.dirname(fromFile), this.fileSystem)
      : undefined;

    const candidates = resolveProjectImportCandidates(moduleSpecifier, fromFile, {
      pathAliases: tsconfig?.pathAliases,
      baseUrl: tsconfig?.baseUrl
    });

    return matchProjectFileFromCandidates(candidates, projectFiles);
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

    const isAnonymousDefaultTarget = functionName === ANONYMOUS_DEFAULT_EXPORT_NAME;

    traverse(babelAst, {
      FunctionDeclaration(path) {
        if (path.node.id?.name === functionName) {
          recordCandidate(path, path.node.id);
          return;
        }
        // 匿名 `export default function() {}`
        if (
          isAnonymousDefaultTarget
          && !path.node.id
          && babel.isExportDefaultDeclaration(path.parent)
        ) {
          recordCandidate(path, path.node);
        }
      },
      ArrowFunctionExpression(path) {
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id) && parent.id.name === functionName) {
          recordCandidate(path, parent.id);
          return;
        }
        if (isAnonymousDefaultTarget && babel.isExportDefaultDeclaration(parent)) {
          recordCandidate(path, path.node);
        }
      },
      FunctionExpression(path) {
        const parent = path.parent;
        if (babel.isVariableDeclarator(parent) && babel.isIdentifier(parent.id) && parent.id.name === functionName) {
          recordCandidate(path, parent.id);
          return;
        }
        if (
          isAnonymousDefaultTarget
          && (babel.isExportDefaultDeclaration(parent) || !path.node.id)
        ) {
          if (babel.isExportDefaultDeclaration(parent)) {
            recordCandidate(path, path.node);
          }
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
      rangeNode: ts.Node
    ): void => {
      fallback ??= functionNode;
      if (this.nodeStartsAtRange(rangeNode, sourceFile, range)) {
        exactMatch = functionNode;
      }
    };

    const visit = (node: ts.Node): void => {
      if (exactMatch) {return;}

      // FunctionDeclaration（具名，或匿名 default export 以 range 對位）
      if (ts.isFunctionDeclaration(node) && node.body) {
        if (node.name?.text === functionName) {
          recordCandidate(node, this.getComparableNameNode(node));
          return;
        }
        if (
          functionName === ANONYMOUS_DEFAULT_EXPORT_NAME
          && !node.name
          && this.hasDefaultModifier(node)
        ) {
          recordCandidate(node, node);
          return;
        }
      }

      // MethodDeclaration
      if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === functionName) {
        recordCandidate(node, this.getComparableNameNode(node));
        return;
      }

      // Arrow function 或 function expression 賦值給變數
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        if (node.name.text === functionName && node.initializer) {
          if (ts.isArrowFunction(node.initializer)) {
            recordCandidate(node.initializer, node.name);
            return;
          }
          if (ts.isFunctionExpression(node.initializer)) {
            recordCandidate(node.initializer, node.name);
            return;
          }
        }
      }

      // `export default function() {}` / `export default () => {}` / `export default function name()`
      if (ts.isExportAssignment(node) && !node.isExportEquals) {
        const expr = node.expression;
        if (ts.isFunctionExpression(expr) || ts.isArrowFunction(expr)) {
          const rangeNode = ts.isFunctionExpression(expr) && expr.name ? expr.name : expr;
          if (
            functionName === ANONYMOUS_DEFAULT_EXPORT_NAME
            || (ts.isFunctionExpression(expr) && expr.name?.text === functionName)
            || this.nodeStartsAtRange(rangeNode, sourceFile, range)
          ) {
            recordCandidate(expr, rangeNode);
            return;
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return exactMatch ?? fallback;
  }

  private nodeStartsAtRange(node: ts.Node, sourceFile: ts.SourceFile, range: Range): boolean {
    const pos = tsPositionToPosition(sourceFile, node.getStart(sourceFile));
    return pos.line === range.start.line && pos.column === range.start.column;
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

    const pos = tsPositionToPosition(sourceFile, node.getStart(sourceFile));
    const lines = sourceFile.text.split('\n');
    const lineText = lines[pos.line - 1] || '';

    return {
      callee,
      line: pos.line,
      column: pos.column,
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

      // mock / 不完整 AST 可能沒有真實 SourceFile 方法
      if (
        typeof sourceFile.getLineStarts !== 'function' ||
        typeof sourceFile.getPositionOfLineAndCharacter !== 'function'
      ) {
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
      diagnostics.warn('call-hierarchy', 'AST_PARSE_FAILED', `AST parse failed: ${getErrorMessage(error)}`);
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
