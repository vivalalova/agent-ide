/**
 * ParserPlugin 介面測試
 * 測試 Parser 插件介面的契約和行為
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ParserPlugin } from '../../../src/infrastructure/parser/interface';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../../src/infrastructure/parser/types';

// Mock 實作用於測試
class MockParserPlugin implements ParserPlugin {
  readonly name = 'mock-parser';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.mock'] as const;
  readonly supportedLanguages = ['mock'] as const;

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
        language: 'mock',
        version: '1.0.0',
        parserOptions: {},
        parseTime: 0,
        nodeCount: 1
      }
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

  async dispose(): Promise<void> {
    // 清理資源
  }
}

describe('ParserPlugin Interface', () => {
  describe('基本屬性', () => {
    it('應該有必需的基本屬性', () => {
      const plugin = new MockParserPlugin();

      expect(plugin.name).toBe('mock-parser');
      expect(plugin.version).toBe('1.0.0');
      expect(plugin.supportedExtensions).toEqual(['.mock']);
      expect(plugin.supportedLanguages).toEqual(['mock']);
    });

    it('支援的副檔名應該是唯讀陣列', () => {
      const plugin = new MockParserPlugin();
      
      // TypeScript 編譯時會檢查這個，但我們也可以進行執行時檢查
      expect(Array.isArray(plugin.supportedExtensions)).toBe(true);
      expect(plugin.supportedExtensions.length).toBeGreaterThan(0);
    });

    it('支援的語言應該是唯讀陣列', () => {
      const plugin = new MockParserPlugin();
      
      expect(Array.isArray(plugin.supportedLanguages)).toBe(true);
      expect(plugin.supportedLanguages.length).toBeGreaterThan(0);
    });
  });

  describe('核心功能方法', () => {
    let plugin: ParserPlugin;

    beforeEach(() => {
      plugin = new MockParserPlugin();
    });

    it('parse 方法應該返回 AST', async () => {
      const code = 'const x = 1;';
      const filePath = '/test/file.mock';
      
      const ast = await plugin.parse(code, filePath);
      
      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe(filePath);
      expect(ast.root).toBeDefined();
      expect(ast.metadata).toBeDefined();
      expect(ast.metadata.language).toBe('mock');
    });

    it('extractSymbols 方法應該返回符號陣列', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.mock');
      
      const symbols = await plugin.extractSymbols(ast);
      
      expect(Array.isArray(symbols)).toBe(true);
    });

    it('findReferences 方法應該返回引用陣列', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.mock');
      const mockSymbol: Symbol = {
        name: 'x',
        type: 'variable' as any,
        location: {
          filePath: '/test/file.mock',
          range: { start: { line: 1, column: 7 }, end: { line: 1, column: 8 } }
        },
        modifiers: []
      };
      
      const references = await plugin.findReferences(ast, mockSymbol);
      
      expect(Array.isArray(references)).toBe(true);
    });

    it('extractDependencies 方法應該返回依賴陣列', async () => {
      const ast = await plugin.parse('import x from "y";', '/test/file.mock');
      
      const dependencies = await plugin.extractDependencies(ast);
      
      expect(Array.isArray(dependencies)).toBe(true);
    });
  });

  describe('重構支援方法', () => {
    let plugin: ParserPlugin;

    beforeEach(() => {
      plugin = new MockParserPlugin();
    });

    it('rename 方法應該返回程式碼編輯陣列', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.mock');
      const position: Position = { line: 1, column: 7 };
      const newName = 'newVariable';
      
      const edits = await plugin.rename(ast, position, newName);
      
      expect(Array.isArray(edits)).toBe(true);
    });

    it('extractFunction 方法應該返回程式碼編輯陣列', async () => {
      const ast = await plugin.parse('const x = 1; const y = 2;', '/test/file.mock');
      const selection: Range = {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 13 }
      };
      
      const edits = await plugin.extractFunction(ast, selection);
      
      expect(Array.isArray(edits)).toBe(true);
    });
  });

  describe('查詢支援方法', () => {
    let plugin: ParserPlugin;

    beforeEach(() => {
      plugin = new MockParserPlugin();
    });

    it('findDefinition 方法應該返回定義或 null', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.mock');
      const position: Position = { line: 1, column: 7 };
      
      const definition = await plugin.findDefinition(ast, position);
      
      // 可能返回 Definition 物件或 null
      expect(definition === null || (definition && typeof definition === 'object')).toBe(true);
    });

    it('findUsages 方法應該返回使用陣列', async () => {
      const ast = await plugin.parse('const x = 1;', '/test/file.mock');
      const mockSymbol: Symbol = {
        name: 'x',
        type: 'variable' as any,
        location: {
          filePath: '/test/file.mock',
          range: { start: { line: 1, column: 7 }, end: { line: 1, column: 8 } }
        },
        modifiers: []
      };
      
      const usages = await plugin.findUsages(ast, mockSymbol);
      
      expect(Array.isArray(usages)).toBe(true);
    });
  });

  describe('驗證和生命週期方法', () => {
    let plugin: ParserPlugin;

    beforeEach(() => {
      plugin = new MockParserPlugin();
    });

    it('validate 方法應該返回驗證結果', async () => {
      const result = await plugin.validate();
      
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('dispose 方法應該可以安全調用', async () => {
      // 測試 dispose 不會拋出錯誤
      await expect(plugin.dispose()).resolves.not.toThrow();
    });

    it('dispose 方法應該能多次調用', async () => {
      await plugin.dispose();
      await expect(plugin.dispose()).resolves.not.toThrow();
    });
  });

  describe('錯誤處理', () => {
    let plugin: ParserPlugin;

    beforeEach(() => {
      plugin = new MockParserPlugin();
    });

    it('parse 方法遇到無效程式碼時應該適當處理', async () => {
      // 這個測試依賴具體的 Parser 實作
      // 在 Mock 實作中，我們假設它能處理任何輸入
      await expect(plugin.parse('invalid code', '/test/file.mock')).resolves.not.toThrow();
    });

    it('方法參數為空時應該適當處理', async () => {
      await expect(plugin.parse('', '/test/file.mock')).resolves.not.toThrow();
    });
  });

  describe('介面契約遵循', () => {
    it('所有非同步方法都應該返回 Promise', () => {
      const plugin = new MockParserPlugin();
      
      // 檢查所有方法都返回 Promise
      expect(plugin.parse('', '')).toBeInstanceOf(Promise);
      expect(plugin.extractSymbols({} as AST)).toBeInstanceOf(Promise);
      expect(plugin.findReferences({} as AST, {} as Symbol)).toBeInstanceOf(Promise);
      expect(plugin.extractDependencies({} as AST)).toBeInstanceOf(Promise);
      expect(plugin.rename({} as AST, { line: 1, column: 1 }, '')).toBeInstanceOf(Promise);
      expect(plugin.extractFunction({} as AST, { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } })).toBeInstanceOf(Promise);
      expect(plugin.findDefinition({} as AST, { line: 1, column: 1 })).toBeInstanceOf(Promise);
      expect(plugin.findUsages({} as AST, {} as Symbol)).toBeInstanceOf(Promise);
      expect(plugin.validate()).toBeInstanceOf(Promise);
      expect(plugin.dispose()).toBeInstanceOf(Promise);
    });

    it('只讀屬性不應該被修改', () => {
      const plugin = new MockParserPlugin();
      
      // TypeScript 在編譯時會檢查這些，但我們可以驗證運行時行為
      expect(() => {
        (plugin as any).name = 'changed';
      }).not.toThrow(); // 在 JavaScript 中這不會拋出錯誤，但 TypeScript 會阻止這種行為
      
      // 對於 readonly 陣列，JavaScript 運行時不會阻止修改
      // 這主要依賴 TypeScript 編譯時檢查
      expect(Array.isArray(plugin.supportedExtensions)).toBe(true);
      expect(Array.isArray(plugin.supportedLanguages)).toBe(true);
    });
  });
});