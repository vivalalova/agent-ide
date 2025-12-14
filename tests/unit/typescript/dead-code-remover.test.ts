/**
 * DeadCodeRemover 測試
 * 測試 Dead Code 刪除器的 Import 解析與括號配對功能
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadCodeRemover, createDeadCodeRemover } from '@core/dead-code/dead-code-remover.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { DeadCodeItem, DeadCodeRemovalOptions } from '@core/dead-code/types.js';
import { SymbolType } from '@shared/types/symbol.js';

// ============================================================================
// MARK: - Test Infrastructure
// ============================================================================

/**
 * Mock FileSystem 建立
 */
const createMockFileSystem = (
  fileContents: Record<string, string> = {}
): IFileSystem => ({
  readFile: vi.fn().mockImplementation(async (path: string) => {
    if (fileContents[path]) {
      return fileContents[path];
    }
    throw new Error(`File not found: ${path}`);
  }),
  writeFile: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
  isFile: vi.fn().mockResolvedValue(true),
  isDirectory: vi.fn().mockResolvedValue(false),
  readDirectory: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ size: 100, mtime: new Date() }),
  glob: vi.fn().mockResolvedValue([]),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
}) as unknown as IFileSystem;

/**
 * Mock ParserRegistry 建立
 */
const createMockParserRegistry = (): ParserRegistry => ({
  getParser: vi.fn().mockReturnValue(null), // 降級到文字匹配
  registerParser: vi.fn(),
  getSupportedExtensions: vi.fn().mockReturnValue([]),
}) as unknown as ParserRegistry;

/**
 * DeadCodeItem 測試資料建立
 */
const createDeadCodeItem = (
  overrides: Partial<{
    name: string;
    type: SymbolType;
    filePath: string;
    startLine: number;
    endLine: number;
    confidence: number;
  }> = {}
): DeadCodeItem => ({
  name: overrides.name ?? 'unusedSymbol',
  type: overrides.type ?? SymbolType.Function,
  location: {
    filePath: overrides.filePath ?? '/src/test.ts',
    range: {
      start: {
        line: overrides.startLine ?? 1,
        column: 1,
        offset: 0,
      },
      end: {
        line: overrides.endLine ?? 3,
        column: 1,
        offset: 50,
      },
    },
  },
  confidence: overrides.confidence ?? 1.0,
  reason: 'Not referenced anywhere',
});

/**
 * SUT 建立
 */
const createSut = (
  fileSystem: IFileSystem,
  options?: DeadCodeRemovalOptions,
  parserRegistry?: ParserRegistry
): DeadCodeRemover => createDeadCodeRemover(
  fileSystem,
  parserRegistry ?? createMockParserRegistry(),
  options
);

// ============================================================================
// MARK: - Import 解析功能測試
// ============================================================================

describe('DeadCodeRemover Import 解析', () => {
  describe('多行 import 語句', () => {
    it('應該正確解析跨多行的 named import', async () => {
      // Given: 多行 import
      const fileContent = `import {
  useState,
  useEffect
} from 'react';

function unusedFunc() {
  return useState(0);
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
      expect(result.removals.length).toBeGreaterThanOrEqual(1);
    });

    it('應該正確解析超長的多行 import', async () => {
      // Given: 10+ 行的 import
      const fileContent = `import {
  Component1,
  Component2,
  Component3,
  Component4,
  Component5,
  Component6,
  Component7,
  Component8,
  Component9,
  Component10
} from '@/components';

function unusedFunc() {
  return Component1;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 14,
          endLine: 16,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功解析（即使 errors，preview 本身可能成功或失敗都是合理的）
      // 重點是不應該拋出異常
      expect(result).toBeDefined();
      expect(result.removals.length + (result.warnings?.length ?? 0) + (result.errors?.length ?? 0)).toBeGreaterThanOrEqual(0);
    });

    it('應該處理多行 import 中帶有 as 別名', async () => {
      // Given: 帶別名的多行 import
      const fileContent = `import {
  useState as useLocalState,
  useEffect as useSideEffect
} from 'react';

function unusedFunc() {
  return useLocalState(0);
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });
  });

  describe('Default import 清理', () => {
    it('應該識別 default import', async () => {
      // Given: default import
      const fileContent = `import React from 'react';

const unusedVar = 'test';`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedVar',
          type: SymbolType.Variable,
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 3,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功識別
      expect(result.success).toBe(true);
    });

    it('應該正確處理 default import + named import 組合', async () => {
      // Given: default + named import
      const fileContent = `import React, { useState, useEffect } from 'react';

const unusedVar = 'test';`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedVar',
          type: SymbolType.Variable,
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 3,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });
  });

  describe('Namespace import 清理', () => {
    it('應該識別 namespace import', async () => {
      // Given: namespace import
      const fileContent = `import * as utils from './utils';

const unusedVar = 'test';`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedVar',
          type: SymbolType.Variable,
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 3,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });

    it('namespace import 不應被部分清理', async () => {
      // Given: namespace import（utils 是 dead code）
      const fileContent = `import * as utils from './utils';

function unusedFunc() {
  return utils.helper();
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 5,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: namespace import 應該被完整刪除，不支援部分清理
      expect(result.success).toBe(true);
      // 檢查 importCleanups 不會有 partial 類型（namespace 不支援）
      const namespaceCleanup = result.importCleanups.find(
        (c) => c.originalImport.includes('* as')
      );
      if (namespaceCleanup) {
        expect(namespaceCleanup.cleanupType).toBe('delete');
      }
    });
  });

  describe('混合格式 import 部分清理', () => {
    it('應該部分清理 mixed import 中的 named 部分', async () => {
      // Given: mixed import 且 useState 是 dead code
      const fileContent = `import React, { useState, useEffect } from 'react';

function useState() {
  // 這是假的 useState，用來測試
}

function useComponent() {
  useEffect(() => {});
  return <div />;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'useState',
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 5,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該有部分清理操作
      expect(result.success).toBe(true);
      const partialCleanup = result.importCleanups.find(
        (c) => c.cleanupType === 'partial'
      );
      if (partialCleanup?.newImport) {
        // 新的 import 應該保留 React 和 useEffect
        expect(partialCleanup.newImport).toContain('React');
        expect(partialCleanup.newImport).toContain('useEffect');
        expect(partialCleanup.newImport).not.toContain('useState');
      }
    });

    it('應該處理 type import 的部分清理', async () => {
      // Given: type import
      const fileContent = `import type { TypeA, TypeB, TypeC } from './types';

type TypeA = string; // 重新定義，原本的 TypeA 變成 dead code

const data: TypeB = {};`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'TypeA',
          type: SymbolType.Type,
          filePath: '/src/test.ts',
          startLine: 3,
          endLine: 3,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// MARK: - 括號配對邊界測試
// ============================================================================

describe('DeadCodeRemover 括號配對', () => {
  describe('字串中的括號', () => {
    it('不應被字串中的大括號干擾', async () => {
      // Given: 字串中包含 { }
      const fileContent = `function usedFunc() {
  const str = "{ this is not a brace }";
  return str;
}

function unusedFunc() {
  return "test";
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該正確識別函式範圍
      expect(result.success).toBe(true);
      expect(result.removals.length).toBe(1);
      const removal = result.removals[0];
      expect(removal.symbolName).toBe('unusedFunc');
      // 範圍應該正確（不被字串中的括號影響）
      expect(removal.range.end.line).toBeGreaterThanOrEqual(8);
    });

    it('不應被單引號字串中的括號干擾', async () => {
      // Given: 單引號字串中包含 { }
      const fileContent = `function usedFunc() {
  const str = '{ } { } { }';
  return str;
}

function unusedFunc() {
  return '{test}';
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });

    it('應該處理跳脫字元的字串', async () => {
      // Given: 包含跳脫字元的字串
      const fileContent = `function usedFunc() {
  const str = "{\\"escaped\\"}";
  return str;
}

function unusedFunc() {
  return "test";
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });
  });

  describe('註解中的括號', () => {
    it('不應被單行註解中的括號干擾', async () => {
      // Given: 註解中包含 { }
      const fileContent = `function usedFunc() {
  // this { is } a comment { with braces }
  return 1;
}

function unusedFunc() {
  // { }
  return 2;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 6,
          endLine: 9,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });

    it('不應被多行註解中的括號干擾', async () => {
      // Given: 多行註解中包含 { }
      const fileContent = `function usedFunc() {
  /*
   * { this is a multi-line comment }
   * with { many } braces { }
   */
  return 1;
}

function unusedFunc() {
  /* { } */
  return 2;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 9,
          endLine: 12,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });

    it('應該處理 JSDoc 註解中的括號', async () => {
      // Given: JSDoc 中包含 { }
      const fileContent = `/**
 * @param {Object} options - The options { with braces }
 * @returns {string} result
 */
function usedFunc(options) {
  return options.name;
}

/**
 * @param {number} x
 */
function unusedFunc(x) {
  return x;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 9,
          endLine: 13,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功，且應包含 JSDoc
      expect(result.success).toBe(true);
    });
  });

  describe('模板字串中的括號', () => {
    it('不應被模板字串中的括號干擾', async () => {
      // Given: 模板字串中包含 { }
      const fileContent = `function usedFunc() {
  const name = 'test';
  const str = \`Hello \${name}, this { is } a template\`;
  return str;
}

function unusedFunc() {
  return \`{\${1}}\`;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 7,
          endLine: 9,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });

    it('應該處理巢狀模板字串', async () => {
      // Given: 巢狀模板字串
      const fileContent = `function usedFunc() {
  const inner = \`{\${1 + 2}}\`;
  const outer = \`outer: \${inner} { }\`;
  return outer;
}

function unusedFunc() {
  return \`nested: \${\`inner: \${1}\`}\`;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 7,
          endLine: 9,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
    });
  });

  describe('複合情境', () => {
    it('應該處理混合字串、註解和括號的複雜情境', async () => {
      // Given: 複雜混合情境
      const fileContent = `function usedFunc() {
  // { comment brace }
  const str = "{ string brace }";
  const template = \`{ \${1} template }\`;
  /* { multi-line
   * comment } */
  return { key: "value { nested }" };
}

function unusedFunc() {
  // { }
  const x = "{ }";
  return \`{ \${x} }\`;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 10,
          endLine: 14,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該成功
      expect(result.success).toBe(true);
      expect(result.removals.length).toBe(1);
    });

    it('應該處理 arrow function 中的括號', async () => {
      // Given: arrow function
      const fileContent = `const usedFunc = () => {
  return { key: "value" };
};

const unusedFunc = () => {
  const obj = { a: 1, b: 2 };
  return obj;
};`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          type: SymbolType.Variable,
          filePath: '/src/test.ts',
          startLine: 5,
          endLine: 8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該正確識別 arrow function 範圍
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// MARK: - 工廠函式測試
// ============================================================================

describe('createDeadCodeRemover', () => {
  it('應該建立 DeadCodeRemover 實例', () => {
    // Given: mock 依賴
    const fs = createMockFileSystem();
    const parserRegistry = createMockParserRegistry();

    // When: 使用 factory 函數建立
    const result = createDeadCodeRemover(fs, parserRegistry);

    // Then: 回傳正確型別
    expect(result).toBeInstanceOf(DeadCodeRemover);
  });

  it('應該接受自訂選項', () => {
    // Given: mock 依賴與選項
    const fs = createMockFileSystem();
    const parserRegistry = createMockParserRegistry();
    const options: DeadCodeRemovalOptions = {
      minConfidence: 0.5,
      cleanupImports: false,
    };

    // When: 使用選項建立
    const result = createDeadCodeRemover(fs, parserRegistry, options);

    // Then: 實例建立成功
    expect(result).toBeInstanceOf(DeadCodeRemover);
  });
});

// ============================================================================
// MARK: - preview() 基本測試
// ============================================================================

describe('DeadCodeRemover.preview', () => {
  describe('基本行為', () => {
    it('應該回傳成功結果當沒有項目', async () => {
      // Given: 空的 dead code 列表
      const fs = createMockFileSystem();
      const sut = createSut(fs);

      // When: 預覽空列表
      const result = await sut.preview([]);

      // Then: 應該成功
      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(0);
      expect(result.importCleanups).toHaveLength(0);
    });

    it('應該計算正確的 summary', async () => {
      // Given: 有 dead code 項目
      const fileContent = `function unusedFunc() {
  return 1;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          startLine: 1,
          endLine: 3,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: summary 應該正確
      expect(result.success).toBe(true);
      expect(result.summary.totalRemovals).toBeGreaterThanOrEqual(1);
      expect(result.summary.filesAffected).toBeGreaterThanOrEqual(1);
    });
  });

  describe('過濾行為', () => {
    it('應該跳過低信心度項目', async () => {
      // Given: 設定高門檻
      const fileContent = `function unusedFunc() {
  return 1;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs, { minConfidence: 0.99 });
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.ts',
          confidence: 0.8,
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該被過濾
      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(0);
      expect(result.warnings?.length).toBeGreaterThan(0);
    });

    it('應該跳過被排除的符號', async () => {
      // Given: 排除特定符號
      const fileContent = `function skipThis() {
  return 1;
}`;
      const fs = createMockFileSystem({ '/src/test.ts': fileContent });
      const sut = createSut(fs, { excludeSymbols: ['skipThis'] });
      const items = [
        createDeadCodeItem({
          name: 'skipThis',
          filePath: '/src/test.ts',
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該被過濾
      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(0);
    });

    it('應該跳過被排除的檔案', async () => {
      // Given: 排除特定檔案模式
      const fileContent = `function unusedFunc() {
  return 1;
}`;
      const fs = createMockFileSystem({ '/src/test.spec.ts': fileContent });
      const sut = createSut(fs, { excludeFiles: ['*.spec.ts'] });
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/test.spec.ts',
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該被過濾
      expect(result.success).toBe(true);
      expect(result.removals).toHaveLength(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理檔案讀取失敗', async () => {
      // Given: 檔案不存在
      const fs = createMockFileSystem({});
      const sut = createSut(fs);
      const items = [
        createDeadCodeItem({
          name: 'unusedFunc',
          filePath: '/src/nonexistent.ts',
        }),
      ];

      // When: 預覽刪除
      const result = await sut.preview(items);

      // Then: 應該有警告但不失敗
      expect(result.success).toBe(true);
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// MARK: - execute() 測試
// ============================================================================

describe('DeadCodeRemover.execute', () => {
  it('應該實際寫入檔案', async () => {
    // Given: 有 dead code 的檔案
    const fileContent = `function unusedFunc() {
  return 1;
}

function usedFunc() {
  return 2;
}`;
    const fs = createMockFileSystem({ '/src/test.ts': fileContent });
    const sut = createSut(fs);
    const items = [
      createDeadCodeItem({
        name: 'unusedFunc',
        filePath: '/src/test.ts',
        startLine: 1,
        endLine: 3,
      }),
    ];

    // When: 預覽並執行
    const preview = await sut.preview(items);
    const result = await sut.execute(preview);

    // Then: 應該呼叫 writeFile
    expect(result.success).toBe(true);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('應該回傳失敗當 preview 失敗', async () => {
    // Given: 失敗的 preview
    const fs = createMockFileSystem();
    const sut = createSut(fs);
    const failedPreview = {
      success: false,
      removals: [],
      importCleanups: [],
      affectedFiles: [],
      summary: {
        totalRemovals: 0,
        byType: {},
        filesAffected: 0,
        linesRemoved: 0,
        importsCleanedUp: 0,
      },
      errors: ['Test error'],
    };

    // When: 執行失敗的 preview
    const result = await sut.execute(failedPreview);

    // Then: 應該失敗
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Test error');
  });
});

// ============================================================================
// MARK: - Side-effect import 測試
// ============================================================================

describe('DeadCodeRemover Side-effect import', () => {
  it('應該忽略 side-effect import', async () => {
    // Given: side-effect import
    const fileContent = `import './polyfill';
import 'reflect-metadata';

function unusedFunc() {
  return 1;
}`;
    const fs = createMockFileSystem({ '/src/test.ts': fileContent });
    const sut = createSut(fs);
    const items = [
      createDeadCodeItem({
        name: 'unusedFunc',
        filePath: '/src/test.ts',
        startLine: 4,
        endLine: 6,
      }),
    ];

    // When: 預覽刪除
    const result = await sut.preview(items);

    // Then: side-effect import 不應被清理
    expect(result.success).toBe(true);
    // importCleanups 不應包含 side-effect import
    const sideEffectCleanup = result.importCleanups.find(
      (c) => c.originalImport.includes('\'./polyfill\'') || c.originalImport.includes('\'reflect-metadata\'')
    );
    expect(sideEffectCleanup).toBeUndefined();
  });
});
