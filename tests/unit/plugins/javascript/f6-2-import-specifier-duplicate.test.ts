/**
 * F6-2 P3 — 無別名具名 import 產生兩筆同位置 Import 引用（reproduction，先紅後綠）
 *
 * `import { helper } from './x.js'` 在 Babel AST 中，ImportSpecifier 的 `imported`
 * 與 `local` 是兩個位置完全相同的 Identifier 節點，Identifier visitor 對兩者都
 * 收集，同一個 import 位置被回報兩次。去重必須做在來源（reference-finder），
 * 不能依賴下游輸出層過濾。
 */

import { describe, it, expect } from 'vitest';
import { ReferenceFinder } from '@plugins/javascript/reference-finder.js';

function positionsOf(code: string, symbolName: string): string[] {
  const refs = new ReferenceFinder().findScopedReferences(code, symbolName);
  expect(refs).not.toBeNull();
  return (refs ?? []).map(ref => `${ref.location.range.start.line}:${ref.location.range.start.column}`);
}

describe('F6-2：JS reference-finder 的 import specifier 去重', () => {
  it('無別名具名 import 只回報一筆引用', () => {
    const code = [
      'import { helper } from \'./x.js\';',
      '',
      'export function use() {',
      '  return helper();',
      '}',
      ''
    ].join('\n');

    const positions = positionsOf(code, 'helper');
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.filter(position => position.startsWith('1:'))).toHaveLength(1);
  });

  it('有別名的具名 import 仍保留原始匯出名的引用', () => {
    const code = [
      'import { helper as localHelper } from \'./x.js\';',
      '',
      'export function use() {',
      '  return localHelper();',
      '}',
      ''
    ].join('\n');

    const positions = positionsOf(code, 'helper');
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.filter(position => position.startsWith('1:'))).toHaveLength(1);
  });
});
