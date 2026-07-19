/**
 * F23 P2 — JS findScopedReferences 缺 bracket 成員存取（reproduction，先紅後綠）
 *
 * TS 側已修 ElementAccessExpression 字串鍵（見 adversarial-r2-bracket-access.test.ts）；
 * JS reference-finder 只 visit Identifier，`obj['method']` 對 deadcode/refs 隱形。
 */

import { describe, it, expect } from 'vitest';
import { ReferenceFinder } from '@plugins/javascript/reference-finder.js';

describe('F23：JS findScopedReferences 應計入 bracket 成員存取', () => {
  it('counts obj[\'method\']() as a usage of method', () => {
    const code = [
      'export class Api {',
      '  method() { return 1; }',
      '}',
      'const obj = new Api();',
      'obj[\'method\']();',
      ''
    ].join('\n');

    const refs = new ReferenceFinder().findScopedReferences(code, 'method', { className: 'Api' });
    expect(refs).not.toBeNull();
    // declaration + bracket usage
    expect((refs ?? []).length).toBeGreaterThanOrEqual(2);
    const lines = (refs ?? []).map(r => r.location.range.start.line);
    expect(lines).toContain(5);
  });

  it('counts obj[`method`]() (no-sub template key) as a usage of method', () => {
    const code = [
      'export class Api {',
      '  method() { return 1; }',
      '}',
      'const obj = new Api();',
      'obj[`method`]();',
      ''
    ].join('\n');

    const refs = new ReferenceFinder().findScopedReferences(code, 'method', { className: 'Api' });
    expect(refs).not.toBeNull();
    const lines = (refs ?? []).map(r => r.location.range.start.line);
    expect(lines).toContain(5);
  });
});
