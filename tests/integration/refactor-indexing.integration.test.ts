/**
 * Refactor + Indexing 整合測試
 * 測試重構引擎與索引引擎的協作
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexEngine } from '@core/indexing/index-engine';
import { FunctionExtractor } from '@core/refactor/extract-function';
import { FunctionInliner } from '@core/refactor/inline-function';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { TypeScriptParser } from '@plugins/typescript/parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { IndexConfig } from '@core/indexing/types';

describe('Refactor + Indexing Integration', () => {
  let indexEngine: IndexEngine;
  let tempDir: string;
  let testConfig: IndexConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 重置 ParserRegistry
    ParserRegistry.resetInstance();

    // 註冊 TypeScript Parser
    const tsParser = new TypeScriptParser();
    const registry = ParserRegistry.getInstance();
    registry.register(tsParser);

    // 創建臨時目錄
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'agent-ide-refactor-test-'));

    // 創建測試配置
    testConfig = {
      workspacePath: tempDir,
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: false,
      persistencePath: undefined,
      maxConcurrency: 4
    };
  });

  afterEach(async () => {
    // 清理索引引擎
    if (indexEngine) {
      indexEngine.dispose();
    }

    // 清理 ParserRegistry
    ParserRegistry.resetInstance();

    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // 忽略清理錯誤
    }
  });

  it('應該在函式提取後更新索引', async () => {
    // 創建測試文件 - 使用簡單的算術運算
    const originalCode = `const x = 10;
const y = 20;
const sum = x + y;
const product = x * y;
export const result = sum + product;`;

    const filePath = path.join(tempDir, 'calculator.ts');
    await fs.writeFile(filePath, originalCode);

    // 創建索引引擎並索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 驗證原始符號在索引中
    const originalSymbols = await indexEngine.findSymbol('result');
    expect(originalSymbols.length).toBeGreaterThan(0);
    expect(originalSymbols[0].symbol.name).toBe('result');

    // 執行函式提取 - 提取計算邏輯
    const extractor = new FunctionExtractor();
    const result = await extractor.extract(originalCode, {
      start: { line: 3, column: 0 },
      end: { line: 4, column: 20 }
    }, {
      functionName: 'calculate',
      generateComments: false,
      preserveFormatting: true,
      validateExtraction: true
    });

    expect(result.success).toBe(true);
    expect(result.functionName).toBe('calculate');

    // 應用編輯到文件
    let modifiedCode = originalCode;
    for (const edit of result.edits.reverse()) {
      const lines = modifiedCode.split('\n');
      const startOffset = lines.slice(0, edit.range.start.line - 1).join('\n').length +
                         (edit.range.start.line > 1 ? 1 : 0) + edit.range.start.column;
      const endOffset = lines.slice(0, edit.range.end.line - 1).join('\n').length +
                       (edit.range.end.line > 1 ? 1 : 0) + edit.range.end.column;
      modifiedCode = modifiedCode.substring(0, startOffset) +
                    edit.newText +
                    modifiedCode.substring(endOffset);
    }

    await fs.writeFile(filePath, modifiedCode);

    // 重新索引文件
    await indexEngine.indexFile(filePath);

    // 驗證新函式在索引中
    const newSymbols = await indexEngine.findSymbol('calculate');
    expect(newSymbols.length).toBeGreaterThan(0);

    // 驗證原始符號仍在索引中
    const updatedSymbols = await indexEngine.findSymbol('result');
    expect(updatedSymbols.length).toBeGreaterThan(0);
  });

  it('應該在函式內聯後更新索引', async () => {
    // 創建測試文件 - 使用簡單的 JS 風格函式
    const originalCode = `function add(a, b) {
  return a + b;
}
export function calculate(x, y) {
  const sum = add(x, y);
  return sum * 2;
}`;

    const filePath = path.join(tempDir, 'calculator.ts');
    await fs.writeFile(filePath, originalCode);

    // 創建索引引擎並索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 驗證兩個函式都在索引中
    const addSymbols = await indexEngine.findSymbol('add');
    expect(addSymbols.length).toBeGreaterThan(0);

    const calculateSymbols = await indexEngine.findSymbol('calculate');
    expect(calculateSymbols.length).toBeGreaterThan(0);

    // 執行函式內聯
    const inliner = new FunctionInliner();
    const result = await inliner.inline(originalCode, 'add', {
      removeFunction: true,
      preserveComments: false,
      validateInlining: true,
      inlineAllCalls: true
    });

    expect(result.success).toBe(true);
    expect(result.removedFunction).toBe(true);

    // 應用編輯到文件
    let modifiedCode = originalCode;
    for (const edit of result.edits) {
      const lines = modifiedCode.split('\n');
      const startOffset = lines.slice(0, edit.range.start.line - 1).join('\n').length +
                         (edit.range.start.line > 1 ? 1 : 0) + edit.range.start.column;
      const endOffset = lines.slice(0, edit.range.end.line - 1).join('\n').length +
                       (edit.range.end.line > 1 ? 1 : 0) + edit.range.end.column;

      if (edit.type === 'delete') {
        modifiedCode = modifiedCode.substring(0, startOffset) + modifiedCode.substring(endOffset);
      } else {
        modifiedCode = modifiedCode.substring(0, startOffset) +
                      edit.newText +
                      modifiedCode.substring(endOffset);
      }
    }

    await fs.writeFile(filePath, modifiedCode);

    // 重新索引文件
    await indexEngine.indexFile(filePath);

    // 驗證文件已更新（add 函式已被移除）
    const fileContent = await fs.readFile(filePath, 'utf-8');
    expect(fileContent).not.toContain('function add');
    expect(fileContent).toContain('x + y'); // 內聯後的程式碼

    // 驗證 calculate 函式仍在索引中
    const updatedCalculateSymbols = await indexEngine.findSymbol('calculate');
    expect(updatedCalculateSymbols.length).toBeGreaterThan(0);
  });

  it('應該在重構後保持索引一致性', async () => {
    // 創建多個測試文件
    const file1Code = `export interface User {
  id: number;
  name: string;
}

export function createUser(name: string): User {
  return { id: Date.now(), name };
}`;

    const file2Code = `import { User, createUser } from './file1';

export function getUsers(): User[] {
  return [
    createUser('Alice'),
    createUser('Bob')
  ];
}`;

    const file1Path = path.join(tempDir, 'file1.ts');
    const file2Path = path.join(tempDir, 'file2.ts');

    await fs.writeFile(file1Path, file1Code);
    await fs.writeFile(file2Path, file2Code);

    // 創建索引引擎並索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 驗證所有符號都在索引中
    expect((await indexEngine.findSymbol('User')).length).toBeGreaterThan(0);
    expect((await indexEngine.findSymbol('createUser')).length).toBeGreaterThan(0);
    expect((await indexEngine.findSymbol('getUsers')).length).toBeGreaterThan(0);

    // 在 file1 中進行重構
    const extractor = new FunctionExtractor();
    const result = await extractor.extract(file1Code, {
      start: { line: 6, column: 11 },
      end: { line: 6, column: 40 }
    }, {
      functionName: 'generateUserId',
      generateComments: false,
      preserveFormatting: true,
      validateExtraction: true
    });

    if (result.success) {
      // 應用重構
      let modifiedFile1Code = file1Code;
      for (const edit of result.edits.reverse()) {
        const lines = modifiedFile1Code.split('\n');
        const startOffset = lines.slice(0, edit.range.start.line - 1).join('\n').length +
                           (edit.range.start.line > 1 ? 1 : 0) + edit.range.start.column;
        const endOffset = lines.slice(0, edit.range.end.line - 1).join('\n').length +
                         (edit.range.end.line > 1 ? 1 : 0) + edit.range.end.column;
        modifiedFile1Code = modifiedFile1Code.substring(0, startOffset) +
                          edit.newText +
                          modifiedFile1Code.substring(endOffset);
      }

      await fs.writeFile(file1Path, modifiedFile1Code);
      await indexEngine.indexFile(file1Path);
    }

    // 驗證索引一致性
    const allSymbols = await indexEngine.getAllSymbols();
    expect(allSymbols).toBeDefined();
    expect(allSymbols.length).toBeGreaterThan(0);

    // file2 的符號應該仍然存在
    expect((await indexEngine.findSymbol('getUsers')).length).toBeGreaterThan(0);
  });
});
