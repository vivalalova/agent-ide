/**
 * TypeScriptSymbolExtractor 迴歸測試
 * 針對對抗式審查釘住的兩個缺陷：
 * 1. VariableDeclaration 節點被重複加入自建 AST，導致符號重複
 * 2. Destructuring binding pattern 中的識別符完全沒有被提取為符號
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptParser } from '@plugins/typescript/parser.js';

describe('TypeScriptSymbolExtractor', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  describe('VariableDeclaration 重複提取', () => {
    it('單一 const 宣告應該只產生一個符號', async () => {
      const code = 'const value = 1;';
      const ast = await parser.parse(code, '/test/single-declaration.ts');
      const symbols = await parser.extractSymbols(ast);

      const valueSymbols = symbols.filter(s => s.name === 'value');
      expect(valueSymbols).toHaveLength(1);
    });

    it('多變數宣告（同一個 VariableStatement）應該各自只產生一個符號', async () => {
      const code = 'const a = 1, b = 2, c = 3;';
      const ast = await parser.parse(code, '/test/multi-declaration.ts');
      const symbols = await parser.extractSymbols(ast);

      for (const name of ['a', 'b', 'c']) {
        expect(symbols.filter(s => s.name === name)).toHaveLength(1);
      }
    });

    it('let/var 宣告也不應重複', async () => {
      const code = 'let x = 1; var y = 2;';
      const ast = await parser.parse(code, '/test/let-var-declaration.ts');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.filter(s => s.name === 'x')).toHaveLength(1);
      expect(symbols.filter(s => s.name === 'y')).toHaveLength(1);
    });
  });

  describe('Destructuring binding pattern 符號提取', () => {
    it('物件解構應該提取出每個識別符的符號', async () => {
      const code = 'const { value } = source;';
      const ast = await parser.parse(code, '/test/object-destructure.ts');
      const symbols = await parser.extractSymbols(ast);

      const valueSymbols = symbols.filter(s => s.name === 'value');
      expect(valueSymbols).toHaveLength(1);
      expect(valueSymbols[0]?.type).toBe('variable');
    });

    it('物件解構搭配重新命名（renamed binding）應該使用綁定後的名稱', async () => {
      const code = 'const { value: renamed } = source;';
      const ast = await parser.parse(code, '/test/object-destructure-renamed.ts');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.filter(s => s.name === 'renamed')).toHaveLength(1);
      // 原始 property key 不應被誤植為獨立符號
      expect(symbols.filter(s => s.name === 'value')).toHaveLength(0);
    });

    it('陣列解構應該提取出每個識別符的符號', async () => {
      const code = 'const [first, second] = pair;';
      const ast = await parser.parse(code, '/test/array-destructure.ts');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.filter(s => s.name === 'first')).toHaveLength(1);
      expect(symbols.filter(s => s.name === 'second')).toHaveLength(1);
    });

    it('巢狀解構應該提取出最內層每個識別符的符號', async () => {
      const code = 'const { outer: { inner } } = source;';
      const ast = await parser.parse(code, '/test/nested-destructure.ts');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.filter(s => s.name === 'inner')).toHaveLength(1);
    });

    it('多個解構識別符後續被引用應該可被 search/rename 定位到', async () => {
      const code = 'const { value } = source;\nconsole.log(value);';
      const ast = await parser.parse(code, '/test/object-destructure-usage.ts');
      const symbols = await parser.extractSymbols(ast);

      const valueSymbol = symbols.find(s => s.name === 'value');
      expect(valueSymbol).toBeDefined();
    });
  });
});
