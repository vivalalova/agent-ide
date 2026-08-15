/**
 * IndexCacheSerializer
 * 序列化/反序列化 FileIndex 到 JSON 格式，用於磁碟持久化
 */

import type { Symbol, Scope, ScopeType, Dependency } from '@shared/types/index.js';
import { SymbolType, DependencyType } from '@shared/types/index.js';
import type { FileInfo, FileIndexEntry } from './types.js';

export const CACHE_VERSION = '1.1.1';

/**
 * 序列化後的 Scope（tree → flat parent path）
 */
interface SerializedScope {
  readonly type: ScopeType;
  readonly name: string | undefined;
  readonly parentPath: string | undefined; // "global:anonymous/class:MyClass/function:foo"
}

/**
 * 序列化後的 Symbol
 */
interface SerializedSymbol {
  readonly name: string;
  readonly type: SymbolType;
  readonly location: {
    readonly filePath: string;
    readonly range: {
      readonly start: { readonly line: number; readonly column: number };
      readonly end: { readonly line: number; readonly column: number };
    };
  };
  readonly scope: SerializedScope | undefined;
  readonly modifiers: readonly string[];
  readonly attributes: readonly string[] | undefined;
  readonly superclass: string | undefined;
  readonly implements: readonly string[] | undefined;
  readonly isImported?: boolean;
}

/**
 * 序列化後的 FileInfo
 */
interface SerializedFileInfo {
  readonly filePath: string;
  readonly lastModified: string; // ISO string
  readonly size: number;
  readonly extension: string;
  readonly language: string | undefined;
  readonly checksum: string;
}

/**
 * 序列化後的 Dependency
 */
interface SerializedDependency {
  readonly path: string;
  readonly type: DependencyType;
  readonly isRelative: boolean;
  readonly importedSymbols: readonly string[];
  readonly isTypeOnly: boolean | undefined;
}

/**
 * 序列化後的 FileIndexEntry
 */
export interface SerializedFileIndexEntry {
  readonly fileInfo: SerializedFileInfo;
  readonly symbols: readonly SerializedSymbol[];
  readonly dependencies: readonly SerializedDependency[];
  readonly isIndexed: boolean;
  readonly lastIndexed: string | undefined; // ISO string
  readonly parseErrors: readonly string[];
}

/**
 * 序列化後的完整索引資料
 */
export interface SerializedIndexData {
  readonly version: string;
  readonly cacheKey: string;
  readonly fileEntries: Array<{ key: string; value: SerializedFileIndexEntry }>;
  readonly timestamp: string; // ISO string
}

/**
 * IndexCacheSerializer
 * 負責將 FileIndex 的 entries 序列化為 JSON 可儲存格式，
 * 以及從 JSON 還原為 Map<string, FileIndexEntry>
 */
export class IndexCacheSerializer {

  /**
   * 序列化 fileEntries（不含 cacheKey，由呼叫方填入）
   */
  serialize(
    entries: ReadonlyMap<string, FileIndexEntry>
  ): Omit<SerializedIndexData, 'cacheKey'> {
    const fileEntries: Array<{ key: string; value: SerializedFileIndexEntry }> = [];

    for (const [key, entry] of entries) {
      fileEntries.push({
        key,
        value: this.serializeEntry(entry)
      });
    }

    return {
      version: CACHE_VERSION,
      fileEntries,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 從序列化資料還原 Map<string, FileIndexEntry>
   * version 不符時拋錯
   */
  deserialize(data: SerializedIndexData): Map<string, FileIndexEntry> {
    if (data.version !== CACHE_VERSION) {
      throw new Error(`Cache version mismatch: expected ${CACHE_VERSION}, got ${data.version}`);
    }

    const result = new Map<string, FileIndexEntry>();

    for (const { key, value } of data.fileEntries) {
      result.set(key, this.deserializeEntry(value));
    }

    return result;
  }

  // ── private: entry ──

  private serializeEntry(entry: FileIndexEntry): SerializedFileIndexEntry {
    return {
      fileInfo: this.serializeFileInfo(entry.fileInfo),
      symbols: entry.symbols.map(s => this.serializeSymbol(s)),
      dependencies: entry.dependencies.map(d => this.serializeDependency(d)),
      isIndexed: entry.isIndexed,
      lastIndexed: entry.lastIndexed?.toISOString(),
      parseErrors: [...entry.parseErrors]
    };
  }

  private deserializeEntry(entry: SerializedFileIndexEntry): FileIndexEntry {
    return {
      fileInfo: this.deserializeFileInfo(entry.fileInfo),
      symbols: entry.symbols.map(s => this.deserializeSymbol(s)),
      dependencies: entry.dependencies.map(d => this.deserializeDependency(d)),
      isIndexed: entry.isIndexed,
      lastIndexed: entry.lastIndexed ? new Date(entry.lastIndexed) : undefined,
      parseErrors: [...entry.parseErrors]
    };
  }

  // ── private: FileInfo ──

  private serializeFileInfo(info: FileInfo): SerializedFileInfo {
    return {
      filePath: info.filePath,
      lastModified: info.lastModified.toISOString(),
      size: info.size,
      extension: info.extension,
      language: info.language,
      checksum: info.checksum
    };
  }

  private deserializeFileInfo(info: SerializedFileInfo): FileInfo {
    return {
      filePath: info.filePath,
      lastModified: new Date(info.lastModified),
      size: info.size,
      extension: info.extension,
      language: info.language,
      checksum: info.checksum
    };
  }

  // ── private: Symbol ──

  private serializeSymbol(symbol: Symbol): SerializedSymbol {
    return {
      name: symbol.name,
      type: symbol.type,
      location: {
        filePath: symbol.location.filePath,
        range: {
          start: {
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          end: {
            line: symbol.location.range.end.line,
            column: symbol.location.range.end.column
          }
        }
      },
      scope: symbol.scope ? this.serializeScope(symbol.scope) : undefined,
      modifiers: [...symbol.modifiers],
      attributes: symbol.attributes ? [...symbol.attributes] : undefined,
      superclass: symbol.superclass,
      implements: symbol.implements ? [...symbol.implements] : undefined,
      isImported: (symbol as { isImported?: boolean }).isImported
    };
  }

  private deserializeSymbol(symbol: SerializedSymbol): Symbol {
    return {
      name: symbol.name,
      type: symbol.type as SymbolType,
      location: {
        filePath: symbol.location.filePath,
        range: {
          start: {
            line: symbol.location.range.start.line,
            column: symbol.location.range.start.column
          },
          end: {
            line: symbol.location.range.end.line,
            column: symbol.location.range.end.column
          }
        }
      },
      scope: symbol.scope ? this.deserializeScope(symbol.scope) : undefined,
      modifiers: [...symbol.modifiers],
      ...(symbol.attributes !== undefined ? { attributes: [...symbol.attributes] } : {}),
      ...(symbol.superclass !== undefined ? { superclass: symbol.superclass } : {}),
      ...(symbol.implements !== undefined ? { implements: [...symbol.implements] } : {}),
      ...(symbol.isImported !== undefined ? { isImported: symbol.isImported } : {})
    } as Symbol;
  }

  // ── private: Scope（flatten parent to path string） ──

  /**
   * Scope tree → flat: 記錄 parentPath string 而非 parent 物件參照
   * parentPath = ancestor chain joined by "/"
   * e.g. "global:anonymous/class:MyClass"
   */
  private serializeScope(scope: Scope): SerializedScope {
    const parentPath = scope.parent
      ? this.buildScopePathString(scope.parent)
      : undefined;

    return {
      type: scope.type,
      name: scope.name,
      parentPath
    };
  }

  /**
   * 將 scope 及其所有祖先轉為 path string
   */
  private buildScopePathString(scope: Scope): string {
    const parts: string[] = [];
    let current: Scope | undefined = scope;
    while (current) {
      parts.unshift(`${current.type}:${current.name ?? 'anonymous'}`);
      current = current.parent;
    }
    return parts.join('/');
  }

  /**
   * 從 SerializedScope 還原 Scope（parent 為 undefined，不重建整棵樹）
   * 因為 SymbolIndex 只用 getScopeKey（遍歷 parent chain），
   * 缺少 parent 時 scope key 為當層路徑，查詢仍可用
   */
  private deserializeScope(scope: SerializedScope): Scope {
    // 如果有 parentPath，重建 parent chain
    let parent: Scope | undefined = undefined;
    if (scope.parentPath) {
      parent = this.rebuildScopeChain(scope.parentPath);
    }

    return {
      type: scope.type as ScopeType,
      name: scope.name,
      parent
    };
  }

  /**
   * 從 parentPath string 重建 Scope chain
   * e.g. "global:anonymous/class:MyClass" → Scope{ type: 'global', name: undefined, parent: undefined }
   *       wrapped in Scope{ type: 'class', name: 'MyClass', parent: <above> }
   */
  private rebuildScopeChain(pathString: string): Scope {
    const parts = pathString.split('/');
    let current: Scope | undefined = undefined;

    for (const part of parts) {
      const colonIdx = part.indexOf(':');
      const type = part.substring(0, colonIdx) as ScopeType;
      const nameRaw = part.substring(colonIdx + 1);
      const name = nameRaw === 'anonymous' ? undefined : nameRaw;

      current = { type, name, parent: current };
    }

    // current 不可能是 undefined，因為 parts 至少有一個元素
    return current as Scope;
  }

  // ── private: Dependency ──

  private serializeDependency(dep: Dependency): SerializedDependency {
    return {
      path: dep.path,
      type: dep.type,
      isRelative: dep.isRelative,
      importedSymbols: [...dep.importedSymbols],
      isTypeOnly: dep.isTypeOnly
    };
  }

  private deserializeDependency(dep: SerializedDependency): Dependency {
    return {
      path: dep.path,
      type: dep.type as DependencyType,
      isRelative: dep.isRelative,
      importedSymbols: [...dep.importedSymbols],
      ...(dep.isTypeOnly !== undefined ? { isTypeOnly: dep.isTypeOnly } : {})
    };
  }
}
