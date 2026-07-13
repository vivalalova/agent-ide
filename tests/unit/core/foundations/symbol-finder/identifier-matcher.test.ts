/**
 * 測試 createIdentifierBoundaryRegex（Unicode 邊界感知的識別符比對）
 *
 * 驗既有已修行為（缺陷 G6）：純 ASCII 正則 `\b` 以 `\w`（[A-Za-z0-9_]）定義邊界，
 * 對純 Unicode 識別符（前後皆非 `\w` 字元時）完全比對不到；此工具改以
 * ID_Continue 字元類 lookaround 判定邊界，涵蓋 Unicode 識別符，且對 ASCII
 * 名稱與原 `\b` 行為等價。
 */

import { describe, it, expect } from 'vitest';
import { createIdentifierBoundaryRegex } from '@core/foundations/symbol-finder/index.js';

describe('createIdentifierBoundaryRegex', () => {
  it('純 Unicode 名稱（用户）在前後皆非識別符字元時可全字匹配', () => {
    const regex = createIdentifierBoundaryRegex('用户');
    const text = '(用户)';

    expect(regex.test(text)).toBe(true);
    const match = text.match(regex);
    expect(match?.[0]).toBe('用户');
  });

  it('不匹配較長識別符的子字串（用户名 中的 用户 不算匹配）', () => {
    const regex = createIdentifierBoundaryRegex('用户');
    const text = '用户名';

    expect(regex.test(text)).toBe(false);
  });

  it('ASCII 名稱行為與 \\b 等價：foo 不匹配 myfoo 中的子字串', () => {
    const regex = createIdentifierBoundaryRegex('foo');
    expect(regex.test('myfoo')).toBe(false);
    expect(regex.test('foobar')).toBe(false);
    expect(regex.test('my foo bar')).toBe(true);
  });

  it('ASCII 名稱在字串開頭/結尾（非識別符字元包圍）也能匹配，與 \\b 等價', () => {
    const regex = createIdentifierBoundaryRegex('foo');
    expect(regex.test('foo')).toBe(true);
    expect(regex.test('(foo)')).toBe(true);
    expect(regex.test('foo.bar')).toBe(true);
  });

  it('含正則特殊字元的名稱已逸出，以字面值比對而非正則語法', () => {
    const regex = createIdentifierBoundaryRegex('$item');
    expect(regex.test('const $item = 1;')).toBe(true);
    expect(regex.test('xitem')).toBe(false);

    const regexWithDot = createIdentifierBoundaryRegex('a.b');
    // 若 `.` 未逸出，會被當成正則的「任意字元」，連 'axb' 也會誤配
    expect(regexWithDot.test('axb')).toBe(false);
    expect(regexWithDot.test('a.b')).toBe(true);
  });
});
