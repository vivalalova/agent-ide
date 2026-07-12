/**
 * CLI change-signature 命令 E2E 測試 - 已確認缺陷（手動重現，14 筆）
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
 *   9. 呼叫點引數前的區塊註解內括號騙過 prefix 擷取（lastIndexOf('(') 命中註解內括號）
 *   10. --reorder 透過 tsconfig paths 別名（非相對 specifier）匯入的消費端呼叫點未同步更新
 *   11. --reorder 與 --add 同時使用時，既有呼叫點缺引數的補值與新參數預設值兩個填值
 *       來源不同步，導致重寫後同一數值被重複填入
 *   12. 巢狀函式內 if 區塊的同名 const 被誤當整函式遮蔽，rename 漏改閉包引用、
 *       remove 誤判參數未使用而放行
 *   13. 參數預設值引用其他參數時未被處理：移除被引用的參數未擋下、
 *       rename 未同步改寫其他參數預設值中的引用
 *   14. --reorder 允許把 rest 參數移到非最後位置，產生無效 TS
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 已確認缺陷（手動重現，14 筆）', () => {
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

  describe('缺陷9: 呼叫點引數前註解內括號騙過 prefix 擷取', () => {
    it('引數前的區塊註解（含括號）不應讓重寫後的呼叫點產生未關閉註解的無效碼', async () => {
      const testFile = `${fixture.rootPath}/regression-defect9-comment-paren-prefix.ts`;
      await fixture.memfs.writeFile(testFile, `
function fnc(a: number, b: number): number { return a + b; }
const r = fnc(/* ( */ 1, 2);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'fnc',
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
      // 正確行為：引數前註解可被丟棄，但輸出必須是合法呼叫 `fnc(2, 1)`；
      // 目前的壞行為是 prefix 擷取用 lastIndexOf('(') 命中註解內的括號，
      // 產生 `fnc(/* (2, 1)` 這種未關閉區塊註解的無效碼
      expect(addedLines.some((l: string) => l.includes('fnc(2, 1)'))).toBe(true);
      expect(addedLines.some((l: string) => l.includes('fnc(/* (2, 1)'))).toBe(false);
    });
  });

  describe('缺陷10: --reorder 透過 tsconfig paths 別名匯入的消費端呼叫點未同步更新', () => {
    it('透過 tsconfig paths 別名匯入函式的消費端呼叫點應同步重排', async () => {
      // 先讀現有 tsconfig，只疊加 baseUrl/paths，不自創其餘欄位
      const tsconfigRaw = await fixture.memfs.readFile(fixture.getFilePath('tsconfig.json'), 'utf-8') as string;
      const tsconfig = JSON.parse(tsconfigRaw);
      tsconfig.compilerOptions.baseUrl = '.';
      tsconfig.compilerOptions.paths = { '@app/*': ['src/*'] };
      await fixture.writeFile('tsconfig.json', JSON.stringify(tsconfig, null, 2));

      await fixture.writeFile('src/als-lib.ts', `export function alsFmt(label: string, times: number): string { return label.repeat(times); }
`);
      await fixture.writeFile('src/als-consumer.ts', `import { alsFmt } from '@app/als-lib';
export const out = alsFmt('x', 2);
`);

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/als-lib.ts'),
          '--function', 'alsFmt',
          '-p', fixture.rootPath,
          '--reorder', 'times,label',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // 正確行為：src/als-consumer.ts 的呼叫點應更新為 alsFmt(2, 'x')；
      // 目前的壞行為是非相對 specifier（tsconfig paths 別名）一律被排除，consumer 無任何變更
      const consumerFile = output.files.find((f: any) => f.filePath.includes('als-consumer.ts'));
      expect(consumerFile).toBeDefined();
      const consumerAddedLines = consumerFile.hunks
        .flatMap((hunk: any) => hunk.lines)
        .filter((line: any) => line.type === 'add')
        .map((line: any) => line.content);
      expect(consumerAddedLines.some((l: string) => l.includes('alsFmt(2, \'x\')'))).toBe(true);
    });
  });

  describe('缺陷11: --reorder 與 --add 同時使用時呼叫點填值重複', () => {
    it('既有呼叫點缺引數的補值與新參數預設值不應在重寫後重複出現', async () => {
      const testFile = `${fixture.rootPath}/regression-defect11-reorder-add-duplicate-fill.ts`;
      await fixture.memfs.writeFile(testFile, `
function trio(a: number, b: number, c: number): number { return a + b + c; }
const r = trio(1, 2);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'trio',
          '-p', fixture.rootPath,
          '--reorder', 'c,a,b',
          '--add', 'x:number=9@0',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 只驗呼叫點那一行（非函式定義行），輸出完整形狀由修復定義，此處保持寬鬆
      const callSiteLine = addedLines.find((l: string) => l.includes('trio(') && !l.includes('function trio'));
      expect(callSiteLine).toBeDefined();
      // 正確行為：填入 c 缺值與新增參數 x 預設值兩個來源應同步，字元 9 只應出現一次；
      // 目前的壞行為是兩個填值來源不同步，9 出現兩次
      const nineCount = (callSiteLine!.match(/9/g) ?? []).length;
      expect(nineCount).toBe(1);
    });
  });

  describe('缺陷12: 巢狀函式內區塊遮蔽被誤當整函式遮蔽', () => {
    it('--rename 應改到巢狀閉包中引用外層參數的識別符，僅區塊內遮蔽宣告不改', async () => {
      const testFile = `${fixture.rootPath}/regression-defect12-block-shadow-rename.ts`;
      await fixture.memfs.writeFile(testFile, `
function report(userId: string): string {
  function inner(flag: boolean): string {
    if (flag) {
      const userId = 'local';
      return userId;
    }
    return userId;
  }
  return inner(false);
}
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'report',
          '-p', fixture.rootPath,
          '--rename', 'userId:uid',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：閉包中引用外層參數的 `return userId;` 應改為 `return uid;`；
      // 區塊內遮蔽宣告（const userId = 'local'）與其引用不得改動。
      // 目前的壞行為是 if 區塊內的宣告被當成整個巢狀函式的遮蔽，閉包引用漏改殘留舊名
      expect(addedLines.some((l: string) => l.includes('return uid;'))).toBe(true);
      expect(addedLines.some((l: string) => l.includes('const uid ='))).toBe(false);
    });

    it('--remove 對僅在巢狀閉包中使用的參數應拒絕移除', async () => {
      const testFile = `${fixture.rootPath}/regression-defect12-block-shadow-remove.ts`;
      await fixture.memfs.writeFile(testFile, `
function audit(traceId: string): string {
  function inner(flag: boolean): string {
    if (flag) {
      const traceId = 'x';
      return traceId;
    }
    return traceId;
  }
  return inner(false);
}
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'audit',
          '-p', fixture.rootPath,
          '--remove', 'traceId',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // 正確行為：參數仍被巢狀閉包引用（inner 的 `return traceId;`），移除應被驗證拒絕；
      // 目前的壞行為是 if 區塊內同名宣告讓引用偵測整函式漏算，移除被放行、留下懸空引用
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('缺陷13: 參數預設值引用其他參數的情況未被處理', () => {
    it('移除仍被其他參數預設值引用的參數應被拒絕且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/regression-defect13-remove-referenced-by-default.ts`;
      const originalContent = `
function process(config: { defaultTimeout: number }, timeout = config.defaultTimeout): number {
  return timeout;
}

process({ defaultTimeout: 5 });
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature', testFile, 'process',
          '-p', fixture.rootPath,
          '--remove', 'config',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // 正確行為：與既有「刪除仍在函式 body 中使用的參數應該失敗」規則一致，
      // 另一參數 timeout 的預設值 `config.defaultTimeout` 也引用了 config，移除應被拒絕；
      // 目前的壞行為是驗證只掃 func.body，不看 parameters[i].initializer，
      // 移除被放行、產生引用不存在參數的壞碼
      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });

    it('rename 應同步改寫其他參數預設值中對該參數的引用', async () => {
      const testFile = `${fixture.rootPath}/regression-defect13-rename-default-reference.ts`;
      await fixture.memfs.writeFile(testFile, `
function fn(a: number, b = a + 1): number {
  return b;
}

fn(1);
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'fn',
          '-p', fixture.rootPath,
          '--rename', 'a:x',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：新定義中 b 的預設值應同步改為 `b = x + 1`；
      // 目前的壞行為是只有參數自身名稱被改，其他參數預設值裡的舊名 `a` 不會被改寫，
      // 產生引用不存在識別符 `a` 的壞碼 `b = a + 1`
      expect(addedLines.some((l: string) => l.includes('b = x + 1'))).toBe(true);
    });
  });

  describe('缺陷14: --reorder 允許把 rest 參數移到非最後位置', () => {
    it('把 rest 參數重排到非最後位置應被驗證拒絕且不修改檔案', async () => {
      const testFile = `${fixture.rootPath}/regression-defect14-reorder-rest-not-last.ts`;
      const originalContent = `
function fn(a: number, ...rest: number[]): number {
  return a + rest.length;
}

fn(1, 2, 3);
`.trim();
      await fixture.memfs.writeFile(testFile, originalContent);

      const result = await executeCLI(
        [
          'change-signature', testFile, 'fn',
          '-p', fixture.rootPath,
          '--reorder', 'rest,a',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      // 正確行為：rest 參數必須在最後，重排到非最後位置是無效 TS，應被驗證擋下；
      // 目前的壞行為是 signature-validator 只驗「可選在必選後」，沒驗「rest 必須最後」，
      // 產生無效碼 `function fn(...rest: number[], a: number)`
      expect(result.exitCode).not.toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(await fixture.memfs.readFile(testFile, 'utf-8')).toBe(originalContent);
    });
  });

  describe('R2-2: --rename 誤改型別位置的同名識別符', () => {
    it('參數改名不應波及其他參數預設值 as 型別斷言中的同名型別識別符', async () => {
      const testFile = `${fixture.rootPath}/regression-r2-2-rename-type-position.ts`;
      await fixture.memfs.writeFile(testFile, `
interface FormatterR22 { pad: number }
declare const valueR22: unknown;
export function fR22(FormatterR22: number, opts: unknown = valueR22 as FormatterR22) { return opts; }
`.trim());

      const result = await executeCLI(
        [
          'change-signature', testFile, 'fR22',
          '-p', fixture.rootPath,
          '--rename', 'FormatterR22:fmtR22',
          '--dry-run', '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const addedLines = getAddedLines(output);
      // 正確行為：參數本身改名為 fmtR22，但 `valueR22 as FormatterR22` 的 FormatterR22
      // 是型別位置的識別符（指向 interface FormatterR22，非該參數），不應被改名；
      // 目前的壞行為是 visitNodeForReferences 無型別/值判別，兩者同名時型別位置也被誤改
      expect(addedLines.some((l: string) => l.includes('fmtR22: number'))).toBe(true);
      expect(addedLines.some((l: string) => l.includes('valueR22 as FormatterR22'))).toBe(true);
      expect(addedLines.some((l: string) => l.includes('valueR22 as fmtR22'))).toBe(false);
    });
  });
});
