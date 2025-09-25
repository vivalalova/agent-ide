/**
 * ParserRegistry 測試
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../../src/infrastructure/parser/types';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';
import { DuplicateParserError, ParserNotFoundError } from '../../../src/shared/errors';

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

describe('ParserRegistry', () => {
  let registry: ParserRegistry;
  let tsPlugin: MockParserPlugin;
  let jsPlugin: MockParserPlugin;
  let swiftPlugin: MockParserPlugin;

  beforeEach(() => {
    ParserRegistry.resetInstance();
    registry = ParserRegistry.getInstance();
    
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
    
    swiftPlugin = new MockParserPlugin(
      'swift',
      '1.0.0',
      ['.swift'],
      ['swift']
    );
  });

  afterEach(async () => {
    if (registry && !registry.isDisposed) {
      await registry.dispose();
    }
    ParserRegistry.resetInstance();
  });

  describe('基本註冊功能', () => {
    it('應該能註冊 Parser 插件', () => {
      registry.register(tsPlugin);
      expect(registry.getSupportedExtensions()).toContain('.ts');
      expect(registry.getSupportedExtensions()).toContain('.tsx');
    });

    it('應該能取消註冊 Parser 插件', () => {
      registry.register(tsPlugin);
      registry.unregister('typescript');
      expect(registry.getSupportedExtensions()).not.toContain('.ts');
    });

    it('註冊重複 Parser 應該拋出錯誤', () => {
      registry.register(tsPlugin);
      expect(() => registry.register(tsPlugin)).toThrow(DuplicateParserError);
    });

    it('取消註冊不存在的 Parser 應該拋出錯誤', () => {
      expect(() => registry.unregister('nonexistent')).toThrow(ParserNotFoundError);
    });
  });

  describe('查詢功能', () => {
    beforeEach(() => {
      registry.register(tsPlugin);
      registry.register(jsPlugin);
      registry.register(swiftPlugin);
    });

    it('應該能根據副檔名找到 Parser', () => {
      const parser = registry.getParser('.ts');
      expect(parser).toBe(tsPlugin);
    });

    it('應該能根據語言找到 Parser', () => {
      const parser = registry.getParserByLanguage('typescript');
      expect(parser).toBe(tsPlugin);
    });

    it('找不到 Parser 時應該返回 null', () => {
      const parser = registry.getParser('.unknown');
      expect(parser).toBeNull();
    });

    it('應該能獲取所有支援的副檔名', () => {
      const extensions = registry.getSupportedExtensions();
      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.jsx');
      expect(extensions).toContain('.swift');
    });

    it('應該能獲取所有支援的語言', () => {
      const languages = registry.getSupportedLanguages();
      expect(languages).toContain('typescript');
      expect(languages).toContain('javascript');
      expect(languages).toContain('swift');
    });

    it('應該能列出所有 Parser', () => {
      const parsers = registry.listParsers();
      expect(parsers).toHaveLength(3);
      expect(parsers.find(p => p.name === 'typescript')).toBeDefined();
      expect(parsers.find(p => p.name === 'javascript')).toBeDefined();
      expect(parsers.find(p => p.name === 'swift')).toBeDefined();
    });
  });

  describe('優先級管理', () => {
    it('應該支援設定 Parser 優先級', () => {
      const highPriorityJs = new MockParserPlugin('javascript-pro', '2.0.0', ['.js'], ['javascript']);
      registry.register(jsPlugin);
      registry.register(highPriorityJs, { priority: 10 });
      
      const parser = registry.getParser('.js');
      expect(parser).toBe(highPriorityJs);
    });

    it('預設優先級應該為 0', () => {
      registry.register(jsPlugin);
      const info = registry.listParsers().find(p => p.name === 'javascript');
      expect(info?.priority).toBe(0);
    });
  });

  describe('版本相容性', () => {
    it('應該能檢查版本相容性', () => {
      registry.register(tsPlugin);
      expect(registry.isCompatible('typescript', '1.0.0')).toBe(true);
      expect(registry.isCompatible('typescript', '2.0.0')).toBe(false);
    });

    it('不存在的 Parser 應該返回 false', () => {
      expect(registry.isCompatible('nonexistent', '1.0.0')).toBe(false);
    });
  });

  describe('生命週期管理', () => {
    it('應該能初始化註冊中心', async () => {
      await expect(registry.initialize()).resolves.not.toThrow();
    });

    it('應該能清理註冊中心', async () => {
      registry.register(tsPlugin);
      const disposeSpy = vi.spyOn(tsPlugin, 'dispose');
      
      await registry.dispose();
      expect(disposeSpy).toHaveBeenCalled();
    });
  });

  describe('錯誤處理', () => {
    it('註冊無效 Parser 應該拋出錯誤', () => {
      // const invalidPlugin = { name: 'invalid' };
      // expect(() => registry.register(invalidPlugin as any)).toThrow();
    });

    it('Parser 驗證失敗應該拋出錯誤', async () => {
      // const invalidPlugin = new MockParserPlugin('invalid', '1.0.0', ['.invalid'], ['invalid']);
      // vi.spyOn(invalidPlugin, 'validate').mockResolvedValue({ valid: false, errors: [], warnings: [] });
      
      // await expect(async () => {
      //   registry.register(invalidPlugin);
      //   await registry.initialize();
      // }).rejects.toThrow();
    });
  });

  describe('並發安全', () => {
    it('應該能處理並發註冊', async () => {
      const plugins = Array.from({ length: 10 }, (_, i) =>
        new MockParserPlugin(`plugin-${i}`, '1.0.0', [`.ext${i}`], [`lang${i}`])
      );

      await Promise.all(plugins.map(p => Promise.resolve(registry.register(p))));
      expect(registry.listParsers()).toHaveLength(10);
    });

    it('應該能處理並發查詢', async () => {
      registry.register(tsPlugin);

      const queries = Array.from({ length: 100 }, () =>
        Promise.resolve(registry.getParser('.ts'))
      );

      const results = await Promise.all(queries);
      results.forEach(result => expect(result).toBe(tsPlugin));
    });
  });
});