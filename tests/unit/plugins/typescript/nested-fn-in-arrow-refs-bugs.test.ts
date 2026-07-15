/**
 * P1 pin: findContainerName ignores ArrowFunction / FunctionExpression.
 * Bare nested-helper call sites get containerName undefined; when className
 * is the nested function (or outer const), shouldExcludeByClassName drops them.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';
import { ScopedReferenceKind } from '@infrastructure/parser/index.js';

describe('nested function refs inside arrow (P1)', () => {
  const code = [
    'export const run = () => {',
    '  function helper() {',
    '    return 1;',
    '  }',
    '  return helper();',
    '};',
    ''
  ].join('\n');

  it('unfiltered scoped lookup includes declaration and call', () => {
    const refs = createReferenceFinder().findScopedReferences(code, 'helper');
    expect(refs).not.toBeNull();
    expect((refs ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('must not drop bare helper() when className is the nested function name', () => {
    // symbol-finder passes symbol.scope?.name for non-class-method symbols.
    // Nested function's scope name is typically the function itself ("helper").
    // findContainerName skips the arrow and does not report "helper" as container
    // for the call site → shouldExclude drops the call.
    const refs = createReferenceFinder().findScopedReferences(code, 'helper', {
      className: 'helper'
    });
    expect(refs).not.toBeNull();
    const kinds = (refs ?? []).map(r => r.kind);
    expect(kinds).toContain(ScopedReferenceKind.Call);
    expect((refs ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
