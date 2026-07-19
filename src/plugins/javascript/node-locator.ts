/**
 * JavaScript 節點位置查找與符號分類
 *
 * 提供依位置定位符號（以行號索引 + LRU 快取加速）、以及符號類型分類，
 * 供 parser.ts（rename、findDefinition）共用。
 */

import type { DefinitionKind } from '@infrastructure/parser/index.js';
import type { Symbol, Position, Range } from '@shared/types/index.js';
import { SymbolType } from '@shared/types/index.js';
import { computeContentHash } from '@plugins/shared/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { JavaScriptAST } from './types.js';
import type { JavaScriptSymbolExtractor } from './symbol-extractor.js';

/**
 * 符號行索引快取
 * 用於快速查找特定位置的符號
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */
interface SymbolIndexCache {
  /** 符號列表 */
  symbols: Symbol[];
  /** 按行號索引的符號 Map */
  lineIndex: Map<number, Symbol[]>;
  /** 內容雜湊（用於驗證快取有效性） */
  contentHash: string;
}

export function symbolTypeToDefinitionKind(symbolType: SymbolType): DefinitionKind {
  switch (symbolType) {
  case SymbolType.Class:
    return 'class';
  case SymbolType.Function:
    return 'function';
  case SymbolType.Variable:
    return 'variable';
  case SymbolType.Constant:
    return 'constant';
  case SymbolType.Type:
    return 'type';
  case SymbolType.Interface:
    return 'interface';
  case SymbolType.Enum:
    return 'enum';
  case SymbolType.Module:
    return 'module';
  case SymbolType.Namespace:
    return 'namespace';
  default:
    return 'variable';
  }
}

/**
 * JavaScript 節點位置查找器類別
 * 持有符號索引快取（依 filePath + content hash 驗證）
 */
export class JavaScriptNodeLocator {
  /** 符號索引快取（以檔案路徑為 key，LRU 由 MemoryCache 自動處理） */
  private readonly symbolIndexCache: MemoryCache<string, SymbolIndexCache> = createLRUCache(100);

  /**
   * 建立或取得符號索引快取
   * 使用行號索引避免 O(n) 線性搜尋
   * 快取基於 filePath + content hash，避免內容變更後使用舊快取
   * 注意：LRU 淘汰由 MemoryCache 自動處理
   */
  private async getOrCreateSymbolIndex(
    ast: JavaScriptAST,
    symbolExtractor: JavaScriptSymbolExtractor
  ): Promise<SymbolIndexCache> {
    const cacheKey = ast.sourceFile;
    const contentHash = computeContentHash(ast.sourceCode);
    const cached = this.symbolIndexCache.get(cacheKey);

    // 驗證快取：檔案存在且 hash 相同（MemoryCache.get() 自動更新 lastAccessedAt）
    if (cached && cached.contentHash === contentHash) {
      return cached;
    }

    const symbols = await symbolExtractor.extractSymbols(ast);
    const lineIndex = new Map<number, Symbol[]>();

    // 建立行號索引：每個符號可能跨越多行
    for (const symbol of symbols) {
      const startLine = symbol.location.range.start.line;
      const endLine = symbol.location.range.end.line;

      for (let line = startLine; line <= endLine; line++) {
        const existing = lineIndex.get(line) ?? [];
        existing.push(symbol);
        lineIndex.set(line, existing);
      }
    }

    const cache: SymbolIndexCache = { symbols, lineIndex, contentHash };
    this.symbolIndexCache.set(cacheKey, cache); // MemoryCache 自動處理 LRU 淘汰

    return cache;
  }

  /**
   * 清除特定檔案的符號索引快取
   */
  clearSymbolIndexCache(filePath?: string): void {
    if (filePath) {
      this.symbolIndexCache.delete(filePath);
    } else {
      this.symbolIndexCache.clear();
    }
  }

  async findSymbolAtPosition(
    ast: JavaScriptAST,
    position: Position,
    symbolExtractor: JavaScriptSymbolExtractor
  ): Promise<Symbol | null> {
    const cache = await this.getOrCreateSymbolIndex(ast, symbolExtractor);

    // 使用行號索引快速查找候選符號
    const candidates = cache.lineIndex.get(position.line) ?? [];

    // 只在候選符號中搜尋
    for (const symbol of candidates) {
      if (this.isPositionInRange(position, symbol.location.range)) {
        return symbol;
      }
    }

    return null;
  }

  private isPositionInRange(position: Position, range: Range): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
      return false;
    }

    if (position.line === range.start.line && position.column < range.start.column) {
      return false;
    }

    if (position.line === range.end.line && position.column > range.end.column) {
      return false;
    }

    return true;
  }
}
