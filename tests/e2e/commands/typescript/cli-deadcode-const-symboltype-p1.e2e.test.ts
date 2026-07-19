/**
 * CLI deadcode 缺陷 E2E 測試 regression（P1：const 死變數永遠偵測不到）
 *
 * 根因：TS parser 把 module-level `const` 分類為 SymbolType.Constant，
 * 但 src/core/deadcode/types.ts 的 DEFAULT_DEAD_CODE_OPTIONS.symbolTypes
 * 只含 [Function, Class, Variable, Interface, Type]，漏了 Constant。
 * 結果 deadcode 掃描永遠跳過所有 module-level const 宣告，即使完全未使用
 * 也不會被標記為 dead code。
 *
 * 對照組：同結構的 `let` 版本走的是 SymbolType.Variable，有在預設清單內，
 * 能正確偵測到，證明本測試環境本身沒問題、問題只出在 const。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（P1：const symbolTypes 遺漏）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('P1：module-level 未使用的 const 應被偵測為 dead code', async () => {
    await fixture.writeFile('src/const-deadcode-p1.ts', [
      'const usedVarP1 = 1;',
      'const deadVarP1 = 2;',
      'console.log(usedVarP1);',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const targetFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('const-deadcode-p1')
    );

    // Bug：DEFAULT_DEAD_CODE_OPTIONS.symbolTypes 漏了 SymbolType.Constant，
    // 導致這個檔案完全不會出現在結果中（沒有任何 hunks）
    expect(targetFile).toBeDefined();
    const deletedContents = (targetFile?.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).toContain('deadVarP1');
  });

  it('修復安全網：使用中的 module-level const 不得被誤報為 dead code', async () => {
    // 獨立成一條測試，不依附在上面會先炸掉的紅測試斷言之後，
    // 修復前（const 完全偵測不到）與修復後（const 納入偵測）都應維持綠燈，
    // 防止修復把 symbolTypes 加回 Constant 後，把「有用到」的 const 也連帶誤刪。
    await fixture.writeFile('src/const-deadcode-p1-used-only.ts', [
      'const usedGuardP1 = 1;',
      'console.log(usedGuardP1);',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const targetFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('const-deadcode-p1-used-only')
    );

    const deletedContents = (targetFile?.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).not.toContain('usedGuardP1');
  });

  it('對照組：同結構的 let 未使用變數應被偵測到（防環境誤判）', async () => {
    await fixture.writeFile('src/let-deadcode-p1.ts', [
      'let usedVarP1Let = 1;',
      'let deadVarP1Let = 2;',
      'console.log(usedVarP1Let);',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const targetFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('let-deadcode-p1')
    );

    expect(targetFile).toBeDefined();
    const deletedContents = (targetFile?.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).toContain('deadVarP1Let');
    expect(deletedContents).not.toContain('usedVarP1Let');
  });
});
