/**
 * SignatureParser 單元測試
 * 測試 AST 解析與 Fallback 邏輯
 */

import { describe, it, expect, vi } from 'vitest';
import { SignatureParser, createSignatureParser } from '@core/change-signature/signature-parser.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';

// ===== Mock 工具函數 =====

/**
 * 建立 mock 的 ParserPlugin
 */
function createMockParser(overrides?: Partial<ParserPlugin>): ParserPlugin {
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

/**
 * 建立 mock 的 ParserRegistry
 */
function createMockParserRegistry(parser?: ParserPlugin | null): ParserRegistry {
  const mockParser = parser === null ? null : (parser || createMockParser());
  return {
    getParser: vi.fn().mockReturnValue(mockParser)
  } as unknown as ParserRegistry;
}

/**
 * 建立 mock 的 IFileSystem
 */
function createMockFileSystem(files: Record<string, string> = {}): IFileSystem {
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
    getStats: vi.fn().mockResolvedValue({ isFile: true, isDirectory: false, size: 0 }),
    isFile: vi.fn().mockResolvedValue(true),
    isDirectory: vi.fn().mockResolvedValue(false),
    copyFile: vi.fn().mockResolvedValue(undefined),
    moveFile: vi.fn().mockResolvedValue(undefined),
    glob: vi.fn().mockResolvedValue([])
  } as unknown as IFileSystem;
}

describe('SignatureParser', () => {
  // MARK: - Test Infrastructure

  const createSut = (
    parserRegistry: ParserRegistry = createMockParserRegistry(),
    fileSystem: IFileSystem = createMockFileSystem()
  ): SignatureParser => {
    return createSignatureParser(parserRegistry, fileSystem);
  };

  // MARK: - AST Fallback 測試

  describe('AST 解析失敗時 Fallback 到正則表達式', () => {
    it('Parser 不存在時應 fallback 到正則解析', async () => {
      // Given
      const code = `function greet(name: string): string {
  return 'Hello ' + name;
}`;
      const files = { '/test.ts': code };
      const parserRegistry = createMockParserRegistry(null); // 無 parser
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/test.ts', 'greet');

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe('greet');
      expect(result?.parameters).toHaveLength(1);
      expect(result?.parameters[0].name).toBe('name');
    });

    it('Parser 沒有 formatSignature 方法時應 fallback', async () => {
      // Given
      const code = `export async function fetchData(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options);
}`;
      const files = { '/api.ts': code };
      const parser = createMockParser({ formatSignature: undefined });
      const parserRegistry = createMockParserRegistry(parser);
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/api.ts', 'fetchData');

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe('fetchData');
      expect(result?.modifiers).toContain('export');
      expect(result?.modifiers).toContain('async');
    });

    it('formatSignature 回傳 null 時應 fallback', async () => {
      // Given
      const code = 'const add = (a: number, b: number): number => a + b;';
      const files = { '/math.ts': code };
      const parser = createMockParser({
        formatSignature: vi.fn().mockReturnValue(null)
      });
      const parserRegistry = createMockParserRegistry(parser);
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/math.ts', 'add');

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe('add');
      expect(result?.parameters).toHaveLength(2);
    });
  });

  // MARK: - 不支援的檔案類型

  describe('不支援的檔案類型', () => {
    it('不支援的副檔名應回傳 null', async () => {
      // Given
      const files = { '/test.py': 'def greet(name): pass' };
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(createMockParserRegistry(), fileSystem);

      // When
      const result = await sut.parseSignature('/test.py', 'greet');

      // Then
      expect(result).toBeNull();
    });

    it('無副檔名應回傳 null', async () => {
      // Given
      const files = { '/Makefile': 'greet:' };
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(createMockParserRegistry(), fileSystem);

      // When
      const result = await sut.parseSignature('/Makefile', 'greet');

      // Then
      expect(result).toBeNull();
    });
  });

  // MARK: - 檔案讀取失敗

  describe('檔案讀取失敗', () => {
    it('檔案不存在應回傳 null', async () => {
      // Given
      const fileSystem = createMockFileSystem({}); // 空檔案系統
      const sut = createSut(createMockParserRegistry(), fileSystem);

      // When
      const result = await sut.parseSignature('/nonexistent.ts', 'greet');

      // Then
      expect(result).toBeNull();
    });
  });

  // MARK: - 正則解析各種函數形式

  describe('正則解析各種函數形式', () => {
    it.each([
      {
        scenario: '一般函數宣告',
        code: 'function greet(name: string): string { return name; }',
        functionName: 'greet',
        expectedParams: ['name']
      },
      {
        scenario: 'export 函數',
        code: 'export function greet(name: string): void {}',
        functionName: 'greet',
        expectedParams: ['name'],
        expectedModifiers: ['export']
      },
      {
        scenario: 'async 函數',
        code: 'async function fetchData(url: string): Promise<string> {}',
        functionName: 'fetchData',
        expectedParams: ['url'],
        expectedModifiers: ['async']
      },
      {
        scenario: 'export async 函數',
        code: 'export async function processData(data: Data): Promise<Result> {}',
        functionName: 'processData',
        expectedParams: ['data'],
        expectedModifiers: ['export', 'async']
      },
      {
        scenario: '箭頭函式',
        code: 'const add = (a: number, b: number): number => a + b;',
        functionName: 'add',
        expectedParams: ['a', 'b']
      },
      {
        scenario: 'export 箭頭函式',
        code: 'export const multiply = (x: number, y: number) => x * y;',
        functionName: 'multiply',
        expectedParams: ['x', 'y'],
        expectedModifiers: ['export']
      },
      {
        scenario: '多參數函數',
        code: 'function createUser(name: string, age: number, email: string): User {}',
        functionName: 'createUser',
        expectedParams: ['name', 'age', 'email']
      },
      {
        scenario: '無參數函數',
        code: 'function getTimestamp(): number { return Date.now(); }',
        functionName: 'getTimestamp',
        expectedParams: []
      },
      {
        scenario: '可選參數',
        code: 'function greet(name?: string): string { return name ?? \'World\'; }',
        functionName: 'greet',
        expectedParams: ['name']
      },
      {
        scenario: '預設值參數',
        code: 'function greet(name: string = \'World\'): string { return name; }',
        functionName: 'greet',
        expectedParams: ['name']
      },
      {
        scenario: 'rest 參數',
        code: 'function sum(...numbers: number[]): number { return 0; }',
        functionName: 'sum',
        expectedParams: ['numbers']
      }
    ])('$scenario', async ({ code, functionName, expectedParams, expectedModifiers }) => {
      // Given
      const files = { '/test.ts': code };
      const parserRegistry = createMockParserRegistry(null); // 強制使用 fallback
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/test.ts', functionName);

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe(functionName);
      expect(result?.parameters.map(p => p.name)).toEqual(expectedParams);
      if (expectedModifiers) {
        expect(result?.modifiers).toEqual(expect.arrayContaining(expectedModifiers));
      }
    });
  });

  // MARK: - Class 方法解析

  describe('Class 方法解析', () => {
    it.each([
      {
        scenario: '公開方法',
        code: `class Service {
  public getData(id: string): Data {}
}`,
        functionName: 'getData',
        expectedModifiers: ['public'],
        isMethod: true
      },
      {
        scenario: '私有方法',
        code: `class Service {
  private validate(input: string): boolean {}
}`,
        functionName: 'validate',
        expectedModifiers: ['private'],
        isMethod: true
      },
      {
        scenario: '靜態方法',
        code: `class Utils {
  static parse(json: string): object {}
}`,
        functionName: 'parse',
        expectedModifiers: ['static'],
        isMethod: true
      },
      {
        scenario: 'async 方法',
        code: `class Api {
  async fetch(url: string): Promise<Response> {}
}`,
        functionName: 'fetch',
        expectedModifiers: ['async'],
        isMethod: true
      },
      {
        scenario: 'protected static async 方法',
        code: `class Base {
  protected static async loadConfig(path: string): Promise<Config> {}
}`,
        functionName: 'loadConfig',
        expectedModifiers: ['protected', 'static', 'async'],
        isMethod: true
      }
    ])('$scenario', async ({ code, functionName, expectedModifiers, isMethod }) => {
      // Given
      const files = { '/service.ts': code };
      const parserRegistry = createMockParserRegistry(null);
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/service.ts', functionName);

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe(functionName);
      expect(result?.isMethod).toBe(isMethod);
      expect(result?.modifiers).toEqual(expect.arrayContaining(expectedModifiers));
    });
  });

  // MARK: - JavaScript 解析

  describe('JavaScript 解析', () => {
    it('JS 檔案應移除型別資訊', async () => {
      // Given
      const code = 'function greet(name) { return \'Hello \' + name; }';
      const files = { '/test.js': code };
      const parserRegistry = createMockParserRegistry(null);
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/test.js', 'greet');

      // Then
      expect(result).not.toBeNull();
      expect(result?.name).toBe('greet');
      expect(result?.returnType).toBeUndefined();
      expect(result?.parameters[0].type).toBeUndefined();
    });
  });

  // MARK: - 函數找不到

  describe('函數找不到', () => {
    it('函數名稱不存在應回傳 null', async () => {
      // Given
      const code = 'function foo() {}';
      const files = { '/test.ts': code };
      const parserRegistry = createMockParserRegistry(null);
      const fileSystem = createMockFileSystem(files);
      const sut = createSut(parserRegistry, fileSystem);

      // When
      const result = await sut.parseSignature('/test.ts', 'bar');

      // Then
      expect(result).toBeNull();
    });
  });

  // MARK: - 工廠函數

  describe('createSignatureParser', () => {
    it('應建立 SignatureParser 實例', () => {
      // Given
      const parserRegistry = createMockParserRegistry();
      const fileSystem = createMockFileSystem();

      // When
      const parser = createSignatureParser(parserRegistry, fileSystem);

      // Then
      expect(parser).toBeInstanceOf(SignatureParser);
    });
  });
});
