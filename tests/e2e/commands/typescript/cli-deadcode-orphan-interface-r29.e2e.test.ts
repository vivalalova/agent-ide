/**
 * CLI deadcode E2E 測試（R2-9：孤兒 interface 判 dead 的新行為釘住，非紅測試）
 *
 * 背景：scope 語意修正後，完全未引用的頂層 interface 開始被 deadcode 回報，
 * 此為預期正確行為但先前無測試釘住。本檔案：
 *   (a) 完全未使用的 interface 應被列為 dead
 *   (b) declaration merging（同名 interface 多次宣告 + 實際被使用）不應被誤判為 dead
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - 孤兒 interface 判定（R2-9）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('R2-9a：完全未使用的頂層 interface 應被列為 dead', async () => {
    await fixture.writeFile('src/orphan-iface-r29.ts', [
      'interface OrphanIfaceR29 { v: number }',
      'export function useNothingR29(): number { return 1; }',
      ''
    ].join('\n'));

    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const output: any = JSON.parse(dryRun.stdout);
    const targetFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('orphan-iface-r29')
    );
    expect(targetFile).toBeDefined();
    const deletedContents = (targetFile.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).toContain('OrphanIfaceR29');
  });

  it('R2-9b：declaration merging 且被實際使用的 interface 不應被判為 dead', async () => {
    await fixture.writeFile('src/merged-iface-r29.ts', [
      'interface MergedR29 { a: number }',
      'interface MergedR29 { b: string }',
      'export function useMergedR29(x: MergedR29): number { return x.a; }',
      ''
    ].join('\n'));

    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const output: any = JSON.parse(dryRun.stdout);
    const targetFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('merged-iface-r29')
    );
    // 不應出現在變更清單中：兩段宣告合併後的 MergedR29 實際被 useMergedR29 引用
    if (targetFile) {
      const deletedContents = (targetFile.hunks ?? [])
        .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
          h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
        )
        .join('\n');
      expect(deletedContents).not.toContain('MergedR29');
    }
  });
});
