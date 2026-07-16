/**
 * Adversarial reproduction pin: MemberExtractor.extractMemberAtPosition ignores column.
 *
 * src/core/move-member/member-extractor.ts (extractMemberAtPosition) only filters
 * candidate members by LINE, never by the given column, before picking the
 * "smallest range" candidate. When a source file has multiple members declared
 * on the same line, pointing at a later member's column still resolves to an
 * earlier (unrelated) member on that line — the `move` CLI's `file:line:column`
 * selector silently moves the wrong symbol.
 *
 * Product code intentionally NOT fixed here — this must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import { MemberExtractor } from '@core/move-member/member-extractor.js';
import { createMockFileSystem, createMockParserRegistry } from '../_helpers/mock-factories.js';

describe('MemberExtractor.extractMemberAtPosition - same-line multiple members', () => {
  it('selects the member at the given column, not just the first one on the line', async () => {
    // Two distinct top-level functions declared on the exact same physical line.
    const line =
      'export function first() { return 1; } export function second() { return 2; }';
    const content = line + '\n';
    const filePath = '/src/source.ts';

    const mockFs = createMockFileSystem({ [filePath]: content });
    const extractor = new MemberExtractor(createMockParserRegistry(), mockFs);

    // Column pointing squarely inside the "second" identifier.
    const column = content.indexOf('second') + 1;
    expect(column).toBeGreaterThan(0);

    const member = await extractor.extractMemberAtPosition(filePath, 1, column);

    expect(member).not.toBeNull();
    // Bug: extractMemberAtPosition ignores column entirely and returns "first"
    // (the only/first candidate whose line-range contains line 1) even though
    // the requested column points at "second".
    expect(member!.name).toBe('second');
  });
});
