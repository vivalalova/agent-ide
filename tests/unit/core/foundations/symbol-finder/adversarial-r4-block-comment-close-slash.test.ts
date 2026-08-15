/**
 * R4: scanSource() 在 inBlockComment 遇到 `*` + `/` 只清除 inBlockComment 旗標並
 * continue，收尾的 `/` 沒被消耗，留給下一輪迭代當一般程式碼字元處理。因為前一個
 * 有效字元是 `*`（在 REGEX_PRECEDING_CHARS 集合中），isRegexStart() 誤判該 `/`
 * 為 regex literal 起點，導致 block comment 後同行的符號引用被吞掉。
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher block comment closing slash (adversarial R4)', () => {
  it('finds foo(bar) reference right after a block comment on the same line', () => {
    const matcher = new TextMatcher();
    const content = '/* c */ foo(bar);\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'foo');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('finds target reference after a block comment followed by other code on the same line', () => {
    const matcher = new TextMatcher();
    const content = 'const x = 1; /* c */ target(y);\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'target');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
