/**
 * deadcode 預覽假變更行 regression E2E 測試
 * 基於 deadcode-preview-regression fixture
 *
 * Bug：多行刪除的預覽把「刪除區塊後第一行未變更程式碼」畫成假變更行。
 * 根因：changeset-converter.ts 的 processMultiLineEditEnd 對
 * range.end.column === 1（LSP exclusive end，整行刪除語意）誤將 end 行
 * 內容 reattach 到起始行、又多 push 一筆該行的 delete，導致同一行同時
 * 出現 + 與 -，統計虛增。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 預覽假變更行 regression（多行刪除接續 unchanged 行）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('deadcode-preview-regression');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('刪除未使用的 dead() 後，keep() 不應同時以 + 與 - 出現在 diff 中，統計應為 +0 -2', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    // 去除可能的 ANSI 顏色碼再逐行比對，避免顏色開關（TTY 偵測）影響斷言
    // eslint-disable-next-line no-control-regex
    const plainOutput = result.stdout.replace(/\x1b\[[0-9;]*m/g, '');
    const lines = plainOutput.split('\n');

    // keep() 是 unchanged 的 context 行，不應以 '+' 或 '-' 開頭出現
    const keepLines = lines.filter(line => line.includes('export function keep()'));
    expect(keepLines.length).toBeGreaterThan(0);
    for (const line of keepLines) {
      expect(line.startsWith('+')).toBe(false);
      expect(line.startsWith('-')).toBe(false);
    }

    // Summary 統計應為 +0 -2（只刪除 dead() 那行與其後的空行，keep() 不計入）
    expect(plainOutput).toMatch(/Summary:\s*1 file,\s*2 changes,\s*\(\+0\s*-2\)/);
  });
});
