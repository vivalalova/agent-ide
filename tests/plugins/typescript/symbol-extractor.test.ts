/**
 * TypeScript Symbol Extractor 測試
 * TDD 紅燈階段 - 編寫失敗的測試案例
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeScriptParser } from '../../../src/plugins/typescript/parser';
import { SymbolType } from '../../../src/shared/types';

describe('TypeScriptParser - Symbol Extraction', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  describe('類別符號提取', () => {
    it('應該能提取類別符號', async () => {
      const code = `
        class TestClass {
          private field: string;
          constructor(value: string) {
            this.field = value;
          }
          public method(): void {}
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const classSymbol = symbols.find(s => s.type === SymbolType.Class);
      expect(classSymbol).toBeDefined();
      expect(classSymbol!.name).toBe('TestClass');
      expect(classSymbol!.modifiers).not.toContain('export'); // 沒有 export 關鍵字
    });

    it('應該能提取類別成員', async () => {
      const code = `
        class TestClass {
          public publicField: string;
          private privateField: number;
          protected protectedField: boolean;
          
          constructor(value: string) {}
          public publicMethod(): void {}
          private privateMethod(): string { return ''; }
          static staticMethod(): void {}
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      // 檢查變數
      const publicField = symbols.find(s => s.name === 'publicField');
      expect(publicField).toBeDefined();
      expect(publicField!.modifiers).toContain('public');
      
      const privateField = symbols.find(s => s.name === 'privateField');
      expect(privateField).toBeDefined();
      expect(privateField!.modifiers).toContain('private');
      
      // 檢查方法
      const publicMethod = symbols.find(s => s.name === 'publicMethod');
      expect(publicMethod).toBeDefined();
      expect(publicMethod!.type).toBe(SymbolType.Function);
      expect(publicMethod!.modifiers).toContain('public');
      
      const staticMethod = symbols.find(s => s.name === 'staticMethod');
      expect(staticMethod).toBeDefined();
      expect(staticMethod!.modifiers).toContain('static');
    });
  });

  describe('介面符號提取', () => {
    it('應該能提取介面符號', async () => {
      const code = `
        interface TestInterface {
          name: string;
          age: number;
          greet(): void;
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const interfaceSymbol = symbols.find(s => s.type === SymbolType.Interface);
      expect(interfaceSymbol).toBeDefined();
      expect(interfaceSymbol!.name).toBe('TestInterface');
    });

    it('應該能提取介面成員', async () => {
      const code = `
        interface TestInterface {
          readonly readonlyProp: string;
          optionalProp?: number;
          method(): void;
          genericMethod<T>(arg: T): T;
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const readonlyProp = symbols.find(s => s.name === 'readonlyProp');
      expect(readonlyProp).toBeDefined();
      expect(readonlyProp!.modifiers).toContain('readonly');
      
      const optionalProp = symbols.find(s => s.name === 'optionalProp');
      expect(optionalProp).toBeDefined();
      expect(optionalProp!.modifiers).toContain('optional');
      
      const method = symbols.find(s => s.name === 'method');
      expect(method).toBeDefined();
      expect(method!.type).toBe(SymbolType.Function);
    });
  });

  describe('函式符號提取', () => {
    it('應該能提取函式宣告', async () => {
      const code = `
        function regularFunction(): void {}
        async function asyncFunction(): Promise<void> {}
        function* generatorFunction(): Generator<number> {}
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const regularFunc = symbols.find(s => s.name === 'regularFunction');
      expect(regularFunc).toBeDefined();
      expect(regularFunc!.type).toBe(SymbolType.Function);
      
      const asyncFunc = symbols.find(s => s.name === 'asyncFunction');
      expect(asyncFunc).toBeDefined();
      expect(asyncFunc!.modifiers).toContain('async');
      
      const generatorFunc = symbols.find(s => s.name === 'generatorFunction');
      expect(generatorFunc).toBeDefined();
      expect(generatorFunc!.modifiers).toContain('generator');
    });

    it('應該能提取箭頭函式', async () => {
      const code = `
        const arrowFunc = () => {};
        const typedArrowFunc: () => string = () => 'test';
        const asyncArrow = async () => {};
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const arrowFunc = symbols.find(s => s.name === 'arrowFunc');
      expect(arrowFunc).toBeDefined();
      expect(arrowFunc!.type).toBe(SymbolType.Constant); // const 變數應該是 Constant 類型
    });
  });

  describe('變數符號提取', () => {
    it('應該能提取不同類型的變數', async () => {
      const code = `
        const constVar: string = 'test';
        let letVar: number = 42;
        var varVar: boolean = true;
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const constSymbol = symbols.find(s => s.name === 'constVar');
      expect(constSymbol).toBeDefined();
      expect(constSymbol!.type).toBe(SymbolType.Constant);
      
      const letSymbol = symbols.find(s => s.name === 'letVar');
      expect(letSymbol).toBeDefined();
      expect(letSymbol!.type).toBe(SymbolType.Variable);
      
      const varSymbol = symbols.find(s => s.name === 'varVar');
      expect(varSymbol).toBeDefined();
      expect(varSymbol!.type).toBe(SymbolType.Variable);
    });
  });

  describe('型別符號提取', () => {
    it('應該能提取型別別名', async () => {
      const code = `
        type StringAlias = string;
        type ComplexType = {
          name: string;
          age: number;
        };
        type UnionType = string | number;
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const stringAlias = symbols.find(s => s.name === 'StringAlias');
      expect(stringAlias).toBeDefined();
      expect(stringAlias!.type).toBe(SymbolType.Type);
      
      const complexType = symbols.find(s => s.name === 'ComplexType');
      expect(complexType).toBeDefined();
      expect(complexType!.type).toBe(SymbolType.Type);
    });
  });

  describe('列舉符號提取', () => {
    it('應該能提取列舉', async () => {
      const code = `
        enum Color {
          Red,
          Green,
          Blue
        }
        
        const enum Direction {
          Up = 'UP',
          Down = 'DOWN'
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const colorEnum = symbols.find(s => s.name === 'Color');
      expect(colorEnum).toBeDefined();
      expect(colorEnum!.type).toBe(SymbolType.Enum);
      
      const directionEnum = symbols.find(s => s.name === 'Direction');
      expect(directionEnum).toBeDefined();
      expect(directionEnum!.modifiers).toContain('const');
    });
  });

  describe('模組符號提取', () => {
    it('應該能提取命名空間', async () => {
      const code = `
        namespace TestNamespace {
          export interface TestInterface {}
          export class TestClass {}
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const namespace = symbols.find(s => s.name === 'TestNamespace');
      expect(namespace).toBeDefined();
      expect(namespace!.type).toBe(SymbolType.Namespace);
    });

    it('應該能提取模組宣告', async () => {
      const code = `
        declare module 'external-module' {
          export interface ExternalInterface {}
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const module = symbols.find(s => s.name === 'external-module');
      expect(module).toBeDefined();
      expect(module!.type).toBe(SymbolType.Module);
      expect(module!.modifiers).toContain('declare');
    });
  });

  describe('作用域處理', () => {
    it('應該正確設定符號的作用域', async () => {
      const code = `
        class TestClass {
          private field: string;
          
          constructor() {
            const localVar = 'test';
          }
        }
      `;
      const ast = await parser.parse(code, 'test.ts');
      const symbols = await parser.extractSymbols(ast);
      
      const field = symbols.find(s => s.name === 'field');
      expect(field).toBeDefined();
      expect(field!.scope).toBeDefined();
      expect(field!.scope!.type).toBe('class');
      expect(field!.scope!.name).toBe('TestClass');
      
      const localVar = symbols.find(s => s.name === 'localVar');
      expect(localVar).toBeDefined();
      expect(localVar!.scope).toBeDefined();
      expect(localVar!.scope!.type).toBe('function');
    });
  });
});