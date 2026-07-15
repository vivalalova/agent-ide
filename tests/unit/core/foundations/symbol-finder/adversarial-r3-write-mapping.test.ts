/**
 * P2: product maps ScopedReferenceKind.Write → SymbolReferenceType.Definition
 * (symbol-finder.scopedReferenceKindToType). Assignments must not be definitions.
 *
 * We pin via findScopedReferences Write presence + the public SymbolReferenceType enum
 * contract expected by find-references consumers: assignment lines should surface as Usage.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';
import { SymbolReferenceType } from '@core/foundations/symbol-finder/types.js';

/** Desired mapping (correct contract) — product currently maps Write→Definition */
function mapKindDesired(kind: ScopedReferenceKind): SymbolReferenceType {
  switch (kind) {
    case ScopedReferenceKind.Write:
      return SymbolReferenceType.Usage; // assignment is a use/write, not a definition
    case ScopedReferenceKind.Import:
      return SymbolReferenceType.Import;
    case ScopedReferenceKind.Call:
    case ScopedReferenceKind.Read:
    default:
      return SymbolReferenceType.Usage;
  }
}

/** Actual product mapping from symbol-finder.ts */
function mapKindProduct(kind: ScopedReferenceKind): SymbolReferenceType {
  switch (kind) {
    case ScopedReferenceKind.Write:
      return SymbolReferenceType.Definition;
    case ScopedReferenceKind.Import:
      return SymbolReferenceType.Import;
    case ScopedReferenceKind.Call:
    case ScopedReferenceKind.Read:
    default:
      return SymbolReferenceType.Usage;
  }
}

describe('Write→Definition mapping (adversarial R3)', () => {
  it('assignment Write must map to Usage not Definition', () => {
    const code = 'let n = 0;\nn = 1;\n';
    const refs = createReferenceFinder().findScopedReferences(code, 'n');
    const writes = (refs ?? []).filter(r => r.kind === ScopedReferenceKind.Write);
    expect(writes.length).toBeGreaterThanOrEqual(1);

    for (const w of writes) {
      // Pin: product mapping disagrees with desired contract
      expect(mapKindProduct(w.kind)).toBe(mapKindDesired(w.kind));
    }
  });
});
