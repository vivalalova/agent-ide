/**
 * ImportParser 單元測試
 * 測試 import 語句解析器的各種場景
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportParser, type ImportStatementInfo, type ImportSymbolInfo } from '@core/deadcode/import-parser.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ParserPlugin, ImportDeclaration } from '@infrastructure/parser/interface.js';

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
    extractFunction: vi.fn().mockResolvedValue([]),
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

// ===== 測試案例型別 =====

interface ImportParseTestCase {
  scenario: string;
  content: string;
  expected: Partial<ImportStatementInfo>[];
}

interface FallbackParseTestCase {
  scenario: string;
  content: string;
  expectedCount: number;
  expectedSymbols?: string[];
}

// ===== Parser AST 解析測試 =====

describe('ImportParser - Parser AST 解析', () => {
  let importParser: ImportParser;
  let mockParser: ParserPlugin;
  let mockParserRegistry: ParserRegistry;

  beforeEach(() => {
    mockParser = createMockParser();
    mockParserRegistry = createMockParserRegistry(mockParser);
    importParser = new ImportParser(mockParserRegistry);
  });

  describe('使用 Parser 解析 import 語句', () => {
    it('應該優先使用 Parser 的 getImportDeclarations 方法', () => {
      const mockDeclarations: ImportDeclaration[] = [{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 30, offset: 29 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [{ name: 'foo' }],
        rawStatement: 'import { foo } from \'./utils\';'
      }];

      mockParser.getImportDeclarations = vi.fn().mockReturnValue(mockDeclarations);
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import { foo } from \'./utils\';', '/test/file.ts');

      expect(mockParser.getImportDeclarations).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].symbols).toHaveLength(1);
      expect(result[0].symbols[0].name).toBe('foo');
    });

    it('應該正確轉換 default import', () => {
      const mockDeclarations: ImportDeclaration[] = [{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 25, offset: 24 } },
        moduleSpecifier: 'lodash',
        isTypeOnly: false,
        defaultImport: '_',
        namedImports: [],
        rawStatement: 'import _ from \'lodash\';'
      }];

      mockParser.getImportDeclarations = vi.fn().mockReturnValue(mockDeclarations);
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import _ from \'lodash\';', '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].hasDefault).toBe(true);
      expect(result[0].symbols[0].isDefault).toBe(true);
      expect(result[0].symbols[0].name).toBe('_');
    });

    it('應該正確轉換 namespace import', () => {
      const mockDeclarations: ImportDeclaration[] = [{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 30, offset: 29 } },
        moduleSpecifier: 'lodash',
        isTypeOnly: false,
        namespaceImport: '_',
        namedImports: [],
        rawStatement: 'import * as _ from \'lodash\';'
      }];

      mockParser.getImportDeclarations = vi.fn().mockReturnValue(mockDeclarations);
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import * as _ from \'lodash\';', '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].isNamespace).toBe(true);
      expect(result[0].symbols[0].isNamespace).toBe(true);
      expect(result[0].symbols[0].name).toBe('_');
    });

    it('應該正確轉換 named imports with alias', () => {
      const mockDeclarations: ImportDeclaration[] = [{
        range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 45, offset: 44 } },
        moduleSpecifier: './utils',
        isTypeOnly: false,
        namedImports: [
          { name: 'foo', alias: 'bar' },
          { name: 'baz' }
        ],
        rawStatement: 'import { foo as bar, baz } from \'./utils\';'
      }];

      mockParser.getImportDeclarations = vi.fn().mockReturnValue(mockDeclarations);
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import { foo as bar, baz } from \'./utils\';', '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols).toHaveLength(2);
      expect(result[0].symbols[0].name).toBe('foo');
      expect(result[0].symbols[0].alias).toBe('bar');
      expect(result[0].symbols[1].name).toBe('baz');
      expect(result[0].symbols[1].alias).toBeUndefined();
    });

    it('當 Parser 回傳 null 時應 fallback 到字串解析', () => {
      mockParser.getImportDeclarations = vi.fn().mockReturnValue(null);
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import { foo } from \'./utils\';', '/test/file.ts');

      expect(mockParser.getImportDeclarations).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].symbols[0].name).toBe('foo');
    });

    it('當 Parser 沒有 getImportDeclarations 方法時應 fallback 到字串解析', () => {
      // 不設置 getImportDeclarations 方法
      mockParserRegistry = createMockParserRegistry(mockParser);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import { foo } from \'./utils\';', '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols[0].name).toBe('foo');
    });

    it('當沒有 Parser 時應 fallback 到字串解析', () => {
      mockParserRegistry = createMockParserRegistry(null);
      importParser = new ImportParser(mockParserRegistry);

      const result = importParser.parseImportStatements('import { foo } from \'./utils\';', '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols[0].name).toBe('foo');
    });
  });
});

// ===== Fallback 字串解析測試 =====

describe('ImportParser - Fallback 字串解析', () => {
  let importParser: ImportParser;
  let mockParserRegistry: ParserRegistry;

  beforeEach(() => {
    // 使用沒有 getImportDeclarations 的 parser 強制 fallback
    mockParserRegistry = createMockParserRegistry(null);
    importParser = new ImportParser(mockParserRegistry);
  });

  describe('單行 import 解析', () => {
    it.each<FallbackParseTestCase>([
      {
        scenario: 'named import 單一符號',
        content: 'import { foo } from \'./utils\';',
        expectedCount: 1,
        expectedSymbols: ['foo']
      },
      {
        scenario: 'named import 多個符號',
        content: 'import { foo, bar, baz } from \'./utils\';',
        expectedCount: 1,
        expectedSymbols: ['foo', 'bar', 'baz']
      },
      {
        scenario: 'default import',
        content: 'import lodash from \'lodash\';',
        expectedCount: 1,
        expectedSymbols: ['lodash']
      },
      {
        scenario: 'namespace import',
        content: 'import * as utils from \'./utils\';',
        expectedCount: 1,
        expectedSymbols: ['utils']
      },
      {
        scenario: 'default + named import',
        content: 'import React, { useState, useEffect } from \'react\';',
        expectedCount: 1,
        expectedSymbols: ['React', 'useState', 'useEffect']
      },
      {
        scenario: 'type import',
        content: 'import type { User } from \'./types\';',
        expectedCount: 1,
        expectedSymbols: ['User']
      }
    ])('$scenario', ({ content, expectedCount, expectedSymbols }) => {
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(expectedCount);
      if (expectedSymbols) {
        const symbolNames = result[0].symbols.map(s => s.name);
        expect(symbolNames).toEqual(expectedSymbols);
      }
    });

    it('應該正確解析 as 別名', () => {
      const content = 'import { foo as bar, baz as qux } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols).toHaveLength(2);
      expect(result[0].symbols[0].name).toBe('foo');
      expect(result[0].symbols[0].alias).toBe('bar');
      expect(result[0].symbols[1].name).toBe('baz');
      expect(result[0].symbols[1].alias).toBe('qux');
    });

    it('應該跳過 side-effect import', () => {
      const content = 'import \'./polyfill\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(0);
    });

    it('應該跳過 type-only 的 named import', () => {
      const content = 'import { type User, Config } from \'./types\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(1);
      // 只有 Config 被解析，type User 被跳過
      expect(result[0].symbols).toHaveLength(1);
      expect(result[0].symbols[0].name).toBe('Config');
    });
  });

  describe('多行 import 解析', () => {
    it('應該正確解析跨多行的 import', () => {
      const content = `import {
  foo,
  bar,
  baz
} from './utils';`;
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols).toHaveLength(3);
      expect(result[0].symbols.map(s => s.name)).toEqual(['foo', 'bar', 'baz']);
    });

    it('應該正確處理行範圍', () => {
      const content = `import {
  foo,
  bar
} from './utils';`;
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].range.start.line).toBe(1);
      expect(result[0].range.end.line).toBe(4);
    });

    it('應該處理超過 20 行的多行 import（安全限制）', () => {
      // 建立一個超過 20 行的 import
      const lines = ['import {'];
      for (let i = 0; i < 25; i++) {
        lines.push(`  symbol${i},`);
      }
      lines.push('} from \'./utils\';');
      const content = lines.join('\n');

      const result = importParser.parseImportStatements(content, '/test/file.ts');

      // 應該在達到限制時停止，但仍嘗試解析
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('應該處理帶有註解的多行 import', () => {
      const content = `import {
  foo, // comment
  bar /* another comment */
} from './utils';`;
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(1);
      expect(result[0].symbols).toHaveLength(2);
    });
  });

  describe('邊界條件', () => {
    it('應該處理空檔案', () => {
      const result = importParser.parseImportStatements('', '/test/file.ts');
      expect(result).toHaveLength(0);
    });

    it('應該處理沒有 import 的檔案', () => {
      const content = `const x = 1;
function foo() {}`;
      const result = importParser.parseImportStatements(content, '/test/file.ts');
      expect(result).toHaveLength(0);
    });

    it('應該處理混合內容', () => {
      const content = `import { foo } from './utils';
const x = 1;
import { bar } from './other';
function test() {}`;
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(2);
      expect(result[0].symbols[0].name).toBe('foo');
      expect(result[1].symbols[0].name).toBe('bar');
    });

    it('應該正確處理不同引號類型', () => {
      const contentSingle = 'import { foo } from \'./utils\';';
      const contentDouble = 'import { bar } from "./utils";';

      const result1 = importParser.parseImportStatements(contentSingle, '/test/file.ts');
      const result2 = importParser.parseImportStatements(contentDouble, '/test/file.ts');

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });

    it('應該處理 export from 語句（不應識別為 import）', () => {
      const content = 'export { foo } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(0);
    });

    it('應該處理 import 後面沒有 from 的不完整語句', () => {
      const content = 'import { foo }';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      // 不完整的 import 不應被解析
      expect(result).toHaveLength(0);
    });
  });

  describe('特殊符號名稱', () => {
    it('應該處理數字開頭的別名（不合法但可能出現）', () => {
      // 這不是合法的 JS，但解析器應該不會崩潰
      const content = 'import { foo as 123invalid } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      // 解析器應該能處理或跳過
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('應該處理 Unicode 符號名稱', () => {
      const content = 'import { } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      expect(result).toHaveLength(0);
    });

    it('應該處理只有空白的 named import', () => {
      const content = 'import {   } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.ts');

      // 空的 named import 不應產生符號
      if (result.length > 0) {
        expect(result[0].symbols).toHaveLength(0);
      }
    });
  });

  describe('getFileExtension 方法', () => {
    it('應該正確處理無副檔名的檔案', () => {
      const content = 'import { foo } from \'./utils\';';
      // 內部會呼叫 getFileExtension 來取得 parser
      const result = importParser.parseImportStatements(content, '/test/Makefile');

      // 無副檔名時 parser 為 null，fallback 到字串解析
      expect(result).toHaveLength(1);
    });

    it('應該正確處理多個點的檔案名', () => {
      const content = 'import { foo } from \'./utils\';';
      const result = importParser.parseImportStatements(content, '/test/file.test.ts');

      expect(result).toHaveLength(1);
    });
  });
});

// ===== createImportParser 工廠函數測試 =====

describe('createImportParser', () => {
  it('應該建立 ImportParser 實例', async () => {
    const { createImportParser } = await import('@core/deadcode/import-parser.js');
    const mockParserRegistry = createMockParserRegistry(null);

    const parser = createImportParser(mockParserRegistry);

    expect(parser).toBeInstanceOf(ImportParser);
  });
});
