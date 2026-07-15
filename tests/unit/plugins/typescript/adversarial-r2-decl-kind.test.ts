/**
 * P2: Function/class/method declaration identifiers should be Definition (or Write),
 * not Read/Usage — currently only VariableDeclaration etc. get Write.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';

describe('declaration kind tagging (adversarial R2)', () => {
  it('marks function declaration name as Write or a dedicated definition kind', () => {
    const code = 'function foo() {}\nfoo();\n';
    const refs = createReferenceFinder().findScopedReferences(code, 'foo');
    expect(refs).not.toBeNull();
    const declRef = (refs ?? []).find(r => r.range.start.line === 1);
    expect(declRef).toBeDefined();
    // Desired: Write (or future Definition enum). Bug: Read.
    expect(declRef!.kind).not.toBe(ScopedReferenceKind.Read);
    expect([ScopedReferenceKind.Write, ScopedReferenceKind.Call].includes(declRef!.kind)
      || declRef!.kind === ScopedReferenceKind.Write).toBe(true);
    // Simpler contract: declaration line must be Write
    expect(declRef!.kind).toBe(ScopedReferenceKind.Write);
  });
});
