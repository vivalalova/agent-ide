/**
 * Import 清理器
 * 負責分析和清理未使用的 import
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import {
  createSymbolFinder,
  SymbolReferenceType,
  type SymbolFinder,
  type SymbolReference
} from '@core/foundations/symbol-finder/index.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ImportCleanupOperation, RemovalOperation } from './types.js';
import { ImportParser, type ImportStatementInfo } from './import-parser.js';

/**
 * Import 清理器
 */
export class ImportCleaner {
  private readonly importParser: ImportParser;
  private readonly symbolFinder: SymbolFinder;
  private readonly fileCache = new Map<string, string>();
  /** 符號引用快取：key = `${filePath}:${symbolName}` */
  private readonly referenceCache = new Map<string, SymbolReference[]>();

  constructor(
    private readonly fileSystem: IFileSystem,
    parserRegistry: ParserRegistry
  ) {
    this.importParser = new ImportParser(parserRegistry);
    this.symbolFinder = createSymbolFinder(parserRegistry, fileSystem);
  }

  /**
   * 分析需要清理的 import
   * 支援部分清理：當 import { A, B, C } 中只有部分符號未使用時，保留其他符號
   */
  async analyzeImportCleanups(
    removals: readonly RemovalOperation[]
  ): Promise<{ cleanups: ImportCleanupOperation[]; warnings: string[] }> {
    const cleanups: ImportCleanupOperation[] = [];
    const warnings: string[] = [];
    const affectedFiles = new Set(removals.map(r => r.filePath));
    const removedSymbols = new Set(removals.map(r => r.symbolName));

    for (const filePath of affectedFiles) {
      const content = await this.readFile(filePath);
      if (!content) {
        warnings.push(`跳過 import 清理：無法讀取檔案 ${filePath}`);
        continue;
      }

      // 解析 import 語句（以語句為單位）
      const importStatements = this.importParser.parseImportStatements(content, filePath);
      const fileRemovals = removals.filter(r => r.filePath === filePath);

      for (const stmt of importStatements) {
        // 找出此 import 中需要清理的符號
        const unusedSymbols: string[] = [];
        const usedSymbols: string[] = [];

        for (const symbol of stmt.symbols) {
          // 符號是否在被刪除的列表中，且刪除後不再使用
          if (removedSymbols.has(symbol.name)) {
            const stillUsed = await this.isImportStillUsed(filePath, symbol.name, fileRemovals);
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

    // 過濾出需要保留的 named symbols，並保留別名資訊
    // 同時檢查 name 和 alias，因為 usedSymbols 可能包含別名
    const keptNamedSymbols = namedSymbols
      .filter(s => usedSymbols.includes(s.name) || (s.alias && usedSymbols.includes(s.alias)))
      .map(s => s.alias ? `${s.name} as ${s.alias}` : s.name);

    // 判斷是否需要 type 關鍵字（僅對純 named import）
    const isTypeImport = stmt.statement.match(/import\s+type\s*\{/);
    const typePrefix = isTypeImport ? 'type ' : '';

    // 建構新的 import 語句
    if (keepDefault && keptNamedSymbols.length > 0) {
      // 混合格式：import X, { Y, Z } from '...'
      return `import ${defaultSymbol!.name}, { ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
    } else if (keepDefault) {
      // 只有 default：import X from '...'
      return `import ${defaultSymbol!.name} from ${quote}${fromPath}${quote};`;
    } else if (keptNamedSymbols.length > 0) {
      // 只有 named：import { Y, Z } from '...'
      return `import ${typePrefix}{ ${keptNamedSymbols.join(', ')} } from ${quote}${fromPath}${quote};`;
    }

    // 沒有任何符號需要保留
    return null;
  }

  /**
   * 檢查 import 是否仍被使用
   * 使用快取的引用結果進行語義分析，避免重複查詢
   */
  private async isImportStillUsed(
    filePath: string,
    symbolName: string,
    removalsInFile: readonly RemovalOperation[]
  ): Promise<boolean> {
    // 使用快取查詢引用，避免 N+1 問題
    const references = await this.findReferencesWithCache(filePath, symbolName);

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
   * 使用快取查詢符號引用
   * 確保每個 (filePath, symbolName) 組合只查詢一次
   */
  private async findReferencesWithCache(
    filePath: string,
    symbolName: string
  ): Promise<SymbolReference[]> {
    const cacheKey = `${filePath}:${symbolName}`;

    if (this.referenceCache.has(cacheKey)) {
      return this.referenceCache.get(cacheKey)!;
    }

    const references = await this.symbolFinder.findReferencesInFile(filePath, symbolName);
    this.referenceCache.set(cacheKey, references);
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
   * 讀取檔案
   */
  private async readFile(filePath: string): Promise<string | null> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      this.fileCache.set(filePath, contentStr);
      return contentStr;
    } catch {
      this.fileCache.delete(filePath);
      return null;
    }
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.fileCache.clear();
    this.referenceCache.clear();
  }
}

/**
 * 建立 ImportCleaner 實例
 */
export function createImportCleaner(
  fileSystem: IFileSystem,
  parserRegistry: ParserRegistry
): ImportCleaner {
  return new ImportCleaner(fileSystem, parserRegistry);
}
