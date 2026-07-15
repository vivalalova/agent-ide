/**
 * P2: shouldExcludeByClassName's `targetClassName === symbolName` exception
 * (added to keep bare nested-helper call sites whose containerName can't be
 * detected, see nested-fn-in-arrow-refs-bugs.test.ts) unconditionally keeps
 * EVERY bare identifier matching symbolName anywhere in the file. This wrongly
 * pulls in an unrelated, locally-shadowed same-named binding declared in a
 * completely different scope (e.g. `const process = () => 2; process();`
 * inside an unrelated function), attributing it to the target nested
 * function of the same name declared elsewhere.
 * Product code intentionally NOT fixed — must stay red until fixed.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';

describe('shouldExcludeByClassName shadowed bare identifier (P2-5)', () => {
  const code = [
    'export const run = () => {',
    '  function process() {',
    '    return 1;',
    '  }',
    '  return process();',
    '};',
    '',
    'export const other = () => {',
    '  const process = () => 2;',
    '  return process();',
    '};',
    ''
  ].join('\n');

  it('keeps the target nested function\'s own call site', () => {
    const refs = createReferenceFinder().findScopedReferences(code, 'process', { className: 'process' });
    expect(refs).not.toBeNull();
    const kinds = (refs ?? []).map(r => r.kind);
    expect(kinds).toContain(ScopedReferenceKind.Call);
    // run()'s call site is on line 5 (1-based)
    const callLines = (refs ?? [])
      .filter(r => r.kind === ScopedReferenceKind.Call)
      .map(r => r.location.range.start.line);
    expect(callLines).toContain(5);
  });

  it('excludes the unrelated locally-shadowed const process in other()', () => {
    const refs = createReferenceFinder().findScopedReferences(code, 'process', { className: 'process' });
    expect(refs).not.toBeNull();
    const lines = (refs ?? []).map(r => r.location.range.start.line);
    // other()'s `const process = () => 2;` (line 9) and its call `process();` (line 10)
    // must NOT be attributed to the target nested function.
    expect(lines).not.toContain(9);
    expect(lines).not.toContain(10);
  });
});
