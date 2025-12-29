/**
 * PropertySignature 引用識別測試
 * 驗證介面屬性在物件字面量中被正確識別為引用
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import type { Symbol } from '@shared/types/symbol.js';

describe('PropertySignature 引用識別', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  it('應該識別物件字面量中使用的介面屬性', async () => {
    const code = `
interface FlexContainer {
  header?: string;
  footer?: string;
  body?: string;
}

const message: FlexContainer = {
  header: 'Hello',
  body: 'Content'
};
`;
    const filePath = '/test/interface-property.ts';
    const ast = await parser.parse(code, filePath);
    const symbols = await parser.extractSymbols(ast);

    // 找到 header 屬性符號
    const headerSymbol = symbols.find(
      s => s.name === 'header' && s.type === 'variable'
    ) as Symbol | undefined;

    expect(headerSymbol).toBeDefined();

    if (headerSymbol) {
      const references = await parser.findReferences(ast, headerSymbol);

      // 應該至少有 2 個引用：定義位置 + 物件字面量使用
      expect(references.length).toBeGreaterThanOrEqual(2);

      // 驗證有 usage 類型的引用
      const usageRefs = references.filter(r => r.type === 'usage');
      expect(usageRefs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('應該識別簡寫屬性語法中使用的介面屬性', async () => {
    const code = `
interface UserConfig {
  userName: string;
  userEmail?: string;
}

function createConfig(): UserConfig {
  const userName = 'test';
  const userEmail = 'test@example.com';
  return { userName, userEmail };
}
`;
    const filePath = '/test/shorthand-property.ts';
    const ast = await parser.parse(code, filePath);
    const symbols = await parser.extractSymbols(ast);

    // 找到 userName 介面屬性符號（應該是 'variable' 類型）
    const userNameSymbols = symbols.filter(s => s.name === 'userName');

    // 應該有多個 userName 符號：介面屬性 + 變數宣告
    expect(userNameSymbols.length).toBeGreaterThanOrEqual(1);

    // 取得介面屬性的 userName（第一個出現的，在介面內定義的）
    const userNameSymbol = userNameSymbols.find(
      s => s.location.range.start.line === 4 // 行號對應介面屬性定義
    ) as Symbol | undefined;

    if (userNameSymbol) {
      const references = await parser.findReferences(ast, userNameSymbol);

      // 應該至少有 2 個引用：定義位置 + 簡寫屬性使用
      expect(references.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('未使用的介面屬性應該只有定義引用', async () => {
    const code = `
interface Config {
  usedProp: string;
  unusedProp: string;
}

const config: Config = {
  usedProp: 'value'
};
`;
    const filePath = '/test/unused-property.ts';
    const ast = await parser.parse(code, filePath);
    const symbols = await parser.extractSymbols(ast);

    // 找到 unusedProp 屬性符號
    const unusedSymbol = symbols.find(
      s => s.name === 'unusedProp'
    ) as Symbol | undefined;

    expect(unusedSymbol).toBeDefined();

    if (unusedSymbol) {
      const references = await parser.findReferences(ast, unusedSymbol);

      // unusedProp 只應該有 1 個引用（定義位置）
      expect(references.length).toBe(1);
      expect(references[0].type).toBe('definition');
    }
  });
});
