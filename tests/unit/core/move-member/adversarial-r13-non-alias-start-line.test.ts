/**
 * R13（缺陷）：findTypeAliasEnd 改 AST 定位後，若 startLine 指向的行不是
 * type alias 宣告（呼叫端 typescript-extractor 以 regex 掃原始文字、無 codeMask，
 * 註解或字串內容中「行首形如 type X」的行會被誤當宣告行傳入），
 * `statements.find(isTypeAliasDeclaration)` 會抓到切片中「後面」第一個真正的
 * type alias 並回傳其結尾行，把 startLine 到該 alias 之間不相干的程式碼
 * 全數併入範圍，move-member 會搬走錯誤區塊。
 *
 * 正確契約：找到的 type alias 必須從切片起始行開始，否則視為
 * 「startLine 上沒有 type alias」走 fallback 回傳 startLine。
 */
import { describe, expect, it } from 'vitest';
import { findTypeAliasEnd } from '@core/move-member/utils/range-finder.js';

describe('findTypeAliasEnd 起始行非 alias（adversarial R13）', () => {
  it('startLine 指向非 alias 陳述句時不得誤抓後面的 alias', () => {
    const lines = ['const before = 1;', 'type A = string;'];
    expect(findTypeAliasEnd(lines, 0)).toBe(0);
  });

  it('對照組：startLine 正確指向 alias 行時照常回傳結尾行', () => {
    const lines = ['type A =', '  | string', '  | number;'];
    expect(findTypeAliasEnd(lines, 0)).toBe(2);
  });
});
