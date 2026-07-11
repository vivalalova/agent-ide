/**
 * CLI change-signature 命令 E2E 測試 - 已確認缺陷（手動重現，5 筆）
 *
 * 每個測試斷言「正確行為」，在缺陷修復前預期為紅燈（reproduction test）。
 * 缺陷清單：
 *   1. --change-type 含冒號/逗號的型別被天真切割
 *   2. --rename 漏改閉包內引用；移除仍被閉包使用的參數未被拒絕
 *   3. 呼叫點多餘引數（超過原參數個數）被丟棄
 *   4. rest 參數 `...` 被吃掉
 *   5. 跨檔案同名自由函式被越權重寫
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 已確認缺陷（手動重現，5 筆）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function getAddedLines(output: any): string[] {
    return output.files
      .flatMap((file: any) => file.hunks)
      .flatMap((hunk: any) => hunk.lines)
      .filter((line: any) => line.type === 'add')
      .map((line: any) => line.content);
  }

  describe('缺陷1: --change-type 含冒號/逗號的型別被天真切割', () => {
    it('箭頭函式型別（含冒號）不應被截斷', async () => {
      const testFile = `${fixture.rootPath}/regression-defect1-arrow-type.ts`;
      await fixture.memfs.writeFile(testFile, `
function process(handler: () => void): void { handler(); }

process(() => {});
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'process',
          '-p', fixture.rootPath,
          '--change-type', 'handler:(e: Event) => void',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：新定義應包含完整型別 `(e: Event) => void`；
      // 目前的壞行為是在型別內第一個冒號處被切斷，變成 `handler: (e): void {`
      expect(addedLines.some((l: string) => l.includes('handler: (e: Event) => void'))).toBe(true);
    });

    it('泛型型別（含逗號）不應被截斷', async () => {
      const testFile = `${fixture.rootPath}/regression-defect1-generic-comma-type.ts`;
      await fixture.memfs.writeFile(testFile, `
function f(data: Map<string, string>): void {}

f(new Map<string, string>());
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'f',
          '-p', fixture.rootPath,
          '--change-type', 'data:Map<string, number>',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      expect(addedLines.some((l: string) => l.includes('data: Map<string, number>'))).toBe(true);
    });
  });

  describe('缺陷2: --rename 漏改閉包內引用', () => {
    it('箭頭函式閉包內對參數的引用應同步改名', async () => {
      const testFile = `${fixture.rootPath}/regression-defect2-rename-closure.ts`;
      await fixture.memfs.writeFile(testFile, `
function greet(name: string): () => string {
  return () => 'Hello ' + name;
}

greet('x');
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'greet',
          '-p', fixture.rootPath,
          '--rename', 'name:username',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：閉包 body 內的 `name` 引用也必須改名為 `username`；
      // 目前的壞行為只改了函式定義的參數名，閉包內仍是舊名 `name`
      expect(addedLines.some((l: string) => l.includes('\'Hello \' + username'))).toBe(true);
    });

    it('移除仍被閉包使用的參數應被拒絕且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/regression-defect2-remove-closure-used.ts`;
      const originalContent = `
function f(cfg: { value: number }): () => number { return () => cfg.value; }

f({ value: 1 });
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature', testFile, 'f',
          '-p', fixture.rootPath,
          '--remove', 'cfg',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // 正確行為：與既有「刪除仍在函式 body 使用的參數應該失敗」規則一致，
      // 閉包內對 cfg 的引用也應被視為「仍在使用」而拒絕移除；
      // 目前的壞行為是閉包內的使用未被追蹤到，移除被誤判為安全而放行
      expect(result.exitCode).toBe(1);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toContain('仍在函式 body 中使用');
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('缺陷3與4: rest 參數呼叫點多餘引數被丟棄、定義的 `...` 被吃掉', () => {
    it('缺陷3: 呼叫點的多餘 rest 引數（超過原參數個數）不應遺失', async () => {
      const testFile = `${fixture.rootPath}/regression-defect3-rest-call-site.ts`;
      await fixture.memfs.writeFile(testFile, `
function report(title: string, ...rows: string[]): void { console.log(title, rows); }

report('Q1', 'a', 'b', 'c');
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'report',
          '-p', fixture.rootPath,
          '--add', 'level:number=0@0',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：呼叫點應保留全部 rest 引數；
      // 目前的壞行為是 'b'、'c' 被丟棄，變成 report(0, 'Q1', 'a')
      expect(addedLines.some((l: string) => l.includes('report(0, \'Q1\', \'a\', \'b\', \'c\')'))).toBe(true);
    });

    it('缺陷4: 函式定義中的 rest 參數 `...` 不應被吃掉', async () => {
      const testFile = `${fixture.rootPath}/regression-defect4-rest-definition.ts`;
      await fixture.memfs.writeFile(testFile, `
function report(title: string, ...rows: string[]): void { console.log(title, rows); }

report('Q1', 'a', 'b', 'c');
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'report',
          '-p', fixture.rootPath,
          '--add', 'level:number=0@0',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：新定義應保留 `...rows: string[]`；
      // 目前的壞行為是 `...` 消失，變成 `rows: string[]`
      expect(addedLines.some((l: string) => l.includes('...rows: string[]'))).toBe(true);
    });
  });

  describe('缺陷5: 跨檔案同名自由函式被越權重寫', () => {
    it('目標檔案以外，其他檔案中同名但不同符號的函式呼叫點不應被修改', async () => {
      await fixture.writeFile('src/regression-defect5-a.ts', `
export function reset(a: number, b: number): number { return a - b; }

reset(1, 2);
`.trim());
      await fixture.writeFile('src/regression-defect5-b.ts', `
function reset(x: number): number { return x; }

const v = reset(9);
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/regression-defect5-a.ts'),
          '--function', 'reset',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 正確行為：src/regression-defect5-b.ts 是不同的自由函式（不同檔案、不同宣告），
      // 不應出現在變更清單中；
      // 目前的壞行為是它被誤判為同一符號，其呼叫點 reset(9) 被錯誤重寫成 reset(undefined, 9)
      const bFiles = output.files.filter((f: any) => f.filePath.includes('regression-defect5-b.ts'));
      expect(bFiles).toHaveLength(0);
    });
  });
});
