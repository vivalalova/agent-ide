/**
 * P2: rename --at compares symbolPath !== location.filePath without normalize,
 * while symbol-target-resolver uses normalizePath.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { normalizePath } from '@interfaces/cli/commands/module-file-resolver.js';

describe('rename --at path equality (adversarial R3)', () => {
  it('paths that differ only by normalize must match (product rename uses raw !==)', () => {
    // Simulate index path vs --at path form
    const indexed = path.resolve('/proj/src/foo.ts');
    const atForm = path.join('/proj/src', './foo.ts'); // may equal after normalize
    // On posix resolve('./') differences:
    const a = '/proj/src/foo.ts';
    const b = '/proj/src/./foo.ts';
    // Product rename: a !== b is true → miss. Desired: normalizePath equal.
    expect(a === b).toBe(false); // raw differs
    expect(normalizePath(a)).toBe(normalizePath(b)); // normalize unifies
    // Document the bug: rename filter would reject this pair
    const renameWouldMatch = a === b; // product
    const correctMatch = normalizePath(a) === normalizePath(b);
    expect(renameWouldMatch).toBe(correctMatch); // fails: false !== true
  });
});
