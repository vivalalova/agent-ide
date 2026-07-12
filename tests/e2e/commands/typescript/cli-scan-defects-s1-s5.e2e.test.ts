/**
 * CLI change-signature / move-member 缺陷 E2E 測試（scan reproduction，先紅後綠，5 筆）
 *
 * S1：change-signature reorder 對 spread 引數呼叫點（如 `f(...values)`）當成單一定位引數映射，
 *     call-site-updater.ts mapCallSiteArguments 產生錯誤重寫（如 `f(undefined, ...values)`）。
 *     正確行為：無法靜態重排的 spread 呼叫點應被拒絕，非零 exit、檔案不變。
 * S2：move-member 對別名 import（`import { helperS2 as runS2 }`）以 exported name 索引依賴，
 *     而非程式碼中實際使用的 local binding，導致移動後目標檔缺少對應 import。
 * S3：move-member 依賴分析的複合正則沒有 `import type { ... }` pattern，型別依賴不隨遷。
 * S4：move-member 插入依賴 import 前不檢查目標檔既有 import，目標檔已有同名 import 時重複插入。
 * S5：changeset-converter 對「整檔替換」與「行1單行插入」組合的處理，先處理單行編輯把
 *     行1標記為 processed，導致起始行同為行1的多行整檔替換被完全捨棄；此組合正是
 *     move-member M4（來源檔殘留引用時補 import）觸發的場景 —— dry-run 預覽因此漏顯示
 *     成員已從來源檔移除，但實際寫入卻兩者都做，預覽與實際結果不一致。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature/move-member 缺陷 regression（S1-S5）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('S1：--reorder 對 spread 引數呼叫點應拒絕，不得靜默錯誤重寫', async () => {
    const testFile = `${fixture.rootPath}/regression-s1-spread-reorder.ts`;
    const originalContent = `
export function fSpreadS1(a: number, b: number) { return a - b; }

const valsS1: [number, number] = [1, 2];
fSpreadS1(...valsS1);
`.trim();
    await fixture.memfs.writeFile(testFile, originalContent);

    const result = await executeCLI(
      [
        'change-signature', testFile, 'fSpreadS1',
        '-p', fixture.rootPath,
        '--reorder', 'b,a',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // 正確行為：spread 引數（`...valsS1`）無法靜態映射到重排後的位置，應被驗證拒絕，
    // 非零 exit 且檔案不變；
    // 目前的壞行為是成功執行，把 spread 呼叫點錯誤重寫成 `fSpreadS1(undefined, ...valsS1)`
    expect(result.exitCode).not.toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
    expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
  });

  it('S2：別名 import 依賴應隨移動的成員一起遷移，讓 local binding 可解析', async () => {
    await fixture.writeFile('src/helper-s2.ts', `export function helperS2() { return 1; }
`);
    await fixture.writeFile('src/source-s2.ts', `import { helperS2 as runS2 } from './helper-s2';
export function movedS2() { return runS2(); }
`);
    await fixture.writeFile('src/target-s2.ts', '');

    // movedS2 在第 2 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-s2.ts')}:2`, fixture.getFilePath('src/target-s2.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target-s2.ts'), 'utf-8') as string;
    // 正確行為：目標檔應有等效 import，讓移動後的 runS2() 呼叫可解析（別名需保留或等效映射）；
    // 目前的壞行為是依賴分析用 exported name（helperS2）索引，程式碼實際引用的是 local
    // binding（runS2），比對不到，目標檔完全沒有補上 import
    expect(targetContent).toMatch(/import\s*\{[^}]*\brunS2\b[^}]*\}\s*from\s*['"][^'"]*helper-s2['"]/);
  });

  it('S3：import type 依賴應隨移動的成員一起遷移', async () => {
    await fixture.writeFile('src/types-s3.ts', `export interface OptionsS3 { v: number }
`);
    await fixture.writeFile('src/source-s3.ts', `import type { OptionsS3 } from './types-s3';
export function movedS3(o: OptionsS3) { return o.v; }
`);
    await fixture.writeFile('src/target-s3.ts', '');

    // movedS3 在第 2 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-s3.ts')}:2`, fixture.getFilePath('src/target-s3.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target-s3.ts'), 'utf-8') as string;
    // 正確行為：目標檔應有 `import type { OptionsS3 }`，讓 movedS3 的型別標註可解析；
    // 目前的壞行為是依賴分析的複合正則沒有 `import type` pattern，型別依賴完全被忽略
    expect(targetContent).toMatch(/import\s+type\s*\{[^}]*\bOptionsS3\b[^}]*\}\s*from\s*['"][^'"]*types-s3['"]/);
  });

  it('S4：目標檔已有同名 import 時不應重複插入', async () => {
    await fixture.writeFile('src/helper-s4.ts', `export default function helperS4() { return 1; }
`);
    await fixture.writeFile('src/source-s4.ts', `import helperS4 from './helper-s4';
export function movedS4() { return helperS4(); }
`);
    await fixture.writeFile('src/target-s4.ts', `import helperS4 from './helper-s4';
export function keptS4() { return helperS4() + 1; }
`);

    // movedS4 在第 2 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-s4.ts')}:2`, fixture.getFilePath('src/target-s4.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target-s4.ts'), 'utf-8') as string;
    const importOccurrences = (targetContent.match(/import\s+helperS4\s+from\s*['"]\.\/helper-s4['"];/g) ?? []).length;
    // 正確行為：目標檔對 helper-s4 的 default import 只應存在一份；
    // 目前的壞行為是插入依賴 import 前不與目標檔既有 import 合併，產生重複宣告
    expect(importOccurrences).toBe(1);
  });

  it('S5：dry-run 預覽在整檔替換＋行1插入組合下不得丟失整檔替換，須與實際寫入一致', async () => {
    await fixture.writeFile('src/source-s5.ts', `export function keptS5() {
  return movedRefS5() + 1;
}

export function movedRefS5() {
  return 2;
}
`);
    await fixture.writeFile('src/target-s5.ts', '');

    // movedRefS5 在第 5 行；keptS5 對它的殘留引用會觸發 M4 補 import（行1單行插入），
    // 與 sourceFileChange 的整檔替換（起始行同為行1）組合成 S5 場景
    const dryRunResult = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-s5.ts')}:5`, fixture.getFilePath('src/target-s5.ts'),
        '-p', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(dryRunResult.exitCode).toBe(0);
    const dryRunOutput = JSON.parse(dryRunResult.stdout);
    expect(dryRunOutput.success).toBe(true);

    const sourceFileEntry = dryRunOutput.files.find((f: any) => f.filePath.includes('source-s5.ts'));
    expect(sourceFileEntry).toBeDefined();
    const sourceRemovedLines = sourceFileEntry.hunks
      .flatMap((hunk: any) => hunk.lines)
      .filter((line: any) => line.type === 'delete')
      .map((line: any) => line.content);
    // 正確行為：預覽必須顯示 movedRefS5 的函式定義已從來源檔移除；
    // 目前的壞行為是整檔替換被單行插入的 processedLines 標記擋下、完全丟棄，
    // 預覽只剩 import 插入，看不到 movedRefS5 被移除的變更
    expect(sourceRemovedLines.some((l: string) => l.includes('movedRefS5'))).toBe(true);

    // 實際執行後，比對來源檔終態與預覽是否一致：預覽宣稱移除的內容，實際也必須移除
    const actualResult = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-s5.ts')}:5`, fixture.getFilePath('src/target-s5.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(actualResult.exitCode).toBe(0);
    const actualSourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/source-s5.ts'), 'utf-8') as string;
    expect(actualSourceContent).not.toContain('function movedRefS5');
  });
});
