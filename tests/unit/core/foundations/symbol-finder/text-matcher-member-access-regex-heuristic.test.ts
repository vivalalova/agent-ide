/**
 * [audit-fix] F5-1 回歸測試：src/core/foundations/symbol-finder/text-matcher.ts:347-366
 * isRegexStart() 的 regex 語境啟發式，對「前一字元是 `.`」的成員存取
 * （如 `cache.delete`）沒有排除，誤把 `.delete` 之後的 `/` 判成 regex 開始。
 *
 * code-state-mask.ts:73-90（同款啟發式的另一個掃描器）已修過同型缺陷
 * （見該檔案 68-74 行註解），text-matcher.ts 的 isRegexStart 尚未同步修。
 *
 * 結果：`cache.delete / total;` 中 `delete` 前一個非空白字元是 `.`，
 * isRegexStart 仍把它當成 `REGEX_PRECEDING_KEYWORDS` 關鍵字，判定其後的
 * `/` 是 regex 起點；因為整份內容裡沒有第二個 `/` 讓 regex 語境正常收尾，
 * `inRegex` 狀態一路延伸到檔案結尾，把後面所有字元（含兩處 `total` 引用）
 * 都標記成「字串／regex 內」而被 findReferencesByTextFiltered 濾掉。
 */

import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('[audit-fix] F5-1：TextMatcher isRegexStart 漏成員存取排除', () => {
  it('cache.delete / total 之後的 total 引用應被找到（現行會被誤判進 regex 語境而漏找）', () => {
    const matcher = new TextMatcher();
    const content = 'const x = cache.delete / total;\nconst realRef = total + 1;';

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'total');

    // 紅：現行 isRegexStart 把 `.delete` 之後的 `/` 誤判為 regex 起點，
    // 導致整份內容從該處起被當成未收尾的 regex/字串，refs 會是 []
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.some(r => r.location.range.start.line === 1)).toBe(true);
    expect(refs.some(r => r.location.range.start.line === 2)).toBe(true);
  });

  it('對照組：真正的 regex 語境（非成員存取）中的符號仍不應被算入引用', () => {
    const matcher = new TextMatcher();
    const content = [
      'function check(s) {',
      '  return / total /.test(s);',
      '}',
      'const real = total + 1;'
    ].join('\n');

    const refs = matcher.findReferencesByTextFiltered('/p/a.ts', content, 'total');

    // 保護性斷言：真 regex 字面值裡的 total 不應被計入，只有第 4 行的
    // `real = total + 1` 是真引用；若修復過頭（把所有 `/` 前綴都視為除法）
    // 這條會變紅，提醒修法不能無差別關掉整個 regex 啟發式。
    expect(refs).toHaveLength(1);
    expect(refs[0]?.location.range.start.line).toBe(4);
  });
});
