/**
 * BaseParserPlugin 基礎抽象類別測試
 * 測試基礎 Parser 插件的預設實作和可繼承性
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseParserPlugin } from '../../../src/infrastructure/parser/base';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities } from '../../../src/infrastructure/parser/types';

// 具體實作類別用於測試
class TestParserPlugin extends BaseParserPlugin {
  readonly name = 'test-parser';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.test'] as const;
  readonly supportedLanguages = ['test'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    return {
      sourceFile: filePath,
      root: {
        type: 'Program',
        range: { start: { line: 1, column: 1 }, end: { line: 1, column: code.length + 1 } },
        properties: { code },
        children: []
      },
      metadata: {
        language: 'test',
        version: '1.0.0',
        parserOptions: {},
        parseTime: 0,
        nodeCount: 1
      }
    };
  }
}

// 最小實作類別用於測試抽象方法
class MinimalParserPlugin extends BaseParserPlugin {
  readonly name = 'minimal-parser';
  readonly version = '0.1.0';
  readonly supportedExtensions = ['.min'] as const;
  readonly supportedLanguages = ['minimal'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    throw new Error('Not implemented');
  }
}

describe('BaseParserPlugin', () => {
  describe('抽象類別基本行為', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('應該可以被繼承', () => {
      expect(plugin).toBeInstanceOf(BaseParserPlugin);
      expect(plugin.name).toBe('test-parser');
      expect(plugin.version).toBe('1.0.0');
    });

    it('應該提供預設的配置選項', () => {
      const options = plugin.getDefaultOptions();
      expect(options).toBeDefined();
      expect(typeof options.strictMode).toBe('boolean');
    });

    it('應該提供預設的能力聲明', () => {
      const capabilities = plugin.getCapabilities();
      expect(capabilities).toBeDefined();
      expect(typeof capabilities.supportsRename).toBe('boolean');
      expect(typeof capabilities.supportsExtractFunction).toBe('boolean');
    });
  });

  describe('預設實作方法', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('extractSymbols 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.test');
      const symbols = await plugin.extractSymbols(ast);

      expect(Array.isArray(symbols)).toBe(true);
      // 預設實作通常返回空陣列
    });

    it('findReferences 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.test');
      const mockSymbol: Symbol = {
        name: 'x',
        type: 'variable' as any,
        location: {
          filePath: '/test/file.test',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
        },
        modifiers: []
      };

      const references = await plugin.findReferences(ast, mockSymbol);
      expect(Array.isArray(references)).toBe(true);
    });

    it('extractDependencies 應該有預設實作', async () => {
      const ast = await plugin.parse('import x from "y";', '/test/file.test');
      const dependencies = await plugin.extractDependencies(ast);

      expect(Array.isArray(dependencies)).toBe(true);
    });

    it('rename 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.test');
      const position: Position = { line: 1, column: 7 };
      const newName = 'newVariable';

      const edits = await plugin.rename(ast, position, newName);
      expect(Array.isArray(edits)).toBe(true);
    });

    it('extractFunction 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1; const y = 2;', '/test/file.test');
      const selection: Range = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 13 }
      };

      const edits = await plugin.extractFunction(ast, selection);
      expect(Array.isArray(edits)).toBe(true);
    });

    it('findDefinition 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.test');
      const position: Position = { line: 1, column: 7 };

      const definition = await plugin.findDefinition(ast, position);
      // 預設實作可能返回 null
      expect(definition === null || (definition && typeof definition === 'object')).toBe(true);
    });

    it('findUsages 應該有預設實作', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.test');
      const mockSymbol: Symbol = {
        name: 'x',
        type: 'variable' as any,
        location: {
          filePath: '/test/file.test',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } }
        },
        modifiers: []
      };

      const usages = await plugin.findUsages(ast, mockSymbol);
      expect(Array.isArray(usages)).toBe(true);
    });

    it('validate 應該有預設實作', async () => {
      const result = await plugin.validate();

      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('dispose 應該有預設實作', async () => {
      await expect(plugin.dispose()).resolves.not.toThrow();
    });
  });

  describe('錯誤處理和日誌', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('應該提供錯誤處理機制', () => {
      expect(typeof plugin.handleError).toBe('function');
    });

    it('應該提供日誌記錄機制', () => {
      expect(typeof plugin.log).toBe('function');
    });

    it('handleError 應該正確處理錯誤', () => {
      const error = new Error('Test error');
      const context = 'test context';

      expect(() => plugin.handleError(error, context)).not.toThrow();
    });

    it('log 方法應該支援不同級別', () => {
      expect(() => plugin.log('info', 'Test info message')).not.toThrow();
      expect(() => plugin.log('warn', 'Test warning message')).not.toThrow();
      expect(() => plugin.log('error', 'Test error message')).not.toThrow();
    });
  });

  describe('生命週期管理', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('應該提供初始化機制', () => {
      expect(typeof plugin.initialize).toBe('function');
    });

    it('初始化應該可以多次調用', async () => {
      await plugin.initialize();
      await expect(plugin.initialize()).resolves.not.toThrow();
    });

    it('isInitialized 應該正確反映初始化狀態', async () => {
      expect(plugin.isInitialized()).toBe(false);
      await plugin.initialize();
      expect(plugin.isInitialized()).toBe(true);
    });

    it('dispose 後應該將狀態重置', async () => {
      await plugin.initialize();
      expect(plugin.isInitialized()).toBe(true);

      await plugin.dispose();
      expect(plugin.isInitialized()).toBe(false);
    });

    it('isDisposed 應該正確反映清理狀態', async () => {
      expect(plugin.isDisposed()).toBe(false);
      await plugin.dispose();
      expect(plugin.isDisposed()).toBe(true);
    });
  });

  describe('配置管理', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('應該提供更新配置的方法', () => {
      expect(typeof plugin.updateOptions).toBe('function');
    });

    it('updateOptions 應該正確更新配置', () => {
      const newOptions: Partial<ParserOptions> = {
        strictMode: true,
        allowExperimentalFeatures: false
      };

      expect(() => plugin.updateOptions(newOptions)).not.toThrow();

      const currentOptions = plugin.getDefaultOptions();
      expect(currentOptions.strictMode).toBe(true);
    });

    it('getCapabilities 應該返回穩定的能力聲明', () => {
      const capabilities1 = plugin.getCapabilities();
      const capabilities2 = plugin.getCapabilities();

      expect(capabilities1).toEqual(capabilities2);
    });
  });

  describe('通用工具方法', () => {
    let plugin: TestParserPlugin;

    beforeEach(() => {
      plugin = new TestParserPlugin();
    });

    it('應該提供檔案路徑驗證', () => {
      expect(typeof plugin.validateFilePath).toBe('function');

      expect(plugin.validateFilePath('/valid/path.test')).toBe(true);
      expect(plugin.validateFilePath('')).toBe(false);
      expect(plugin.validateFilePath('invalid-extension.txt')).toBe(false);
    });

    it('應該提供程式碼內容驗證', () => {
      expect(typeof plugin.validateCode).toBe('function');

      expect(plugin.validateCode('valid code')).toBe(true);
      expect(plugin.validateCode('')).toBe(true); // 空程式碼也是合法的
    });

    it('應該提供位置驗證', () => {
      expect(typeof plugin.validatePosition).toBe('function');

      const validPosition: Position = { line: 1, column: 1 };
      const invalidPosition: Position = { line: 0, column: 1 };

      expect(plugin.validatePosition(validPosition)).toBe(true);
      expect(plugin.validatePosition(invalidPosition)).toBe(false);
    });
  });

  describe('最小實作測試', () => {
    it('最小實作應該能夠創建', () => {
      const plugin = new MinimalParserPlugin();
      expect(plugin).toBeInstanceOf(BaseParserPlugin);
      expect(plugin.name).toBe('minimal-parser');
    });

    it('最小實作的預設方法應該可用', async () => {
      const plugin = new MinimalParserPlugin();

      // 這些方法應該有預設實作，不會拋出錯誤
      await expect(plugin.validate()).resolves.not.toThrow();
      await expect(plugin.dispose()).resolves.not.toThrow();

      expect(plugin.getDefaultOptions()).toBeDefined();
      expect(plugin.getCapabilities()).toBeDefined();
    });
  });
});