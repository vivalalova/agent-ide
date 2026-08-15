/**
 * Parser 共用輔助函數測試
 * 聚焦 isValidUnicodeIdentifier 的 ECMAScript 識別符合法性
 */

import { describe, it, expect } from 'vitest';
import { isValidUnicodeIdentifier } from '@plugins/shared/parser-helpers.js';

const ZWNJ = '\u200C';
const ZWJ = '\u200D';

describe('isValidUnicodeIdentifier', () => {
  it('應該接受基本 ASCII 識別符', () => {
    expect(isValidUnicodeIdentifier('userName')).toBe(true);
    expect(isValidUnicodeIdentifier('_private')).toBe(true);
    expect(isValidUnicodeIdentifier('$jquery')).toBe(true);
  });

  it('應該接受 Unicode 識別符', () => {
    expect(isValidUnicodeIdentifier('用戶名稱')).toBe(true);
    expect(isValidUnicodeIdentifier('π')).toBe(true);
  });

  // MARK: - ZWNJ/ZWJ
  // ECMAScript 規範（IdentifierPart）允許識別符中間出現
  // U+200C（ZERO WIDTH NON-JOINER）與 U+200D（ZERO WIDTH JOINER），
  // 常見於天城文、阿拉伯文等需要連字控制的書寫系統。
  //
  // 註：對抗式審查曾懷疑 UNICODE_IDENTIFIER_PATTERN 只用 \p{ID_Continue}
  // 未涵蓋 ZWNJ/ZWJ 而誤判其不合法；經查證此懷疑不成立——V8 的
  // `\p{ID_Continue}` 與 @babel/helper-validator-identifier 的
  // isIdentifierChar 兩個獨立來源皆確認這兩個字元已被 Unicode 的
  // ID_Continue 衍生屬性涵蓋。以下測試保留作為既有正確行為的迴歸防護。

  it('應該接受識別符中間包含 U+200C（ZWNJ）', () => {
    const name = `foo${ZWNJ}bar`;
    expect(isValidUnicodeIdentifier(name)).toBe(true);
  });

  it('應該接受識別符中間包含 U+200D（ZWJ）', () => {
    const name = `foo${ZWJ}bar`;
    expect(isValidUnicodeIdentifier(name)).toBe(true);
  });

  it('U+200C/U+200D 不應該出現在識別符開頭（僅 IdentifierPart，非 IdentifierStart）', () => {
    expect(isValidUnicodeIdentifier(`${ZWNJ}foo`)).toBe(false);
    expect(isValidUnicodeIdentifier(`${ZWJ}foo`)).toBe(false);
  });

  it('應該拒絕空字串', () => {
    expect(isValidUnicodeIdentifier('')).toBe(false);
  });

  it('應該拒絕以數字開頭的識別符', () => {
    expect(isValidUnicodeIdentifier('1abc')).toBe(false);
  });
});
