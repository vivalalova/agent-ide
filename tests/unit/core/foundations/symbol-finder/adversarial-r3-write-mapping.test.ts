/**
 * P2 regression: ScopedReferenceKind.Write（賦值）必須 map 成 Usage 而非 Definition
 * （symbol-finder.scopedReferenceKindToType）。
 *
 * We pin via findScopedReferences Write presence + the real exported product mapping,
 * compared against the desired contract expected by find-references consumers.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';
import { SymbolReferenceType } from '@core/foundations/symbol-finder/types.js';
import { scopedReferenceKindToType } from '@core/foundations/symbol-finder/symbol-finder.js';

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

/** Actual product mapping — the real exported function from symbol-finder.ts */
const mapKindProduct = scopedReferenceKindToType;

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
