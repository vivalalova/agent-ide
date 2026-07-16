/**
 * F6：find-references 對多定義無 --at 應 fail-fast / ambiguous（與 rename 對齊）
 *
 * 現況 resolveSymbolTarget 在無 --at 時回傳全部候選並合併引用；
 * rename 則明確要求 --at。唯讀查詢同樣應避免 silently merge 異符號引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 多定義無 --at（F6）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('兩個無關同名定義且無 --at 時應 fail-fast，不得合併引用', async () => {
    await fixture.writeFile(
      'src/ambig-a-f6.ts',
      'export function sharedNameF6() { return "a"; }\n'
    );
    await fixture.writeFile(
      'src/ambig-b-f6.ts',
      'export function sharedNameF6() { return "b"; }\n'
    );
    await fixture.writeFile(
      'src/use-a-f6.ts',
      'import { sharedNameF6 } from "./ambig-a-f6.js";\nexport const ua = sharedNameF6();\n'
    );
    await fixture.writeFile(
      'src/use-b-f6.ts',
      'import { sharedNameF6 } from "./ambig-b-f6.js";\nexport const ub = sharedNameF6();\n'
    );

    const result = await executeCLI(
      [
        'find-references',
        'sharedNameF6',
        '--path', fixture.rootPath,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // 正確（與 rename 對齊）：exitCode !== 0，訊息要求 --at / 列出候選
    // 目前壞行為：exitCode 0 並合併兩定義的引用
    expect(result.exitCode).not.toBe(0);
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/--at|同名|ambiguous|多個/i);
  });
});
