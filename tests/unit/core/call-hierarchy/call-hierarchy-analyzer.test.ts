/**
 * CallHierarchyAnalyzer 單元測試
 */

import { describe, it, expect, vi } from 'vitest';
import { CallHierarchyAnalyzer } from '@core/call-hierarchy/call-hierarchy-analyzer.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { SymbolType } from '@shared/types/symbol.js';
import { createMockFileSystem, createMockParserRegistry, createMockParser, createMockSymbol } from '../_helpers/mock-factories.js';

describe('CallHierarchyAnalyzer', () => {
  const options = { direction: 'both' as const, depth: 1 };

  function createParserRegistryFor(parsers: readonly ParserPlugin[]): ParserRegistry {
    const parsersByExtension = new Map<string, ParserPlugin>();
    for (const parser of parsers) {
      for (const extension of parser.supportedExtensions) {
        parsersByExtension.set(extension, parser);
      }
    }

    return {
      getParser: vi.fn((extension: string) => parsersByExtension.get(extension) ?? null)
    } as unknown as ParserRegistry;
  }

  async function createAnalyzerWithRealParsers(files: Record<string, string>): Promise<CallHierarchyAnalyzer> {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON(files);
    return new CallHierarchyAnalyzer(
      createParserRegistryFor([new TypeScriptParser(), new JavaScriptParser()]),
      fileSystem
    );
  }

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

  describe('real parser behavior', () => {
    it('Given TypeScript 函數有直接呼叫與方法呼叫, when analyze outgoing, then 回傳實際 callee 與 receiver', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/target.ts': `
function helper() {
  return 1;
}

const service = {
  save() {
    return 2;
  }
};

export function target() {
  helper();
  service.save();
}
        `.trim()
      });

      const result = await analyzer.analyze('target', ['/src/target.ts'], { direction: 'outgoing', depth: 1 });

      expect(result?.outgoing).toEqual(expect.arrayContaining([
        expect.objectContaining({
          callee: 'helper',
          context: 'helper();',
          isMethodCall: false
        }),
        expect.objectContaining({
          callee: 'save',
          context: 'service.save();',
          isMethodCall: true,
          receiver: 'service'
        })
      ]));
    });

    it('Given caller 與 target 在同一 TypeScript 檔案, when analyze incoming, then 保留同檔 caller 但排除自我遞迴', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/same-file.ts': `
export function target() {
  return target();
}

export function sameFileCaller() {
  return target();
}
        `.trim()
      });

      const result = await analyzer.analyze('target', ['/src/same-file.ts'], { direction: 'incoming', depth: 1 });
      const callerNames = result?.incoming.map(call => call.caller) ?? [];

      expect(callerNames).toContain('sameFileCaller');
      expect(callerNames).not.toContain('target');
      expect(result?.incoming).toEqual([
        expect.objectContaining({
          caller: 'sameFileCaller',
          context: 'return target();',
          callerDefinitionFile: '/src/same-file.ts'
        })
      ]);
    });

    it('Given JavaScript 函數有 Babel AST 呼叫, when analyze outgoing, then 回傳直接呼叫與方法呼叫', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/target.js': `
function helper() {
  return 1;
}

const service = {
  save() {
    return 2;
  }
};

export function target() {
  helper();
  service.save();
}
        `.trim()
      });

      const result = await analyzer.analyze('target', ['/src/target.js'], { direction: 'outgoing', depth: 1 });

      expect(result?.outgoing).toEqual(expect.arrayContaining([
        expect.objectContaining({
          callee: 'helper',
          context: 'helper();',
          isMethodCall: false
        }),
        expect.objectContaining({
          callee: 'save',
          context: 'service.save();',
          isMethodCall: true,
          receiver: 'service'
        })
      ]));
    });

    it('Given TypeScript 函數內有巢狀具名函數, when analyze outgoing, then 巢狀函數內的呼叫不應歸屬外層函數', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/nested.ts': `
function outer() {
  function inner() {
    sideEffect();
  }
  bar();
}
        `.trim()
      });

      const result = await analyzer.analyze('outer', ['/src/nested.ts'], { direction: 'outgoing', depth: 1 });
      const callees = result?.outgoing.map(call => call.callee) ?? [];

      expect(callees).toContain('bar');
      expect(callees).not.toContain('sideEffect');
    });

    it('Given TypeScript 函數內有匿名 arrow function callback, when analyze outgoing, then callback 內的呼叫仍歸屬外層函數', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/nested-anonymous.ts': `
function outer2() {
  items.map(x => transform(x));
}
        `.trim()
      });

      const result = await analyzer.analyze('outer2', ['/src/nested-anonymous.ts'], { direction: 'outgoing', depth: 1 });
      const callees = result?.outgoing.map(call => call.callee) ?? [];

      expect(callees).toContain('transform');
    });

    it('Given JavaScript caller 在另一個檔案, when analyze incoming, then 用 Babel AST 找到 caller 名稱與 context', async () => {
      const analyzer = await createAnalyzerWithRealParsers({
        '/src/target.js': `
export function target() {
  return 1;
}
        `.trim(),
        '/src/caller.js': `
import { target } from './target.js';

export function jsCaller() {
  return target();
}
        `.trim()
      });

      const result = await analyzer.analyze('target', ['/src/target.js', '/src/caller.js'], { direction: 'incoming', depth: 1 });

      expect(result?.incoming).toEqual([
        expect.objectContaining({
          caller: 'jsCaller',
          context: 'return target();',
          callerDefinitionFile: '/src/caller.js'
        })
      ]);
    });
  });
});
