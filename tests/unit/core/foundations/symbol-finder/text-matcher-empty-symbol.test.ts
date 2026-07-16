/**
 * 對抗式審查釘住的缺陷：空字串符號名稱會讓 createIdentifierBoundaryRegex 產生
 * 零寬度正則（`(?<!...)(?!...)`），在 `while ((match = regex.exec(line)) !== null)`
 * 手動迴圈下，`exec()` 對零寬度匹配不會自動推進 `lastIndex`，導致無窮迴圈、直接
 * hang 住 process。
 *
 * 修法：在唯一的正則建構來源 createIdentifierBoundaryRegex()（identifier-matcher.ts）
 * fast-fail 拒絕空字串 symbolName，讓 TextMatcher 的三個方法（同檔內同型缺陷 3 處）
 * 與其他呼叫端（reference-updater.ts、rename-engine.ts）一併免疫，而非逐一在
 * 迴圈裡補 lastIndex 防衛碼。
 */

import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher 空字串符號名稱（防無窮迴圈）', () => {
  it('findReferencesByText 對空字串符號名稱立即拋錯，不會 hang', () => {
    const matcher = new TextMatcher();

    expect(() => matcher.findReferencesByText('/p/a.ts', 'const x = 1;', '')).toThrow(/空字串/);
  }, 2000);

  it('findReferencesByTextFiltered 對空字串符號名稱立即拋錯，不會 hang', () => {
    const matcher = new TextMatcher();

    expect(() => matcher.findReferencesByTextFiltered('/p/a.ts', 'const x = 1;', '')).toThrow(/空字串/);
  }, 2000);

  it('findReferencesMultipleByText 對空字串符號名稱立即拋錯，不會 hang', () => {
    const matcher = new TextMatcher();
    const results = new Map<string, ReturnType<TextMatcher['findReferencesByText']>>([['', []]]);

    expect(() => matcher.findReferencesMultipleByText('/p/a.ts', 'const x = 1;', new Set(['']), results)).toThrow(/空字串/);
  }, 2000);
});
