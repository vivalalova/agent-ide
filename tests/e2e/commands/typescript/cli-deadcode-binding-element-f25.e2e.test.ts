/**
 * F25 P2 — BindingElement getFullDeclarationRange（reproduction，先紅後綠）
 *
 * `const { dead, live } = x` 中 dead 被判 dead code 時，刪除範圍必須只動 dead
 * 這個 BindingElement（含逗號手術），不得把 live 一併刪掉或毁掉整句解構。
 *
 * 根因：declaration-analyzer isMatchingDeclaration / resolveMatchedDeclarationNode
 * 只認 Identifier 形 VariableDeclaration，不處理 ObjectBindingPattern 內的 BindingElement。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 F25：BindingElement 刪除粒度', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('const { dead, live } = x 刪 dead 後 live 與使用點必須仍在', async () => {
    // 物件屬性名與解構綁定名刻意分離：刪 BindingElement 後屬性字面可仍存在，
    // 斷言只驗解構側綁定粒度，不要求刪掉 source 物件上的 property key。
    await fixture.writeFile(
      'src/f25-binding-element.ts',
      [
        'const source = { deadKey: 1, liveKey: 2 };',
        'const { deadKey: deadF25, liveKey: liveF25 } = source;',
        'export function useF25() { return liveF25; }',
        ''
      ].join('\n')
    );

    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryOutput = JSON.parse(dryRun.stdout);

    // 觸發前提：deadF25 必須被偵測為 dead（否則本 regression 無意義）
    const dryText = JSON.stringify(dryOutput);
    expect(dryText).toMatch(/deadF25/);

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const after = await fixture.readFile('src/f25-binding-element.ts');

    // dead 綁定應消失（解構側）
    expect(after).not.toContain('deadF25');
    // live 與其使用不得被誤刪／語法毀損
    expect(after).toMatch(/liveF25/);
    expect(after).toMatch(/return liveF25/);
    // 解構仍須合法：至少保留 live 綁定
    expect(after).toMatch(/liveKey:\s*liveF25|liveF25/);
    expect(after).not.toMatch(/\{\s*,/);
    expect(after).not.toMatch(/,\s*\}/);
  });
});
