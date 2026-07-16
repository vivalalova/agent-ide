/**
 * Import 清理器
 * 負責分析和清理未使用的 import
 */

import * as path from 'node:path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import { SOURCE_INDEX_FILES, stripSourceFileExtension } from '@shared/types/index.js';
import {
  resolveBarePathAlias,
  resolveBarePathAliasAsync,
  withLegacyPathAliasWildcards,
  type PathAliasInput
} from '@shared/path-alias-resolver.js';
import { loadTsconfigPathConfigOrWarn } from '@plugins/typescript/tsconfig-loader.js';
import {
  createSymbolFinder,
  SymbolReferenceType,
  type SymbolFinder
} from '@core/foundations/symbol-finder/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ImportCleanupOperation, RemovalOperation } from './types.js';
import { ImportParser, UNICODE_IDENTIFIER_CLASS, type ImportStatementInfo } from './import-parser.js';
import type { DeadCodeCacheService } from './shared-cache.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';

/** type Foo as Bar 別名原名擷取（Unicode 識別符） */
const TYPE_SPECIFIER_AS_ALIAS = new RegExp(
  '^(' + UNICODE_IDENTIFIER_CLASS + ')\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + '$',
  'u'
);

/**
 * Import 清理器
 */
export class ImportCleaner {
  private readonly importParser: ImportParser;
  private readonly symbolFinder: SymbolFinder;

  constructor(
    private readonly fileSystem: IFileSystem,
    parserRegistry: ParserRegistry,
    private readonly cacheService: DeadCodeCacheService,
    pathAliases: PathAliasInput = {},
    private readonly baseUrl?: string
  ) {
    this.pathAliases = withLegacyPathAliasWildcards(pathAliases);
    this.importParser = new ImportParser(parserRegistry);
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
  }

  private readonly pathAliases: PathAliasInput;

  /**
   * 分析需要清理的 import
   * 支援部分清理：當 import { A, B, C } 中只有部分符號未使用時，保留其他符號
   *
   * @param removals 已產生的刪除操作
   * @param projectFiles 專案全部檔案路徑（可選）。提供時除了有刪除項的檔案，也一併掃描這些
   *   consumer 檔案——被刪 export 符號在其他檔案的 import specifier 必須一起清掉，否則 apply
   *   後殘留指向已不存在符號的 import，編譯必壞（N3）。未提供時只掃有刪除項的檔案（向後相容）。
   */
  async analyzeImportCleanups(
    removals: readonly RemovalOperation[],
    projectFiles?: readonly string[]
  ): Promise<{ cleanups: ImportCleanupOperation[]; warnings: string[] }> {
    const cleanups: ImportCleanupOperation[] = [];
    const warnings: string[] = [];
    const removalFiles = removals.map(r => r.filePath);
    // 分組刪除操作的 symbolName 可能是逗號串接（多宣告子 run），拆開還原成個別符號名，
    // 才能正確比對 consumer 端 import 的具名符號
    const removedSymbols = new Set(
      removals.flatMap(r => r.symbolName.split(',').map(name => name.trim()).filter(Boolean))
    );
    const removalFilesSet = new Set(removalFiles);
    // 被刪符號定義檔（去副檔名），用來把 consumer 檔的 import 精準綁回真正被刪的來源模組，
    // 避免「同名但來自其他模組」的 import 被誤清（誤清一個仍在使用的 import 會直接編譯壞掉）
    const removalFilesNoExt = new Set(removalFiles.map(f => stripSourceFileExtension(f)));
    const filesToScan = projectFiles && projectFiles.length > 0
      ? new Set<string>([...removalFiles, ...projectFiles])
      : new Set<string>(removalFiles);
    const configProbePath = removalFiles[0] ?? projectFiles?.[0];
    const discoveredConfig = configProbePath
      ? await loadTsconfigPathConfigOrWarn(path.dirname(configProbePath), this.fileSystem)
      : { pathAliases: {}, baseUrl: undefined };
    const pathAliases = Object.keys(this.pathAliases).length > 0
      ? this.pathAliases
      : discoveredConfig.pathAliases;
    const baseUrl = this.baseUrl ?? discoveredConfig.baseUrl;

    for (const filePath of filesToScan) {
      const content = await this.readFile(filePath);
      if (!content) {
        warnings.push(`跳過 import 清理：無法讀取檔案 ${filePath}`);
        continue;
      }

      // 解析 import 語句（以語句為單位）
      const importStatements = this.importParser.parseImportStatements(content, filePath);
      const fileRemovals = removals.filter(r => r.filePath === filePath);
      // 純 consumer 檔（自身沒有任何刪除項）：只處理來源模組解析到「被刪符號定義檔」的 import，
      // 其餘 import 即使有同名符號也不動。有刪除項的檔案維持既有行為（連帶清理因刪除而
      // 變未使用的其他 import）。
      const isConsumerOnly = !removalFilesSet.has(filePath);

      for (const stmt of importStatements) {
        if (isConsumerOnly && !await this.importFromRemovalFileAsync(
          filePath,
          stmt.statement,
          removalFilesNoExt,
          pathAliases,
          baseUrl
        )) {
          continue;
        }
        // 找出此 import 中需要清理的符號
        const unusedSymbols: string[] = [];
        const usedSymbols: string[] = [];

        for (const symbol of stmt.symbols) {
          // 符號是否在被刪除的列表中，且刪除後不再使用
          // usage 必須用 local binding（alias ?? name）查：`import { foo as bar }` 檔內只會出現 bar
          if (removedSymbols.has(symbol.name)) {
            const localBinding = symbol.alias ?? symbol.name;
            const stillUsed = await this.isImportStillUsed(filePath, localBinding, fileRemovals);
            if (!stillUsed) {
              unusedSymbols.push(symbol.name);
            } else {
              usedSymbols.push(symbol.name);
            }
          } else {
            usedSymbols.push(symbol.name);
          }
        }

        // 沒有需要清理的符號，跳過
        if (unusedSymbols.length === 0) {
          continue;
        }

        // 判斷清理類型
        if (usedSymbols.length === 0) {
          // 所有符號都未使用，刪除整行
          cleanups.push({
            filePath,
            range: stmt.range,
            originalImport: stmt.statement,
            unusedSymbols,
            cleanupType: 'delete'
          });
        } else {
          // 部分符號仍在使用，產生新的 import 語句
          const newImport = this.generatePartialImport(stmt, usedSymbols);
          if (newImport) {
            cleanups.push({
              filePath,
              range: stmt.range,
              originalImport: stmt.statement,
              unusedSymbols,
              cleanupType: 'partial',
              newImport
            });
          }
        }
      }
    }

    return { cleanups, warnings };
  }

  /**
   * 產生部分清理後的 import 語句
   * 支援：純 named import、混合 default + named import
   */
  private generatePartialImport(
    stmt: ImportStatementInfo,
    usedSymbols: string[]
  ): string | null {
    // Namespace import 不支援部分清理（整體使用）
    if (stmt.isNamespace) {
      return null;
    }

    // 從原始語句中提取 from 路徑
    const fromMatch = stmt.statement.match(/from\s+(['"])(.+?)\1/);
    if (!fromMatch) {
      return null;
    }
    const fromPath = fromMatch[2];
    const quote = fromMatch[1];

    // 分離 default 和 named symbols
    const defaultSymbol = stmt.symbols.find(s => s.isDefault);
    const namedSymbols = stmt.symbols.filter(s => !s.isDefault);

    // 檢查 default import 是否仍需保留
    const keepDefault = defaultSymbol && usedSymbols.includes(defaultSymbol.name);

    // per-specifier type 修飾符（如 `import { type Props, render }`）：內部模型
    // （ImportSymbolInfo）不保留此資訊，故直接從原始語句文字重新解析，取得每個
    // named symbol 原始名稱是否帶有 `type ` 前綴，重建時才不會遺失（D3）
    const typeOnlyNames = this.parseNamedSpecifierTypeMarkers(stmt.statement);

    // 過濾出需要保留的 named symbols，並保留別名資訊
    // 同時檢查 name 和 alias，因為 usedSymbols 可能包含別名
    const keptNamedSymbols = namedSymbols
      .filter(s => usedSymbols.includes(s.name) || (s.alias && usedSymbols.includes(s.alias)))
      .map(s => {
        const base = s.alias ? `${s.name} as ${s.alias}` : s.name;
        return typeOnlyNames.has(s.name) ? `type ${base}` : base;
      });

    // 判斷是否需要 type 關鍵字（僅對純 named import）
    const isTypeImport = stmt.statement.match(/import\s+type\s*\{/);
    const typePrefix = isTypeImport ? 'type ' : '';

    // 建構新的 import 語句
    if (keepDefault && defaultSymbol && keptNamedSymbols.length > 0) {
      // 混合格式：import X, { Y, Z } from '...'
      return `import ${defaultSymbol.name}, { ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
    } else if (keepDefault && defaultSymbol) {
      // 只有 default：import X from '...'
      return `import ${defaultSymbol.name} from ${quote}${fromPath}${quote};`;
    } else if (keptNamedSymbols.length > 0) {
      // 只有 named：import { Y, Z } from '...'
      return `import ${typePrefix}{ ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
    }

    // 沒有任何符號需要保留
    return null;
  }

  /**
   * 從原始 import 語句文字解析出帶有 per-specifier `type ` 修飾符的 named symbol
   * 原始名稱集合（如 `import { type Props, render }` → { 'Props' }）
   *
   * 只在整句非 `import type { ... }`（whole-statement type-only）時才有意義，
   * TS 語法不允許 `import type { type Foo }` 疊加修飾符，故無需另外排除。
   */
  private parseNamedSpecifierTypeMarkers(statement: string): Set<string> {
    const typeOnlyNames = new Set<string>();
    const bracesMatch = statement.match(/\{([^}]*)\}/);
    if (!bracesMatch) {
      return typeOnlyNames;
    }

    for (const rawPart of bracesMatch[1].split(',')) {
      const part = rawPart.trim();
      if (!part.startsWith('type ')) {
        continue;
      }
      const rest = part.slice('type '.length).trim();
      const asMatch = rest.match(TYPE_SPECIFIER_AS_ALIAS);
      const originalName = asMatch ? asMatch[1] : rest;
      if (originalName) {
        typeOnlyNames.add(originalName);
      }
    }

    return typeOnlyNames;
  }

  /**
   * 判斷一句 import 的來源模組解析後是否指向任一被刪符號的定義檔。
   * 相對路徑（`.` 開頭）以去副檔名後的絕對路徑精確比對，涵蓋 `./x`（無副檔名）與
   * `./x.js`（ESM 指向 .ts）兩種寫法。
   *
   * 非相對 bare specifier（如 tsconfig path-alias `@app/utils`）：用建構子傳入的真實
   * tsconfig pathAliases 解析出絕對路徑後才比對。無 alias 可解析時一律回傳 false（寧漏
   * 勿誤刪）——舊版曾以「specifier 最後一段」比對被刪檔案 basename 作粗篩，會把
   * `@other/utils` 這種與被刪檔完全無關、只是恰好同 basename＋同符號名的第三方套件
   * import 誤判為指向被刪檔，進而清掉一個仍在使用的 import（見 adversarial R4
   * regression：誤刪比漏刪後果更嚴重，直接讓 consumer 編譯壞掉）。
   */
  private importFromRemovalFile(
    consumerFilePath: string,
    statement: string,
    removalFilesNoExt: ReadonlySet<string>,
    pathAliases: PathAliasInput = this.pathAliases,
    baseUrl: string | undefined = this.baseUrl
  ): boolean {
    const fromMatch = statement.match(/from\s+(['"])(.+?)\1/);
    if (!fromMatch) {
      return false;
    }
    const moduleSpecifier = fromMatch[2];
    if (moduleSpecifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(consumerFilePath), moduleSpecifier);
      return this.matchesRemovalFile(resolved, removalFilesNoExt);
    }

    const resolved = resolveBarePathAlias(moduleSpecifier, pathAliases)
      ?? (baseUrl ? path.resolve(baseUrl, moduleSpecifier) : null);
    if (!resolved) {
      return false;
    }
    return this.matchesRemovalFile(resolved, removalFilesNoExt);
  }

  private async importFromRemovalFileAsync(
    consumerFilePath: string,
    statement: string,
    removalFilesNoExt: ReadonlySet<string>,
    pathAliases: PathAliasInput = this.pathAliases,
    baseUrl: string | undefined = this.baseUrl
  ): Promise<boolean> {
    const fromMatch = statement.match(/from\s+(['"])(.+?)\1/);
    if (!fromMatch) {
      return false;
    }

    const moduleSpecifier = fromMatch[2];
    if (moduleSpecifier.startsWith('.')) {
      return this.importFromRemovalFile(
        consumerFilePath,
        statement,
        removalFilesNoExt,
        pathAliases,
        baseUrl
      );
    }

    const resolved = await resolveBarePathAliasAsync(
      moduleSpecifier,
      pathAliases,
      async candidate => await this.fileSystem.exists(candidate)
        && await this.fileSystem.isFile(candidate)
    ) ?? (baseUrl ? path.resolve(baseUrl, moduleSpecifier) : null);
    return resolved ? this.matchesRemovalFile(resolved, removalFilesNoExt) : false;
  }

  private matchesRemovalFile(
    resolvedPath: string,
    removalFilesNoExt: ReadonlySet<string>
  ): boolean {
    const normalizedPath = stripSourceFileExtension(path.normalize(resolvedPath));
    return removalFilesNoExt.has(normalizedPath)
      || SOURCE_INDEX_FILES.some(indexFile => removalFilesNoExt.has(
        stripSourceFileExtension(`${normalizedPath}${indexFile}`)
      ));
  }

  /**
   * 檢查 import 是否仍被使用
   * 使用快取的引用結果進行語義分析，避免重複查詢
   * @param localBindingName 檔內實際 binding 名（alias ?? 匯出名），不可只用匯出名
   */
  private async isImportStillUsed(
    filePath: string,
    localBindingName: string,
    removalsInFile: readonly RemovalOperation[]
  ): Promise<boolean> {
    // 使用快取查詢引用，避免 N+1 問題
    const references = await this.findReferencesWithCache(filePath, localBindingName);

    // 過濾掉 import 類型的引用（import 語句本身）
    const usageRefs = references.filter(ref => ref.type === SymbolReferenceType.Usage);

    // 過濾掉被刪除程式碼區塊內的引用（使用二分搜尋優化）
    const sortedRemovals = this.getSortedRemovalRanges(removalsInFile);
    const remainingRefs = usageRefs.filter(ref => {
      const refLine = ref.location.range.start.line;
      return !this.isLineInRemovalRange(refLine, sortedRemovals);
    });

    // 如果還有剩餘的使用引用，表示 import 仍需要
    return remainingRefs.length > 0;
  }

  /**
   * 使用共用快取查詢符號引用（local binding 名）
   * 走作用域感知查找：以名稱比對檔內 import binding / 使用點，才能看到
   * `import { foo as bar }` 的 local alias；純 findReferencesInFile 用虛擬 symbol
   * 錨定 LS，別名使用點常得空。
   * 確保每個 (filePath, localBindingName) 組合只查詢一次
   */
  private async findReferencesWithCache(
    filePath: string,
    localBindingName: string
  ): Promise<import('@core/foundations/symbol-finder/index.js').SymbolReference[]> {
    const cached = this.cacheService.getReferences(filePath, localBindingName);
    if (cached) {
      return cached;
    }

    const references = await this.symbolFinder.findScopedReferencesInFile(
      filePath,
      localBindingName
    );
    this.cacheService.setReferences(filePath, localBindingName, references);
    return references;
  }

  /**
   * 取得排序後的刪除範圍（用於二分搜尋）
   */
  private getSortedRemovalRanges(
    removals: readonly RemovalOperation[]
  ): readonly { start: number; end: number }[] {
    return removals
      .map(r => ({ start: r.range.start.line, end: r.range.end.line }))
      .sort((a, b) => a.start - b.start);
  }

  /**
   * 使用二分搜尋檢查行號是否在刪除範圍內
   */
  private isLineInRemovalRange(
    line: number,
    sortedRanges: readonly { start: number; end: number }[]
  ): boolean {
    let left = 0;
    let right = sortedRanges.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const range = sortedRanges[mid];

      if (line >= range.start && line <= range.end) {
        return true;
      } else if (line < range.start) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return false;
  }

  /**
   * 讀取檔案（使用共用快取）
   */
  private async readFile(filePath: string): Promise<string | null> {
    const cached = this.cacheService.getFile(filePath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      this.cacheService.setFile(filePath, contentStr);
      return contentStr;
    } catch (error) {
      diagnostics.warn('deadcode/import-cleaner', 'FILE_READ_ERROR', `Failed to read file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      return null;
    }
  }
}

/**
 * 建立 ImportCleaner 實例
 */
export function createImportCleaner(
  fileSystem: IFileSystem,
  parserRegistry: ParserRegistry,
  cacheService: DeadCodeCacheService,
  pathAliases?: PathAliasInput,
  baseUrl?: string
): ImportCleaner {
  return new ImportCleaner(fileSystem, parserRegistry, cacheService, pathAliases, baseUrl);
}
