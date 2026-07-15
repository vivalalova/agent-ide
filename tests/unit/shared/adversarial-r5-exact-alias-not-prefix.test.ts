/**
 * P2: resolveBarePathAlias treats an exact (no `/*`) tsconfig path mapping as a
 * prefix, matching sub-paths that TypeScript itself would never resolve via that
 * alias (an exact `"@pkg": ["src/pkg"]` mapping only matches the literal `@pkg`
 * specifier, never `@pkg/sub`).
 */
import { describe, expect, it } from 'vitest';
import { resolveBarePathAlias } from '@shared/path-alias-resolver.js';

describe('resolveBarePathAlias exact alias vs prefix (adversarial R5)', () => {
  it('does not match a sub-path against an exact (non-wildcard) alias mapping', () => {
    const resolved = resolveBarePathAlias('@pkg/sub', { '@pkg': '/proj/src/pkg' });

    expect(resolved).toBeNull();
  });
});
