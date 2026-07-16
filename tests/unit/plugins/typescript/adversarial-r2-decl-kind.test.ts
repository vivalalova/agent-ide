/**
 * Declaration identifiers must be ScopedReferenceKind.Definition.
 * Contract: declaration=Definition, assignment=Write, call=Call.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';

describe('declaration kind tagging (adversarial R2)', () => {
  it('marks function declaration name as Definition', () => {
    const code = 'function foo() {}\nfoo();\n';
    const refs = createReferenceFinder().findScopedReferences(code, 'foo');
    expect(refs).not.toBeNull();
    const declRef = (refs ?? []).find(r => r.location.range.start.line === 1);
    const callRef = (refs ?? []).find(r => r.location.range.start.line === 2);
    expect(declRef).toBeDefined();
    expect(callRef).toBeDefined();
    // declaration = Definition; call = Call; not Read / Write
    expect(declRef!.kind).toBe(ScopedReferenceKind.Definition);
    expect(callRef!.kind).toBe(ScopedReferenceKind.Call);
  });

  it('marks variable declaration as Definition and assignment as Write', () => {
    const code = 'let n = 0;\nn = 1;\n';
    const refs = createReferenceFinder().findScopedReferences(code, 'n');
    expect(refs).not.toBeNull();
    const declRef = (refs ?? []).find(r => r.location.range.start.line === 1);
    const writeRef = (refs ?? []).find(r => r.location.range.start.line === 2);
    expect(declRef).toBeDefined();
    expect(writeRef).toBeDefined();
    expect(declRef!.kind).toBe(ScopedReferenceKind.Definition);
    expect(writeRef!.kind).toBe(ScopedReferenceKind.Write);
  });
});
