/**
 * Parser 插件整合測試
 * 測試不同 Parser 插件之間的協同工作和系統整合
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../test-utils/cleanup';
import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../src/infrastructure/parser/types';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';
import { ParserFactory } from '../../src/infrastructure/parser/factory';
import { DuplicateParserError } from '../../src/shared/errors';

// 模擬 TypeScript Parser
class MockTypeScriptParser implements ParserPlugin {
  readonly name = 'typescript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.ts', '.tsx'] as const;
  readonly supportedLanguages = ['typescript'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    // 簡化的 TypeScript AST 解析
    const hasClass = code.includes('class ');
    const hasFunction = code.includes('function ');
    const hasInterface = code.includes('interface ');

    return {
      type: 'Program',
      root: {
        type: 'Program',
        children: [
          ...(hasClass ? [{ type: 'ClassDeclaration', value: 'TestClass' }] : []),
          ...(hasFunction ? [{ type: 'FunctionDeclaration', value: 'testFunction' }] : []),
          ...(hasInterface ? [{ type: 'InterfaceDeclaration', value: 'TestInterface' }] : [])
        ]
      },
      sourceFile: filePath,
      metadata: { language: 'typescript', parsed: true }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];

    // 從 AST 中提取符號
    for (const child of ast.root.children || []) {
      if (child.type === 'ClassDeclaration') {
        symbols.push({
          name: child.value as string,
          type: 'class',
          position: { line: 1, column: 1 },
          scope: { type: 'global' },
          modifiers: ['export']
        });
      } else if (child.type === 'FunctionDeclaration') {
        symbols.push({
          name: child.value as string,
          type: 'function',
          position: { line: 2, column: 1 },
          scope: { type: 'global' },
          modifiers: ['export']
        });
      } else if (child.type === 'InterfaceDeclaration') {
        symbols.push({
          name: child.value as string,
          type: 'interface',
          position: { line: 3, column: 1 },
          scope: { type: 'global' },
          modifiers: ['export']
        });
      }
    }

    return symbols;
  }

  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    return [
      {
        symbol,
        position: { line: 1, column: 1 },
        type: 'definition'
      }
    ];
  }

  async extractDependencies(ast: AST): Promise<Dependency[]> {
    return [
      {
        path: './types',
        type: 'import',
        isRelative: true,
        importedSymbols: ['TestType']
      }
    ];
  }

  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    return [
      {
        range: { start: position, end: position },
        newText: newName
      }
    ];
  }

  async extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]> {
    return [
      {
        range: selection,
        newText: `function extracted() {\n  // 提取的函式\n}`
      }
    ];
  }

  async findDefinition(ast: AST, position: Position): Promise<Definition | null> {
    return {
      name: 'TestClass',
      position: { line: 1, column: 1 },
      filePath: ast.sourceFile
    };
  }

  async findUsages(ast: AST, symbol: Symbol): Promise<Usage[]> {
    return [
      {
        symbol,
        position: { line: 1, column: 1 },
        context: 'declaration'
      }
    ];
  }

  async validate(): Promise<ValidationResult> {
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  async dispose(): Promise<void> {
    // TypeScript parser 清理
  }
}

// 模擬 JavaScript Parser
class MockJavaScriptParser implements ParserPlugin {
  readonly name = 'javascript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.js', '.jsx'] as const;
  readonly supportedLanguages = ['javascript'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    const hasFunction = code.includes('function ');
    const hasClass = code.includes('class ');

    return {
      type: 'Program',
      root: {
        type: 'Program',
        children: [
          ...(hasFunction ? [{ type: 'FunctionDeclaration', value: 'jsFunction' }] : []),
          ...(hasClass ? [{ type: 'ClassDeclaration', value: 'JSClass' }] : [])
        ]
      },
      sourceFile: filePath,
      metadata: { language: 'javascript', parsed: true }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];

    for (const child of ast.root.children || []) {
      if (child.type === 'FunctionDeclaration') {
        symbols.push({
          name: child.value as string,
          type: 'function',
          position: { line: 1, column: 1 },
          scope: { type: 'global' },
          modifiers: []
        });
      }
    }

    return symbols;
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
    return {
      isValid: true,
      errors: [],
      warnings: []
    };
  }

  async dispose(): Promise<void> {
    // JavaScript parser 清理
  }
}

describe('Parser Plugin Integration', () => {
  let registry: ParserRegistry;
  let factory: ParserFactory;
  let tsParser: MockTypeScriptParser;
  let jsParser: MockJavaScriptParser;

  beforeEach(() => {
    registry = new ParserRegistry();
    factory = new ParserFactory(registry);
    tsParser = new MockTypeScriptParser();
    jsParser = new MockJavaScriptParser();
  });

  afterEach(async () => {
    await registry.dispose();
  });

  describe('多插件註冊與管理', () => {
    it('應該能註冊多個 Parser 插件', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const parsers = registry.listParsers();
      expect(parsers).toHaveLength(2);
      expect(parsers.map(p => p.name)).toContain('typescript');
      expect(parsers.map(p => p.name)).toContain('javascript');
    }, { testName: 'multiple-parser-registration' }));

    it('應該能根據檔案副檔名選擇正確的 Parser', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const tsParserFound = registry.getParser('.ts');
      const jsParserFound = registry.getParser('.js');

      expect(tsParserFound?.name).toBe('typescript');
      expect(jsParserFound?.name).toBe('javascript');
    }, { testName: 'parser-selection-by-extension' }));

    it('應該正確處理不支援的檔案類型', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const unknownParser = registry.getParser('.py');
      expect(unknownParser).toBeNull();
    }, { testName: 'unsupported-file-type-handling' }));
  });

  describe('跨插件功能整合', () => {
    it('應該能處理多種語言的程式碼解析', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const tsCode = `
        interface TestInterface {
          id: number;
        }
        class TestClass implements TestInterface {
          id: number = 1;
        }
        function testFunction(): void {}
      `;

      const jsCode = `
        class JSClass {
          constructor() {
            this.id = 1;
          }
        }
        function jsFunction() {
          return 'hello';
        }
      `;

      const tsParserInstance = registry.getParser('.ts');
      const jsParserInstance = registry.getParser('.js');

      const tsAST = await tsParserInstance!.parse(tsCode, 'test.ts');
      const jsAST = await jsParserInstance!.parse(jsCode, 'test.js');

      expect(tsAST.root.children).toHaveLength(3); // interface, class, function
      expect(jsAST.root.children).toHaveLength(2); // class, function
    }, { testName: 'multi-language-parsing' }));

    it('應該能提取不同語言的符號資訊', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const tsCode = 'class TestClass {}\nfunction testFunction() {}';
      const jsCode = 'function jsFunction() {}';

      const tsParserInstance = registry.getParser('.ts');
      const jsParserInstance = registry.getParser('.js');

      const tsAST = await tsParserInstance!.parse(tsCode, 'test.ts');
      const jsAST = await jsParserInstance!.parse(jsCode, 'test.js');

      const tsSymbols = await tsParserInstance!.extractSymbols(tsAST);
      const jsSymbols = await jsParserInstance!.extractSymbols(jsAST);

      expect(tsSymbols).toHaveLength(2);
      expect(tsSymbols[0].type).toBe('class');
      expect(tsSymbols[1].type).toBe('function');

      expect(jsSymbols).toHaveLength(1);
      expect(jsSymbols[0].type).toBe('function');
    }, { testName: 'multi-language-symbol-extraction' }));
  });

  describe('Parser Factory 整合', () => {
    it('應該能透過 Factory 創建適當的 Parser', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const tsParserInstance = factory.createParser('test.ts');
      const jsParserInstance = factory.createParser('test.js');

      expect(tsParserInstance?.name).toBe('typescript');
      expect(jsParserInstance?.name).toBe('javascript');
    }, { testName: 'factory-parser-creation' }));

    it('應該能處理 Factory 創建失敗的情況', withMemoryOptimization(async () => {
      await registry.register(tsParser);

      const result = factory.createParser('test.py');
      expect(result).toBeNull();
    }, { testName: 'factory-creation-failure' }));
  });

  describe('併發處理與效能', () => {
    it('應該能併發處理多個檔案', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const files = [
        { path: 'test1.ts', code: 'class Test1 {}' },
        { path: 'test2.js', code: 'function test2() {}' },
        { path: 'test3.ts', code: 'interface Test3 {}' }
      ];

      const parsePromises = files.map(async (file) => {
        const ext = '.' + file.path.split('.').pop()!;
        const parser = registry.getParser(ext);
        if (!parser) throw new Error(`No parser for ${file.path}`);

        const ast = await parser.parse(file.code, file.path);
        const symbols = await parser.extractSymbols(ast);

        return {
          file: file.path,
          symbolCount: symbols.length
        };
      });

      const results = await Promise.all(parsePromises);

      expect(results).toHaveLength(3);
      expect(results[0].symbolCount).toBe(1); // class
      expect(results[1].symbolCount).toBe(1); // function
      expect(results[2].symbolCount).toBe(1); // interface
    }, { testName: 'concurrent-file-processing' }));

    it('應該能在高負載下保持穩定', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      const batchSize = 20;
      const batches = Array.from({ length: batchSize }, (_, i) => ({
        path: `test${i}.ts`,
        code: `class Test${i} { method${i}() {} }`
      }));

      const startTime = Date.now();

      const results = await Promise.all(
        batches.map(async (batch) => {
          const parser = registry.getParser('.ts');
          const ast = await parser!.parse(batch.code, batch.path);
          return parser!.extractSymbols(ast);
        })
      );

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(results).toHaveLength(batchSize);
      expect(processingTime).toBeLessThan(1000); // 應該在 1 秒內完成

      // 每個結果都應該包含一個類別符號
      results.forEach(symbols => {
        expect(symbols).toHaveLength(1);
        expect(symbols[0].type).toBe('class');
      });
    }, { testName: 'high-load-stability' }));
  });

  describe('錯誤處理與恢復', () => {
    it('應該能處理單一 Parser 失敗而不影響其他', withMemoryOptimization(async () => {
      // 創建會失敗的 Parser
      class FaultyParser extends MockTypeScriptParser {
        readonly name = 'faulty-parser';
        readonly supportedExtensions = ['.fault'] as const;

        async parse(): Promise<any> {
          throw new Error('Parse failed');
        }
      }
      const faultyParser = new FaultyParser();

      await registry.register(tsParser);
      await registry.register(jsParser);
      await registry.register(faultyParser);

      // 正常的 Parser 應該仍能工作
      const tsParserInstance = registry.getParser('.ts');
      const jsParserInstance = registry.getParser('.js');

      expect(tsParserInstance).toBeTruthy();
      expect(jsParserInstance).toBeTruthy();

      // 能正常解析
      const ast = await tsParserInstance!.parse('class Test {}', 'test.ts');
      expect(ast).toBeTruthy();
    }, { testName: 'isolated-parser-failure' }));

    it('應該能從 Parser 註冊錯誤中恢復', withMemoryOptimization(async () => {
      await registry.register(tsParser);

      // 嘗試註冊重複的 Parser（應該失敗）
      let errorCaught = false;
      try {
        await registry.register(tsParser);
      } catch (error) {
        expect(error).toBeInstanceOf(DuplicateParserError);
        errorCaught = true;
      }
      expect(errorCaught).toBe(true);

      // 但不應影響現有 Parser 的功能
      const parser = registry.getParser('.ts');
      expect(parser).toBeTruthy();
      expect(parser?.name).toBe('typescript');
    }, { testName: 'registration-error-recovery' }));
  });

  describe('資源管理與清理', () => {
    it('應該能正確清理所有 Parser 資源', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      // 確認 Parser 已註冊
      expect(registry.listParsers()).toHaveLength(2);

      // 清理資源
      await registry.dispose();

      // 檢查清理狀態（dispose 後不能再使用）
      expect(() => registry.listParsers()).toThrow('ParserRegistry 已被清理');
    }, { testName: 'resource-cleanup' }));

    it('應該能單獨移除特定 Parser', withMemoryOptimization(async () => {
      await registry.register(tsParser);
      await registry.register(jsParser);

      expect(registry.listParsers()).toHaveLength(2);

      // 移除 TypeScript Parser
      registry.unregister('typescript');

      const parsers = registry.listParsers();
      expect(parsers).toHaveLength(1);
      expect(parsers[0].name).toBe('javascript');
    }, { testName: 'individual-parser-removal' }));
  });
});