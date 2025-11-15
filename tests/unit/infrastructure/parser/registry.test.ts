import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ParserRegistry } from '@infrastructure/parser/registry';
import type { ParserPlugin } from '@infrastructure/parser/interface';

// Mock Parser Plugin
const createMockParser = (name: string, extensions: string[], languages: string[]): ParserPlugin => ({
  name,
  version: '1.0.0',
  supportedExtensions: extensions,
  supportedLanguages: languages,
  parse: async () => ({ type: 'Program', children: [] } as any),
  extractSymbols: async () => [],
  findReferences: async () => [],
  extractDependencies: async () => [],
  rename: async () => [],
  extractFunction: async () => [],
  findDefinition: async () => null,
  findUsages: async () => [],
  validate: async () => ({ valid: true }),
  dispose: async () => {},
  detectUnusedSymbols: async () => [],
  analyzeComplexity: async () => ({
    cyclomaticComplexity: 1,
    cognitiveComplexity: 1,
    functions: []
  }),
  extractCodeFragments: async () => [],
  detectPatterns: async () => [],
  checkTypeSafety: async () => [],
  checkErrorHandling: async () => [],
  checkSecurity: async () => [],
  checkNamingConventions: async () => [],
  isTestFile: () => false
});

describe('ParserRegistry', () => {
  let registry: ParserRegistry;

  beforeEach(() => {
    ParserRegistry.resetInstance();
    registry = ParserRegistry.getInstance();
  });

  afterEach(() => {
    ParserRegistry.resetInstance();
  });

  describe('單例模式', () => {
    it('應該回傳相同的實例', () => {
      const instance1 = ParserRegistry.getInstance();
      const instance2 = ParserRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('應該能夠重設實例', () => {
      const instance1 = ParserRegistry.getInstance();
      ParserRegistry.resetInstance();
      const instance2 = ParserRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Parser 註冊', () => {
    it('應該能夠註冊 Parser', () => {
      const parser = createMockParser('test-parser', ['.ts'], ['typescript']);

      expect(() => {
        registry.register(parser);
      }).not.toThrow();
    });

    it('應該在重複註冊時拋出錯誤', () => {
      const parser = createMockParser('test-parser', ['.ts'], ['typescript']);

      registry.register(parser);

      expect(() => {
        registry.register(parser);
      }).toThrow();
    });

    it('應該能夠覆蓋已存在的 Parser', () => {
      const parser1 = createMockParser('test-parser', ['.ts'], ['typescript']);
      const parser2 = createMockParser('test-parser', ['.ts'], ['typescript']);

      registry.register(parser1);

      expect(() => {
        registry.register(parser2, { override: true });
      }).not.toThrow();
    });

    it('應該能夠設置優先級', () => {
      const parser1 = createMockParser('parser1', ['.ts'], ['typescript']);
      const parser2 = createMockParser('parser2', ['.ts'], ['typescript']);

      registry.register(parser1, { priority: 1 });
      registry.register(parser2, { priority: 10 });

      // 優先級高的會被回傳
      const parser = registry.getParser('.ts');
      expect(parser).toBeDefined();
    });
  });

  describe('Parser 查詢', () => {
    beforeEach(() => {
      const tsParser = createMockParser('ts-parser', ['.ts', '.tsx'], ['typescript']);
      const jsParser = createMockParser('js-parser', ['.js', '.jsx'], ['javascript']);
      const swiftParser = createMockParser('swift-parser', ['.swift'], ['swift']);

      registry.register(tsParser);
      registry.register(jsParser);
      registry.register(swiftParser);
    });

    it('應該能夠根據副檔名查詢 Parser', () => {
      const parser = registry.getParser('.ts');
      expect(parser).toBeDefined();
      expect(parser?.name).toBe('ts-parser');
    });

    it('應該能夠根據語言查詢 Parser', () => {
      const parser = registry.getParserByLanguage('typescript');
      expect(parser).toBeDefined();
      expect(parser?.name).toBe('ts-parser');
    });

    it('應該能夠根據名稱取得 Parser', () => {
      const parser = registry.getParserByName('ts-parser');
      expect(parser).toBeDefined();
      expect(parser?.name).toBe('ts-parser');
    });

    it('應該在 Parser 不存在時回傳 null', () => {
      const parser = registry.getParserByName('nonexistent');
      expect(parser).toBeNull();
    });

    it('應該能夠檢查 Parser 是否存在', () => {
      expect(registry.getParserByName('ts-parser')).not.toBeNull();
      expect(registry.getParserByName('nonexistent')).toBeNull();
    });

    it('應該能夠列出所有 Parser', () => {
      const parsers = registry.listParsers();
      expect(parsers.length).toBe(3);
    });

    it('應該在沒有匹配的副檔名時回傳 null', () => {
      const parser = registry.getParser('.unknown');
      expect(parser).toBeNull();
    });

    it('應該在沒有匹配的語言時回傳 null', () => {
      const parser = registry.getParserByLanguage('unknown');
      expect(parser).toBeNull();
    });
  });

  describe('Parser 優先級', () => {
    it('應該根據優先級排序', () => {
      const parser1 = createMockParser('parser1', ['.ts'], ['typescript']);
      const parser2 = createMockParser('parser2', ['.ts'], ['typescript']);
      const parser3 = createMockParser('parser3', ['.ts'], ['typescript']);

      registry.register(parser1, { priority: 1 });
      registry.register(parser2, { priority: 10 });
      registry.register(parser3, { priority: 5 });

      // getParser 回傳最高優先級的 parser
      const parser = registry.getParser('.ts');
      expect(parser).toBeDefined();

      // 應該回傳 parser2 (priority 10 最高)
      expect(parser?.name).toBe('parser2');
    });
  });

  describe('Parser 移除', () => {
    beforeEach(() => {
      const parser = createMockParser('test-parser', ['.ts'], ['typescript']);
      registry.register(parser);
    });

    it('應該能夠移除 Parser', () => {
      expect(registry.getParserByName('test-parser')).not.toBeNull();
      registry.unregister('test-parser');
      expect(registry.getParserByName('test-parser')).toBeNull();
    });

    it('應該在移除不存在的 Parser 時拋出錯誤', () => {
      expect(() => {
        registry.unregister('nonexistent');
      }).toThrow();
    });
  });

  describe('資源清理', () => {
    it('應該能夠清理所有 Parser', async () => {
      const parser1 = createMockParser('parser1', ['.ts'], ['typescript']);
      const parser2 = createMockParser('parser2', ['.js'], ['javascript']);

      registry.register(parser1);
      registry.register(parser2);

      await registry.dispose();

      // dispose 後所有操作都應該拋出錯誤
      expect(() => {
        registry.listParsers();
      }).toThrow();
    });

    it('應該在清理後拋出錯誤', async () => {
      await registry.dispose();

      const parser = createMockParser('test', ['.ts'], ['typescript']);

      expect(() => {
        registry.register(parser);
      }).toThrow();
    });
  });
});
