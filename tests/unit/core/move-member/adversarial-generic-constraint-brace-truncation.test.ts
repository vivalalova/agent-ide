/**
 * findBlockEnd Unit 測試（回歸缺陷：泛型約束物件型別大括號誤判為類別本體收尾）
 *
 * `class Box<T extends { value: string }> {` 的泛型約束 `<...>` 內含物件型別
 * `{ value: string }`；findBlockEnd 若只逐字元累計大括號深度、不跳過泛型子句，
 * 約束內的 `{`/`}` 會被誤判為類別本體的開/收尾括號，導致回傳的區塊結尾落在宣告
 * 行本身，class 主體（含其後的方法）完全被截斷。
 */

import { describe, it, expect } from 'vitest';
import { findBlockEnd } from '@core/move-member/utils/range-finder.js';
import { listTypeScriptMembers } from '@core/move-member/extractors/typescript-extractor.js';

describe('findBlockEnd - 泛型約束物件型別大括號不應誤判為類別本體收尾', () => {
  it('應正確找到 class 本體收尾行，而非泛型約束內的 `}`', () => {
    const lines = [
      'class Box<T extends { value: string }> {',
      '  get(): string {',
      '    return this.value;',
      '  }',
      '}'
    ];

    const endLine = findBlockEnd(lines, 0);

    expect(endLine).toBe(4);
  });

  it('listTypeScriptMembers 應能正確抽出含泛型約束的 class 及其內部方法', () => {
    const content = [
      'class Box<T extends { value: string }> {',
      '  get(): string {',
      '    return this.value;',
      '  }',
      '}'
    ].join('\n');

    const members = listTypeScriptMembers(content, 'box.ts');
    const classMember = members.find(m => m.name === 'Box');
    const methodMember = members.find(m => m.name === 'get');

    expect(classMember).toBeDefined();
    expect(classMember?.location.range.end.line).toBe(5);
    expect(methodMember).toBeDefined();
  });
});
