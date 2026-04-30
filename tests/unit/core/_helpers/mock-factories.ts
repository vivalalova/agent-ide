/**
 * 共用 Mock 工廠函數
 * 供 core 模組 unit test 使用
 */

import { vi } from 'vitest';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { FileStats } from '@infrastructure/storage/types.js';
import { SymbolType } from '@shared/types/symbol.js';
import type { Symbol } from '@shared/types/symbol.js';

/** 建立 mock 的 ParserPlugin */
export function createMockParser(overrides?: Partial<ParserPlugin>): ParserPlugin {
  return {
    name: 'mock-parser',
    version: '1.0.0',
    supportedExtensions: ['.ts', '.js'],
    supportedLanguages: ['typescript', 'javascript'],
    parse: vi.fn().mockResolvedValue({ tsSourceFile: {} }),
    extractSymbols: vi.fn().mockResolvedValue([]),
    findReferences: vi.fn().mockResolvedValue([]),
    extractDependencies: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue([]),
    findDefinition: vi.fn().mockResolvedValue(null),
    findUsages: vi.fn().mockResolvedValue([]),
    validate: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}

/** 建立 mock 的 ParserRegistry */
export function createMockParserRegistry(parser?: ParserPlugin | null): ParserRegistry {
  const mockParser = parser === null ? null : (parser || createMockParser());
  return {
    getParser: vi.fn().mockReturnValue(mockParser)
  } as unknown as ParserRegistry;
}

/** 建立 FileStats mock 預設值 */
export function createMockFileStats(overrides?: Partial<FileStats>): FileStats {
  const now = new Date();
  return {
    isFile: true,
    isDirectory: false,
    size: 0,
    createdTime: now,
    modifiedTime: now,
    accessedTime: now,
    mode: 0o644,
    ...overrides
  };
}

/** 建立 mock 的 IFileSystem */
export function createMockFileSystem(files: Record<string, string> = {}): IFileSystem {
  return {
    readFile: vi.fn().mockImplementation(async (filePath: string) => {
      if (filePath in files) {
        return files[filePath];
      }
      throw new Error(`File not found: ${filePath}`);
    }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    readDirectory: vi.fn().mockResolvedValue([]),
    deleteDirectory: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockImplementation(async (filePath: string) => filePath in files),
    getStats: vi.fn().mockResolvedValue(createMockFileStats()),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

/** 建立 mock 的 Symbol */
export function createMockSymbol(
  name: string,
  type: SymbolType = SymbolType.Function,
  filePath = '/src/foo.ts'
): Symbol {
  return {
    name,
    type,
    location: {
      filePath,
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: name.length + 1 }
      }
    },
    scope: undefined,
    modifiers: []
  };
}
