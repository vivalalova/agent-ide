/**
 * CallHierarchyAnalyzer 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { CallHierarchyAnalyzer } from '@core/call-hierarchy/call-hierarchy-analyzer.js';
import { SymbolType } from '@shared/types/symbol.js';
import { createMockFileSystem, createMockParserRegistry, createMockParser, createMockSymbol } from '../_helpers/mock-factories.js';

describe('CallHierarchyAnalyzer', () => {
  const options = { direction: 'both' as const, depth: 1 };

  describe('analyze - 找不到函數定義', () => {
    it('Given 空檔案列表, when analyze, then 回傳 null（不拋錯）', async () => {
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(),
        createMockFileSystem()
      );

      const result = await analyzer.analyze('anyFunc', [], options);
      expect(result).toBeNull();
    });

    it('Given 不存在的檔案, when analyze, then 回傳 null（不拋錯）', async () => {
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(),
        createMockFileSystem({}) // 空 files → readFile 拋錯 → fileUtils 返回 null
      );

      const result = await analyzer.analyze('foo', ['/src/missing.ts'], options);
      expect(result).toBeNull();
    });

    it('Given 解析器找不到目標函數, when analyze, then 回傳 null', async () => {
      const parser = createMockParser({
        extractSymbols: vi.fn().mockResolvedValue([
          createMockSymbol('otherFunc', SymbolType.Function)
        ])
      });
      const mockFs = createMockFileSystem({ '/src/foo.ts': 'function otherFunc() {}' });
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(parser),
        mockFs
      );

      const result = await analyzer.analyze('targetFunc', ['/src/foo.ts'], options);
      expect(result).toBeNull();
    });
  });

  describe('analyze - 找到函數定義', () => {
    it('Given 解析器找到目標函數, when analyze, then 回傳有效 CallHierarchyData', async () => {
      const funcSymbol = createMockSymbol('greet', SymbolType.Function);
      const parser = createMockParser({
        extractSymbols: vi.fn().mockResolvedValue([funcSymbol])
      });
      const mockFs = createMockFileSystem({
        '/src/foo.ts': 'function greet() {}'
      });
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(parser),
        mockFs
      );

      const result = await analyzer.analyze('greet', ['/src/foo.ts'], options);

      expect(result).not.toBeNull();
      expect(result?.functionName).toBe('greet');
      expect(result?.definitionFile).toBe('/src/foo.ts');
      expect(result?.incoming).toEqual([]);
      expect(result?.outgoing).toEqual([]);
    });

    it('Given 孤立函數（無呼叫者/被呼叫者）, when analyze, then incoming/outgoing 均為空陣列', async () => {
      const funcSymbol = createMockSymbol('standalone', SymbolType.Function);
      const parser = createMockParser({
        extractSymbols: vi.fn().mockResolvedValue([funcSymbol]),
        findUsages: vi.fn().mockResolvedValue([])
      });
      const mockFs = createMockFileSystem({
        '/src/foo.ts': 'function standalone() {}'
      });
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(parser),
        mockFs
      );

      const result = await analyzer.analyze('standalone', ['/src/foo.ts'], options);

      expect(result?.incoming).toEqual([]);
      expect(result?.outgoing).toEqual([]);
    });
  });

  describe('analyzeWithDefinition', () => {
    it('Given 有效定義資訊, when analyzeWithDefinition, then 回傳空 incoming/outgoing', async () => {
      const mockFs = createMockFileSystem({ '/src/foo.ts': 'function foo() {}' });
      const analyzer = new CallHierarchyAnalyzer(
        createMockParserRegistry(),
        mockFs
      );

      const range = { start: { line: 1, column: 1 }, end: { line: 1, column: 12 } };
      const result = await analyzer.analyzeWithDefinition('foo', '/src/foo.ts', range, [], options);

      expect(result.functionName).toBe('foo');
      expect(result.definitionFile).toBe('/src/foo.ts');
      expect(result.incoming).toEqual([]);
      expect(result.outgoing).toEqual([]);
    });
  });
});
