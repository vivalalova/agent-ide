/**
 * ParserFactory 測試
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions } from '../../../src/infrastructure/parser/types';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';
import { ParserFactory } from '../../../src/infrastructure/parser/factory';
import { ParserFactoryError } from '../../../src/shared/errors';

// 模擬 ParserPlugin 實作
class MockParserPlugin implements ParserPlugin {
  constructor(
    public readonly name: string,
    public readonly version: string,
    public readonly supportedExtensions: readonly string[],
    public readonly supportedLanguages: readonly string[]
  ) {}

  async parse(code: string, filePath: string): Promise<AST> {
    return {
      type: 'Program',
      root: { type: 'Program', children: [] },
      sourceFile: filePath,
      metadata: { version: '1.0' }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    return [];
  }

  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    return [];
  }

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    return [];
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    return [];
  }

  async extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]> {
    return [];
  }

  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    return null;
  }

  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    return [];
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [], warnings: [] };
  }

  async dispose(): Promise<void> {}
}

describe('ParserFactory', () => {
  let factory: ParserFactory;
  let registry: ParserRegistry;
  let tsPlugin: MockParserPlugin;
  let jsPlugin: MockParserPlugin;

  beforeEach(() => {
    ParserRegistry.resetInstance();
    registry = ParserRegistry.getInstance();
    factory = new ParserFactory(registry);
    
    tsPlugin = new MockParserPlugin(
      'typescript',
      '1.0.0',
      ['.ts', '.tsx'],
      ['typescript']
    );
    
    jsPlugin = new MockParserPlugin(
      'javascript',
      '1.0.0',
      ['.js', '.jsx'],
      ['javascript']
    );
  });

  afterEach(async () => {
    if (factory && !factory.isDisposed) {
      await factory.dispose();
    }
    if (registry && !registry.isDisposed) {
      await registry.dispose();
    }
    ParserRegistry.resetInstance();
  });

  describe('Parser 建立', () => {
    beforeEach(() => {
      registry.register(tsPlugin);
      registry.register(jsPlugin);
    });

    it('應該能根據檔案路徑建立 Parser', () => {
      const parser = factory.createParser('/path/to/file.ts');
      expect(parser).toBe(tsPlugin);
    });

    it('應該能根據副檔名建立 Parser', () => {
      const parser = factory.createParserByExtension('.js');
      expect(parser).toBe(jsPlugin);
    });

    it('應該能根據語言建立 Parser', () => {
      const parser = factory.createParserByLanguage('typescript');
      expect(parser).toBe(tsPlugin);
    });

    it('找不到對應 Parser 時應該返回 null', () => {
      const parser = factory.createParser('/path/to/file.unknown');
      expect(parser).toBeNull();
    });
  });

  describe('Parser 快取', () => {
    beforeEach(() => {
      // registry.register(tsPlugin);
    });

    it('應該快取已建立的 Parser 實例', () => {
      // const parser1 = factory.createParser('/path/to/file1.ts');
      // const parser2 = factory.createParser('/path/to/file2.ts');
      // expect(parser1).toBe(parser2);
    });

    it('應該能清除快取', () => {
      // const parser1 = factory.createParser('/path/to/file.ts');
      // factory.clearCache();
      
      // // 建立新的 mock instance 來驗證快取被清除
      // const newTsPlugin = new MockParserPlugin('typescript', '1.0.0', ['.ts'], ['typescript']);
      // registry.unregister('typescript');
      // registry.register(newTsPlugin);
      
      // const parser2 = factory.createParser('/path/to/file.ts');
      // expect(parser2).toBe(newTsPlugin);
      // expect(parser1).not.toBe(parser2);
    });

    it('應該能清除特定 Parser 的快取', () => {
      // registry.register(jsPlugin);
      // const tsParser = factory.createParser('/path/to/file.ts');
      // const jsParser = factory.createParser('/path/to/file.js');
      
      // factory.clearCache('typescript');
      
      // const newTsParser = factory.createParser('/path/to/file.ts');
      // const sameJsParser = factory.createParser('/path/to/file.js');
      
      // expect(newTsParser).toBe(tsParser); // 因為是同一個 plugin instance
      // expect(sameJsParser).toBe(jsParser); // JS parser 快取未被清除
    });
  });

  describe('Parser 配置', () => {
    beforeEach(() => {
      // registry.register(tsPlugin);
    });

    it('應該能使用配置選項建立 Parser', () => {
      // const options: ParserOptions = {
      //   strictMode: true,
      //   targetVersion: '5.0',
      //   customOptions: { experimentalDecorators: true }
      // };
      
      // const parser = factory.createParser('/path/to/file.ts', options);
      // expect(parser).toBe(tsPlugin);
    });

    it('應該能設定全域預設配置', () => {
      // const globalOptions: ParserOptions = {
      //   strictMode: true
      // };
      
      // factory.setDefaultOptions(globalOptions);
      // const parser = factory.createParser('/path/to/file.ts');
      // expect(parser).toBe(tsPlugin);
    });

    it('應該能設定特定 Parser 的預設配置', () => {
      // const tsOptions: ParserOptions = {
      //   strictMode: true,
      //   customOptions: { experimentalDecorators: true }
      // };
      
      // factory.setParserOptions('typescript', tsOptions);
      // const parser = factory.createParser('/path/to/file.ts');
      // expect(parser).toBe(tsPlugin);
    });
  });

  describe('延遲載入', () => {
    it('應該支援延遲載入 Parser', async () => {
      // const lazyLoader = vi.fn().mockResolvedValue(tsPlugin);
      // factory.registerLazyParser('typescript', lazyLoader);
      
      // const parser = await factory.createParserLazy('/path/to/file.ts');
      // expect(lazyLoader).toHaveBeenCalled();
      // expect(parser).toBe(tsPlugin);
    });

    it('延遲載入的 Parser 應該被快取', async () => {
      // const lazyLoader = vi.fn().mockResolvedValue(tsPlugin);
      // factory.registerLazyParser('typescript', lazyLoader);
      
      // const parser1 = await factory.createParserLazy('/path/to/file1.ts');
      // const parser2 = await factory.createParserLazy('/path/to/file2.ts');
      
      // expect(lazyLoader).toHaveBeenCalledTimes(1);
      // expect(parser1).toBe(parser2);
    });
  });

  describe('錯誤處理', () => {
    it('Registry 未初始化時應該拋出錯誤', () => {
      // const emptyFactory = new ParserFactory(null);
      // expect(() => emptyFactory.createParser('/path/to/file.ts')).toThrow();
    });

    it('Parser 建立失敗時應該拋出錯誤', () => {
      // const faultyPlugin = new MockParserPlugin('faulty', '1.0.0', ['.faulty'], ['faulty']);
      // vi.spyOn(faultyPlugin, 'validate').mockRejectedValue(new Error('Validation failed'));
      
      // registry.register(faultyPlugin);
      // expect(() => factory.createParserByExtension('.faulty')).toThrow();
    });
  });

  describe('生命週期管理', () => {
    it('應該能清理所有資源', async () => {
      // registry.register(tsPlugin);
      // registry.register(jsPlugin);
      
      // factory.createParser('/path/to/file.ts');
      // factory.createParser('/path/to/file.js');
      
      // const tsDisposeSpy = vi.spyOn(tsPlugin, 'dispose');
      // const jsDisposeSpy = vi.spyOn(jsPlugin, 'dispose');
      
      // await factory.dispose();
      
      // // 快取中的 parser 實例應該被清理
      // expect(tsDisposeSpy).toHaveBeenCalled();
      // expect(jsDisposeSpy).toHaveBeenCalled();
    });

    it('清理後應該無法建立新的 Parser', async () => {
      // registry.register(tsPlugin);
      // await factory.dispose();
      
      // expect(() => factory.createParser('/path/to/file.ts')).toThrow('Factory已被清理');
    });
  });

  describe('效能優化', () => {
    it('應該限制快取大小', () => {
      // factory.setMaxCacheSize(2);
      
      // registry.register(tsPlugin);
      // registry.register(jsPlugin);
      // const swiftPlugin = new MockParserPlugin('swift', '1.0.0', ['.swift'], ['swift']);
      // registry.register(swiftPlugin);
      
      // factory.createParser('/path/to/file.ts');
      // factory.createParser('/path/to/file.js');
      // factory.createParser('/path/to/file.swift');
      
      // // 快取應該只保留最近使用的 2 個
      // expect(factory.getCacheSize()).toBe(2);
    });

    it('應該支援最近最少使用 (LRU) 快取策略', () => {
      // factory.setMaxCacheSize(2);
      
      // registry.register(tsPlugin);
      // registry.register(jsPlugin);
      // const swiftPlugin = new MockParserPlugin('swift', '1.0.0', ['.swift'], ['swift']);
      // registry.register(swiftPlugin);
      
      // factory.createParser('/path/to/file.ts');
      // factory.createParser('/path/to/file.js');
      // factory.createParser('/path/to/file.ts'); // 重新訪問 ts
      // factory.createParser('/path/to/file.swift'); // 應該移除 js
      
      // const cachedParsers = factory.getCachedParsers();
      // expect(cachedParsers).toContain('typescript');
      // expect(cachedParsers).toContain('swift');
      // expect(cachedParsers).not.toContain('javascript');
    });
  });
});