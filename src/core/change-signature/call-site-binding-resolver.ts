/**
 * 呼叫點繫結解析
 * 逐檔解析出「對目標符號的本地繫結」（具名／別名／default／namespace import，以及
 * 遞迴 barrel re-export 轉發），並依此精確收集頂層函數／變數函數目標的呼叫點。
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { FileUtils } from '@core/foundations/index.js';
import type { SymbolFinder } from '@core/foundations/index.js';
import type { CallSite } from '@core/foundations/symbol-finder/index.js';
import type { PathUtils } from '@core/move/path-utils.js';
import type { Range } from '@shared/types/core.js';
import { isPositionInRange } from '@shared/types/core.js';
import { offsetToPosition } from '@shared/position-utils.js';
import { collectScopeShadowedNames } from './scope-shadow-analyzer.js';
import { getScriptKind } from './script-kind.js';

/**
 * 中介檔（barrel）的單層 re-export 轉發資訊
 */
interface ReexportForward {
  /** re-export 的來源模組路徑（`from '<spec>'`） */
  readonly moduleSpecifier: string;
  /**
   * 這個中介檔對外暴露的名稱；undefined 表示 `export * from` 轉發全部具名匯出
   * （不含 default）。具名轉發若有改名（`export { fn as alias }`），這裡是外部
   * 可見的別名 `alias`，向來源模組請求時須改用 {@link sourceName}（原始名稱）。
   */
  readonly exportedName?: string;
  /**
   * 向來源模組請求的原始名稱；只有具名轉發且被改名時才與 exportedName 不同
   * （`export { fn as alias }` → sourceName = 'fn'）。未改名或 star 轉發時
   * 省略，呼叫端 fallback 回 exportedName（未改名）或延用當下 requestedExportName
   * （star，見 resolvesToTargetViaReexport）。
   */
  readonly sourceName?: string;
}

/**
 * 單一檔案中對目標符號的本地繫結
 */
export interface TargetFileBindings {
  /**
   * 以「識別字」直接呼叫目標的本地名稱集合：目標定義檔中的函式名本身，
   * 以及具名／別名／default import 的本地繫結名（`import { combine as merge }` → `merge`）。
   */
  readonly localNames: Set<string>;
  /**
   * namespace import 的 receiver 名稱集合（`import * as lib` → `lib`），
   * 呼叫形如 `<receiver>.<functionName>(...)`。
   */
  readonly namespaceReceivers: Set<string>;
}

export class CallSiteBindingResolver {
  constructor(
    private readonly parserRegistry: ParserRegistry,
    private readonly fileUtils: FileUtils,
    private readonly pathUtils: PathUtils,
    private readonly symbolFinder: SymbolFinder
  ) {}

  /**
   * 逐檔解析出「對目標符號的本地繫結」，回傳 file -> 繫結資訊 的 map。
   * 涵蓋：目標定義檔本身（本地名 = 目標名）、具名／別名／default import 的本地名、
   * namespace import 的 receiver，以及透過遞迴 barrel re-export（多層 `export { name } from`
   * 未 alias 改名，或 `export * from`）間接 import 到目標符號的檔案。
   *
   * 界線（記載於此）：import specifier 解析涵蓋相對路徑與 tsconfig paths 別名／baseUrl
   * （交由 PathUtils，與 move / move-member 同一把尺）；node_modules 套件不在判定範圍內；
   * re-export 轉發遞迴多層並以 visited set 防環，具名轉發需未 alias 改名（`export { f as g }`
   * 視為不同符號、不算轉發）。以「本地繫結名」精確定位呼叫點——不再靠 method-call 全域過濾，
   * 故 namespace import 的 `ns.fn(...)` 呼叫得以被納入（見 collectTopLevelFunctionCallSites）。
   */
  async resolveTargetBindings(
    files: readonly string[],
    targetFilePath: string,
    name: string
  ): Promise<Map<string, TargetFileBindings>> {
    const targetAbsolute = path.resolve(targetFilePath);
    const bindings = new Map<string, TargetFileBindings>();
    const targetHasDefaultExport = await this.hasDefaultExportName(targetAbsolute, name);
    // per-run cache：同一次呼叫內，同一個中介檔（barrel）的 re-export 轉發只解析一次，
    // 避免多個 consumer 檔重複讀取/解析同一個中介檔
    const reexportCache = new Map<string, readonly ReexportForward[]>();

    const ensure = (file: string): TargetFileBindings => {
      let entry = bindings.get(file);
      if (!entry) {
        entry = { localNames: new Set<string>(), namespaceReceivers: new Set<string>() };
        bindings.set(file, entry);
      }
      return entry;
    };

    for (const file of files) {
      if (path.resolve(file) === targetAbsolute) {
        // 目標定義檔：以自身函式名做識別字呼叫（涵蓋同檔內的呼叫點）
        ensure(file).localNames.add(name);
        continue;
      }

      const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(file));
      if (!parser?.getImportDeclarations) {
        continue;
      }
      const content = await this.fileUtils.readFile(file);
      if (!content) {
        continue;
      }

      const declarations = parser.getImportDeclarations(content) ?? [];
      for (const declaration of declarations) {
        if (declaration.isTypeOnly) {
          continue; // type-only import 不會產生 runtime 呼叫點
        }

        // 具名 import：consumer 直接 import 目標時 spec.name 必為目標的真實名稱
        // （name），但經過會改名的 barrel 轉發（`export { fn as alias } from
        // './source'`）時 spec.name 是外部可見的別名 alias，不等於 name——故不能
        // 用「spec.name === name」預先篩掉，一律交給 moduleExposesTargetFunction
        // 沿 re-export 鏈追查 spec.name 最終是否對應回目標（本地繫結名為 alias ?? name）
        for (const spec of declaration.namedImports) {
          if (spec.isTypeOnly) {
            continue;
          }
          const requestedExportName = spec.name === 'default' ? 'default' : spec.name;
          const moduleExposesTarget = await this.moduleExposesTargetFunction(
            file,
            declaration.moduleSpecifier,
            name,
            targetAbsolute,
            files,
            reexportCache,
            targetHasDefaultExport,
            requestedExportName
          );
          if (moduleExposesTarget) {
            ensure(file).localNames.add(spec.alias ?? spec.name);
          }
        }

        // default import 綁定的是模組 default export，本地名稱可以任意命名；
        // 目標可以直接來自定義檔，也可以經 `export { default } from` barrel 轉發。
        if (declaration.defaultImport !== undefined && await this.moduleExposesTargetFunction(
          file,
          declaration.moduleSpecifier,
          name,
          targetAbsolute,
          files,
          reexportCache,
          targetHasDefaultExport,
          'default'
        )) {
          ensure(file).localNames.add(declaration.defaultImport ?? name);
        }

        // namespace import：`import * as ns` → `ns.<name>(...)` 呼叫
        if (declaration.namespaceImport && await this.moduleExposesTargetFunction(
          file,
          declaration.moduleSpecifier,
          name,
          targetAbsolute,
          files,
          reexportCache,
          targetHasDefaultExport,
          name
        )) {
          ensure(file).namespaceReceivers.add(declaration.namespaceImport);
        }
      }
    }

    return bindings;
  }

  /**
   * 收集頂層函數／變數函數目標的呼叫點：逐檔以該檔實際繫結目標的本地名定位。
   * - localNames：以識別字呼叫（`combine(...)`、別名 `merge(...)`），取非 method、非 new 呼叫點。
   * - namespaceReceivers：`<receiver>.<functionName>(...)`，取 receiver 相符的 method 呼叫點。
   * 以 (檔案:行:列) 去重，避免同一呼叫點被多個本地名重複收集。
   */
  async collectTopLevelFunctionCallSites(
    bindings: Map<string, TargetFileBindings>,
    functionName: string
  ): Promise<CallSite[]> {
    const collected: CallSite[] = [];
    const seen = new Set<string>();

    const add = (callSite: CallSite): void => {
      const { filePath, range } = callSite.location;
      const key = `${filePath}:${range.start.line}:${range.start.column}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      collected.push(callSite);
    };

    for (const [file, binding] of bindings) {
      for (const localName of binding.localNames) {
        const sites = await this.symbolFinder.findCallSitesInFile(file, localName);
        const unshadowedSites = await this.excludeLocallyShadowedCallSites(file, localName, sites);
        for (const site of unshadowedSites) {
          if (!site.isMethodCall && site.isNewExpression !== true) {
            add(site);
          }
        }
      }

      if (binding.namespaceReceivers.size > 0) {
        const sites = await this.symbolFinder.findCallSitesInFile(file, functionName);
        for (const site of sites) {
          if (site.isMethodCall && site.isNewExpression !== true && site.receiver !== undefined
              && binding.namespaceReceivers.has(site.receiver)) {
            add(site);
          }
        }
      }
    }

    return collected;
  }

  /**
   * 排除被檔案內區域繫結（函式參數／區塊變數／巢狀宣告）遮蔽的同名呼叫點。
   *
   * import 的本地名稱若被內層作用域重新宣告（如同名函式參數），該作用域內以此
   * 名稱呼叫的其實是區域繫結、不是匯入的目標符號，不應被當成目標呼叫點改寫。
   * 與參數引用遮蔽掃描（visitNodeForReferences／collectScopeShadowedNames）共用
   * 同一套作用域判定邏輯（Single Source of Truth），只是應用對象從「函式 body
   * 內的識別字引用」換成「整份檔案內某名稱的呼叫點位置」。
   */
  private async excludeLocallyShadowedCallSites(
    file: string,
    localName: string,
    sites: readonly CallSite[]
  ): Promise<CallSite[]> {
    if (sites.length === 0) {
      return [];
    }

    const content = await this.fileUtils.readFile(file);
    if (!content) {
      return [...sites];
    }

    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, getScriptKind(file));
    const shadowedRanges = this.collectShadowedRangesForName(sourceFile, content, localName);
    if (shadowedRanges.length === 0) {
      return [...sites];
    }

    return sites.filter(site => !shadowedRanges.some(range => isPositionInRange(site.location.range.start, range)));
  }

  /**
   * 走訪整份原始碼，收集指定名稱被區域宣告遮蔽的範圍（函式參數、區塊內
   * let/const/function/class 宣告、具名 function/class expression 自身名稱等）。
   * 一旦某節點自身即遮蔽該名稱就記錄其整體範圍並停止往下遞迴——該子樹內此名稱
   * 皆已遮蔽，不需再找更深層對同名稱的（多餘的）遮蔽範圍。
   */
  private collectShadowedRangesForName(sourceFile: ts.SourceFile, content: string, name: string): Range[] {
    const ranges: Range[] = [];

    const visit = (node: ts.Node): void => {
      const shadowed = collectScopeShadowedNames(node);
      if (shadowed.has(name)) {
        ranges.push({
          start: offsetToPosition(content, node.getStart(sourceFile)),
          end: offsetToPosition(content, node.getEnd())
        });
        return;
      }
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return ranges;
  }

  /**
   * 判斷某個 import specifier 是否讓 consumer 取得「源自目標檔」的 name 匯出：
   * specifier 直接解析到目標檔，或透過（遞迴）barrel re-export 轉發 name 回目標檔。
   */
  private async moduleExposesTargetFunction(
    consumerFilePath: string,
    moduleSpecifier: string,
    name: string,
    targetAbsolute: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>,
    targetHasDefaultExport: boolean,
    requestedExportName: string
  ): Promise<boolean> {
    if (await this.importSpecifierResolvesToTarget(consumerFilePath, moduleSpecifier, targetAbsolute)) {
      // 直接解析到目標檔（無 barrel）：目標檔匯出的具名符號一定是它自身宣告的
      // 名稱 name，不可能被改名，故 requestedExportName 必須與 name 完全相符才算
      // 命中——不能像先前那樣無條件視為命中（舊假設只在呼叫端保證
      // requestedExportName === name 時成立，barrel 別名場景已不再保證這點）。
      if (requestedExportName === 'default') {
        return targetHasDefaultExport;
      }
      return requestedExportName === name;
    }
    return this.resolvesToTargetViaReexport(
      consumerFilePath,
      moduleSpecifier,
      name,
      targetAbsolute,
      allFiles,
      reexportCache,
      targetHasDefaultExport,
      requestedExportName,
      new Set<string>()
    );
  }

  /**
   * 遞迴 re-export 判定：import specifier 解析到專案內某個「中介檔」（barrel）時，
   * 讀取其匯出宣告，若以 named（未 alias 改名）或 star 形式轉發 name，
   * 再確認該轉發的來源 specifier 直接解析回目標檔，或（遞迴）經更深一層 barrel 轉發回目標檔。
   * visited set 以中介檔絕對路徑去重，防止 re-export 成環時無限遞迴。
   */
  private async resolvesToTargetViaReexport(
    consumerFilePath: string,
    moduleSpecifier: string,
    name: string,
    targetAbsolute: string,
    allFiles: readonly string[],
    reexportCache: Map<string, readonly ReexportForward[]>,
    targetHasDefaultExport: boolean,
    requestedExportName: string,
    visited: Set<string>
  ): Promise<boolean> {
    let intermediateFile: string | undefined;
    for (const candidate of allFiles) {
      if (await this.importSpecifierResolvesToTarget(
        consumerFilePath,
        moduleSpecifier,
        path.resolve(candidate)
      )) {
        intermediateFile = candidate;
        break;
      }
    }
    if (!intermediateFile) {
      return false;
    }

    const intermediateKey = path.resolve(intermediateFile);
    if (visited.has(intermediateKey)) {
      return false;
    }
    visited.add(intermediateKey);

    const forwards = await this.getReexportForwards(intermediateFile, reexportCache);
    for (const forward of forwards) {
      // `export *` 不轉發 default；其餘具名轉發必須對上實際 import 的匯出名
      // （這裡比對的是這一層對外可見的 exportedName，即消費端／上一層看到的名稱）。
      if (forward.exportedName === undefined && requestedExportName === 'default') {
        continue;
      }
      if (forward.exportedName !== undefined && forward.exportedName !== requestedExportName) {
        continue;
      }

      // 往下一層（來源模組）請求的名稱：star 轉發原樣保留名稱（`export *` 不能
      // 改名）；具名轉發若有 sourceName（barrel 對外改名，如 `export { fn as
      // alias }`）則改請求來源模組內的原始名稱 fn，未改名時 sourceName 等於
      // exportedName，等效於沿用原邏輯。
      const nextRequestedExportName = forward.exportedName === undefined
        ? requestedExportName
        : (forward.sourceName ?? forward.exportedName);

      if (
        await this.importSpecifierResolvesToTarget(intermediateFile, forward.moduleSpecifier, targetAbsolute)
        && (nextRequestedExportName === 'default'
          ? targetHasDefaultExport
          : nextRequestedExportName === name)
      ) {
        return true;
      }
      if (await this.resolvesToTargetViaReexport(
        intermediateFile,
        forward.moduleSpecifier,
        name,
        targetAbsolute,
        allFiles,
        reexportCache,
        targetHasDefaultExport,
        nextRequestedExportName,
        visited
      )) {
        return true;
      }
    }

    return false;
  }

  /**
   * 取得中介檔的 re-export 轉發清單（含 per-run cache，避免重複讀取/解析同一檔案）
   */
  private async getReexportForwards(
    filePath: string,
    cache: Map<string, readonly ReexportForward[]>
  ): Promise<readonly ReexportForward[]> {
    const cached = cache.get(filePath);
    if (cached) {
      return cached;
    }

    const forwards = await this.parseReexportForwards(filePath);
    cache.set(filePath, forwards);
    return forwards;
  }

  /**
   * 解析檔案中的 re-export 轉發宣告：`export { name } from '<spec>'`
   * （未 alias 改名）與 `export * from '<spec>'`。
   * 與呼叫點解析（call-site-parser.ts）相同的取捨：直接以 TS AST 解析語法結構，
   * 不依賴副檔名（TS parser 亦可解析 .js 檔案的語法）。
   */
  private async parseReexportForwards(filePath: string): Promise<ReexportForward[]> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return [];
    }

    const forwards: ReexportForward[] = [];
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

    for (const statement of sourceFile.statements) {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) {
        continue;
      }

      const moduleSpecifier = statement.moduleSpecifier;
      if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
        continue; // 非 re-export（純 local export，無 from 子句）
      }

      if (!statement.exportClause) {
        // `export * from '<spec>'`：轉發全部匯出
        forwards.push({ moduleSpecifier: moduleSpecifier.text });
        continue;
      }

      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          // element.propertyName 存在時代表 barrel 對外改名（`export { f as g }`）：
          // 仍是同一符號的轉發，只是外部可見名稱換了——exportedName 記外部看到的
          // 名稱 g，sourceName 記來源模組內的原始名稱 f，供下一層請求時還原。
          // 未改名時 propertyName 不存在，sourceName 省略（等於 exportedName）。
          forwards.push({
            moduleSpecifier: moduleSpecifier.text,
            exportedName: element.name.text,
            sourceName: element.propertyName?.text
          });
        }
      }
      // `export * as ns from '<spec>'`（NamespaceExport）不在單層轉發判定範圍內：
      // 消費端須以 `ns.fn(...)` method call 呼叫，已被既有 method call 過濾排除
    }

    return forwards;
  }

  /**
   * 判斷目標檔是否以 default export 暴露指定名稱的函式／類別。
   * default import 的本地名稱與宣告名稱可以不同，因此不能用 import 名稱比對取代這項判定。
   */
  private async hasDefaultExportName(filePath: string, name: string): Promise<boolean> {
    const content = await this.fileUtils.readFile(filePath);
    if (!content) {
      return false;
    }

    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement))
        && statement.name?.text === name
        && ts.canHaveModifiers(statement)
        && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        return true;
      }

      if (
        ts.isExportAssignment(statement)
        && !statement.isExportEquals
        && ts.isIdentifier(statement.expression)
        && statement.expression.text === name
      ) {
        return true;
      }

      if (
        ts.isExportDeclaration(statement)
        && !statement.moduleSpecifier
        && statement.exportClause
        && ts.isNamedExports(statement.exportClause)
        && statement.exportClause.elements.some(element =>
          element.name.text === 'default' && element.propertyName?.text === name
        )
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 判斷 import specifier 是否解析到目標檔。
   * 解析交由 PathUtils（相對路徑、tsconfig paths 別名、baseUrl），
   * pathsMatch 處理省略副檔名與 index 檔慣例；node_modules 套件 specifier
   * 的解析結果不會命中專案內目標檔、自然排除（界線見 resolveTargetBindings）。
   */
  private async importSpecifierResolvesToTarget(
    importerFilePath: string,
    moduleSpecifier: string,
    targetAbsolute: string
  ): Promise<boolean> {
    const resolved = await this.pathUtils.resolveImportPathAsync(moduleSpecifier, importerFilePath);
    return this.pathUtils.pathsMatch(resolved, targetAbsolute);
  }

  /**
   * 取得專案檔案
   * 遞迴目錄走訪邏輯共用 FileUtils.collectProjectFiles（含排除目錄清單），
   * 不再自行複製一份 collectFiles/skipDirs。
   */
  async getProjectFiles(projectRoot: string): Promise<string[]> {
    return this.fileUtils.collectProjectFiles(projectRoot, FileUtils.isSupportedLanguage);
  }
}

export function createCallSiteBindingResolver(
  parserRegistry: ParserRegistry,
  fileUtils: FileUtils,
  pathUtils: PathUtils,
  symbolFinder: SymbolFinder
): CallSiteBindingResolver {
  return new CallSiteBindingResolver(parserRegistry, fileUtils, pathUtils, symbolFinder);
}
