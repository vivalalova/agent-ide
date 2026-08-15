/**
 * F25 P2 — BindingElement getFullDeclarationRange（unit reproduction，先紅後綠）
 *
 * 對 `const { dead, live } = x`，dead 的刪除範圍不得覆蓋 live。
 * isMatchingDeclaration 只認 Identifier 形 VariableDeclaration，
 * BindingElement 要嘛找不到（null），要嘛回整句 VariableStatement。
 */

import { describe, it, expect } from 'vitest';
import { createDeclarationAnalyzer } from '@plugins/typescript/declaration-analyzer.js';

describe('F25：getFullDeclarationRange 對 BindingElement 的手術粒度', () => {
  it('const { dead, live } = x 刪 dead 的 range 不得包含 live', () => {
    const code = [
      'const source = { dead: 1, live: 2 };',
      'const { dead, live } = source;',
      'export function use() { return live; }',
      ''
    ].join('\n');

    const analyzer = createDeclarationAnalyzer();
    // dead BindingElement 在第 2 行
    const range = analyzer.getFullDeclarationRange(code, 'dead', 'variable', 2);

    // 必須找到精確範圍（null 會讓 caller fallback 整行/整句，傷 live）
    expect(range).not.toBeNull();

    const sliced = code.slice(range!.start.offset!, range!.end.offset!);
    expect(sliced).toMatch(/dead/);
    expect(sliced).not.toMatch(/live/);
    // 不得把整句 `const { dead, live } = source` 當刪除範圍
    expect(sliced).not.toMatch(/const\s*\{/);
    expect(sliced).not.toMatch(/=\s*source/);
  });
});
