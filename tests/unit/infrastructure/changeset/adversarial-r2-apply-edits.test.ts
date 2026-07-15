import { describe, expect, it } from 'vitest';
import { applyTextEdits } from '@infrastructure/changeset/apply-text-edits.js';

describe('applyTextEdits adversarial R2', () => {
  it('clamps column beyond line length to end of that line (documented contract)', () => {
    // Docs say column > line length → end of line; impl does offset += column-1 uncapped
    // so column past line end walks into next line.
    const content = 'ab\ncd';
    // Replace "past end of line 1" as if inserting at end of line 1 only
    const result = applyTextEdits(content, [{
      range: {
        start: { line: 1, column: 10 }, // line1 is "ab\n" length 3 with splitLines; without clamp goes into line2
        end: { line: 1, column: 10 }
      },
      newText: 'X'
    }]);
    // Correct clamp: insert at end of line 1 → "abX\ncd" or "ab\nXcd" depending on whether newline is in line
    // Documented: column > 行長度 → 行尾. Line 1 content without forcing into line 2.
    // Accept either "abX\ncd" (insert before newline) or "ab\nXcd" only if column meant after newline.
    // Strict contract from comments: column beyond line → 行尾 of THAT line, not into next.
    expect(result.startsWith('ab')).toBe(true);
    expect(result.includes('X')).toBe(true);
    // Must not corrupt line 2's first char position incorrectly:
    // If unclamped, column 10 on line1 with lines ["ab\n","cd"] offset = 0+9 = 9, content length 5 → append "X"
    // Let's assert the intended clamp behavior: insert at end of line 1 body (before or at newline)
    // "abX\ncd" is correct if 行尾 means after 'b'.
    expect(result).toBe('abX\ncd');
  });

  it('empty content applies zero-width inserts in reverse-start order (same as non-empty)', () => {
    // Non-empty reverse-start same position: larger end first, then zero-width last in sort
    // Two inserts at 1:1 with different newText — empty path joins array order after dedupe only
    const empty = applyTextEdits('', [
      { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, newText: 'B' },
      { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, newText: 'A' }
    ]);
    const nonempty = applyTextEdits('Z', [
      { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, newText: 'B' },
      { range: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, newText: 'A' }
    ]);
    // nonempty reverse apply same start: both zero-width, end equal, order stable from sort returning 0
    // → array order after sort is unstable for equal keys; for identical ranges sort is 0.
    // For empty, join order is original order "BA".
    // Contract: empty and non-empty should not reverse-insert differently for identical zero-width edits.
    // Pin: applying A then B at same point on empty should match non-empty semantics of final prefix before Z.
    expect(empty).toBe(nonempty.replace('Z', ''));
  });
});
