/**
 * P1/P2: inferReceiverType walks file and takes FIRST VariableDeclaration of name,
 * ignoring nearest lexical declaration — wrong class method ownership.
 */
import { describe, expect, it } from 'vitest';
import { createReferenceFinder } from '@plugins/typescript/reference-finder.js';

describe('inferReceiverType nearest-decl (adversarial R2)', () => {
  it('attributes bark() to Cat when a is redeclared as Cat in a later scope', () => {
    const code = [
      'class Dog { bark() {} }',
      'class Cat { bark() {} }',
      'function f() {',
      '  const a = new Dog();',
      '  a.bark();',
      '}',
      'function g() {',
      '  const a = new Cat();',
      '  a.bark();',
      '}',
      ''
    ].join('\n');

    const finder = createReferenceFinder();
    // Scoped refs for bark on Cat only
    const catRefs = finder.findScopedReferences(code, 'bark', { className: 'Cat' });
    expect(catRefs).not.toBeNull();

    // Must include g()'s a.bark() call (around line 9)
    const lines = (catRefs ?? []).map(r => r.location.range.start.line);
    expect(lines).toContain(9);

    // Must NOT include f()'s a.bark() (line 5) — that belongs to Dog
    expect(lines).not.toContain(5);
  });

  it('attributes bark() to Dog when filtering Dog', () => {
    const code = [
      'class Dog { bark() {} }',
      'class Cat { bark() {} }',
      'function f() {',
      '  const a = new Dog();',
      '  a.bark();',
      '}',
      'function g() {',
      '  const a = new Cat();',
      '  a.bark();',
      '}',
      ''
    ].join('\n');

    const dogRefs = createReferenceFinder().findScopedReferences(code, 'bark', { className: 'Dog' });
    const lines = (dogRefs ?? []).map(r => r.location.range.start.line);
    expect(lines).toContain(5);
    expect(lines).not.toContain(9);
  });
});
