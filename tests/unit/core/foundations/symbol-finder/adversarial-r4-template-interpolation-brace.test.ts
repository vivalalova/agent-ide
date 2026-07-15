/**
 * R4: scanSource() 在 raw template 模式遇到 `$` + `{` 時設定 braceDepth = 1 並
 * continue，只消耗了 `$`；下一輪迭代該 `{` 又在 expression 模式被 braceDepth++
 * 成 2，之後唯一的 `}` 只把 braceDepth 降回 1，模式永遠回不到 raw，狀態失步後
 * 導致 template 之後的符號引用漏報。
 */
import { describe, expect, it } from 'vitest';
import { TextMatcher } from '@core/foundations/symbol-finder/text-matcher.js';

describe('TextMatcher template interpolation brace depth (adversarial R4)', () => {
  it('finds the target() call after a template literal with interpolation', () => {
    const matcher = new TextMatcher();
    const content = 'const s = `a${x}b`; target(y);\n';
    const refs = matcher.findReferencesByTextFiltered('/src/a.ts', content, 'target');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});
