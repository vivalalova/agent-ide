/**
 * TypeScriptParser.findDefinition 遮蔽（shadowing）regression 測試
 *
 * H6：findDefinition 對識別字查找定義時呼叫 extractSymbols(ast) 取得整份
 * 檔案的符號列表，再用「第一個名稱相符者」線性尋找（`for (const symbol of
 * symbols) if (symbol.name === name) return ...`），完全不考慮作用域與
 * 遮蔽（shadowing）。當內層作用域宣告同名識別字遮蔽外層宣告時，查找內層
 * 識別字的定義會被外層宣告「搶先」命中，回傳錯誤的定義位置。
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptParser } from '@plugins/typescript/parser.js';

describe('TypeScriptParser.findDefinition shadowing regression（H6）', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  it('內層函式參數遮蔽外層同名 const 時，findDefinition 應回傳內層參數定義', async () => {
    const source = [
      'const value = 1;',
      'function f(value: number) { return value; }'
    ].join('\n') + '\n';

    const ast = await parser.parse(source, '/test/shadowing.ts');

    // 第 2 行 `return value;` 的 value 識別字（column 37 落在該識別字範圍內）
    const definition = await parser.findDefinition(ast, { line: 2, column: 37 });

    expect(definition).not.toBeNull();
    // Bug：目前會回傳第 1 行外層 const value 的定義
    // 正確：應回傳第 2 行函式參數 value 的定義（就近的內層作用域宣告）
    expect(definition!.location.range.start.line).toBe(2);
  });
});
