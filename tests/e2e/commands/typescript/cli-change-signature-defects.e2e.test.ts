/**
 * CLI change-signature 命令 E2E 測試 - 已確認缺陷（手動重現，8 筆）
 *
 * 每個測試斷言「正確行為」，在缺陷修復前預期為紅燈（reproduction test）。
 * 缺陷清單：
 *   1. --change-type 含冒號/逗號的型別被天真切割
 *   2. --rename 漏改閉包內引用；移除仍被閉包使用的參數未被拒絕
 *   3. 呼叫點多餘引數（超過原參數個數）被丟棄
 *   4. rest 參數 `...` 被吃掉
 *   5. 跨檔案同名自由函式被越權重寫
 *   6. --reorder 重寫呼叫點時型別引數（泛型 `<T>`）與 optional chaining `?.` 被丟棄
 *   7. --reorder 重寫巢狀引數時，外層包裹呼叫（如 `wrap(...)`）被靜默吃掉
 *   8. --reorder 透過 barrel re-export 匯入的消費端呼叫點未同步更新
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 已確認缺陷（手動重現，8 筆）', () => {
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

  describe('缺陷6: --reorder 重寫呼叫點時型別引數與 optional chaining 被丟棄', () => {
    it('呼叫點的泛型型別引數 <T> 不應被丟棄', async () => {
      const testFile = `${fixture.rootPath}/regression-defect6-generic-type-arg.ts`;
      await fixture.memfs.writeFile(testFile, `
function pick<T>(key: string, count: number): T {
  return undefined as unknown as T;
}

const r = pick<number>('n', 1);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'pick',
          '-p', fixture.rootPath,
          '--reorder', 'count,key',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：呼叫點的型別引數 `<number>` 應保留，僅重排值引數；
      // 目前的壞行為是型別引數被丟棄，變成 `pick(1, 'n')`
      expect(addedLines.some((l: string) => l.includes('pick<number>(1, \'n\')'))).toBe(true);
    });

    it('呼叫點的 optional chaining `?.` 不應被丟棄', async () => {
      const testFile = `${fixture.rootPath}/regression-defect6-optional-chaining-call.ts`;
      await fixture.memfs.writeFile(testFile, `
function fire(a: number, b: number): void {}

fire?.(1, 2);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'fire',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：`?.` 應保留，重寫後仍是安全呼叫；
      // 目前的壞行為是 `?.` 被丟棄，變成 `fire(2, 1)`（語意從安全呼叫變成可能 runtime throw）
      expect(addedLines.some((l: string) => l.includes('fire?.(2, 1)'))).toBe(true);
    });
  });

  describe('缺陷7: --reorder 重寫巢狀引數時外層包裹呼叫被吃掉', () => {
    it('巢狀呼叫中作為引數的包裹呼叫（如 wrap(...)）不應被靜默刪除', async () => {
      const testFile = `${fixture.rootPath}/regression-defect7-nested-wrapper-call.ts`;
      await fixture.memfs.writeFile(testFile, `
function combine(first: number, second: number): number { return first + second; }
function wrap(value: number): number { return value; }
const result = combine(wrap(combine(1, 2)), 3);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'combine',
          '-p', fixture.rootPath,
          '--reorder', 'second,first',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：外層兩個引數互換、內層 combine(1, 2) 呼叫也重排，wrap(...) 保留；
      // 目前的壞行為是 wrap(...) 被靜默刪除，變成 `combine(3, combine(2, 1))`
      expect(addedLines.some((l: string) => l.includes('combine(3, wrap(combine(2, 1)))'))).toBe(true);
    });

    it('內層目標呼叫是外層引數子運算式時，引數其餘文字（如 `+ 1`）不應被吃掉', async () => {
      const testFile = `${fixture.rootPath}/regression-defect7-nested-subexpression.ts`;
      await fixture.memfs.writeFile(testFile, `
function add(a: number, b: number): number { return a + b; }
const n = add(add(5, 6) + 1, 7);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'add',
          '-p', fixture.rootPath,
          '--reorder', 'b,a',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：外層兩個引數互換、內層 add(5, 6) 呼叫也重排，`+ 1` 保留；
      // 目前的壞行為是 `+ 1` 被吃掉，變成 `add(7, add(6, 5))`
      expect(addedLines.some((l: string) => l.includes('add(7, add(6, 5) + 1)'))).toBe(true);
    });
  });

  describe('缺陷8: --reorder 透過 barrel re-export 匯入的消費端呼叫點未同步更新', () => {
    it('透過 barrel re-export 匯入函式的消費端呼叫點應同步重排', async () => {
      await fixture.writeFile('src/regression-defect8-fmt.ts', `
export function fmt(label: string, times: number): string { return label.repeat(times); }
`.trim());
      await fixture.writeFile('src/regression-defect8-barrel.ts', `
export { fmt } from './regression-defect8-fmt';
`.trim());
      await fixture.writeFile('src/regression-defect8-consumer.ts', `
import { fmt } from './regression-defect8-barrel';
export const out = fmt('x', 2);
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/regression-defect8-fmt.ts'),
          '--function', 'fmt',
          '-p', fixture.rootPath,
          '--reorder', 'times,label',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 正確行為：src/regression-defect8-consumer.ts 的呼叫點應更新為 fmt(2, 'x')；
      // 目前的壞行為是 consumer 呼叫點漏改，仍停留在 fmt('x', 2)
      const consumerFile = output.files.find((f: any) => f.filePath.includes('regression-defect8-consumer.ts'));
      expect(consumerFile).toBeDefined();
      const consumerAddedLines = consumerFile.hunks
        .flatMap((hunk: any) => hunk.lines)
        .filter((line: any) => line.type === 'add')
        .map((line: any) => line.content);
      expect(consumerAddedLines.some((l: string) => l.includes('fmt(2, \'x\')'))).toBe(true);
    });
  });
});
