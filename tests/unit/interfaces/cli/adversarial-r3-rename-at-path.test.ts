/**
 * P2 regression: rename --at 的檔案路徑比對必須採 normalize 後比對
 * （renameAtPathMatches，與 symbol-target-resolver 的 symbolMatchesLocation 同基準），
 * 不得用原始字串 !==。
 */
import { describe, expect, it } from 'vitest';
import { normalizePath } from '@interfaces/cli/commands/module-file-resolver.js';
import { renameAtPathMatches } from '@interfaces/cli/commands/rename.command.js';

describe('rename --at path equality (adversarial R3)', () => {
  it('paths that differ only by normalize must match', () => {
    const a = '/proj/src/foo.ts';
    const b = '/proj/src/./foo.ts';
    expect(a === b).toBe(false); // raw differs
    expect(normalizePath(a)).toBe(normalizePath(b)); // normalize unifies
    // Pin the real product comparison used by the rename --at filter
    expect(renameAtPathMatches(a, b)).toBe(true);
  });
});
