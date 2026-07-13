/**
 * CLI change-signature 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * 以下四筆皆已用 CLI 實跑確認（apply 模式，非 --dry-run）：
 *
 * C11：別名 import（`import { x as y }`）的呼叫點漏改
 *     實測：lib.ts 定義的參數順序改了，但透過別名 `merge` 呼叫的 app.ts 呼叫點沒改。
 * C13：namespace import（`import * as ns`）的呼叫點漏改
 *     實測：`lib.combine(...)` 這種 `ns.member(...)` 形式的呼叫點沒改。
 * C12：兩層 barrel re-export（`target → barrel1 → barrel2 → consumer`）的消費端呼叫點漏改
 *     實測：只有直接 re-export 一層時消費端會更新，兩層 barrel 疊起來後 consumer 呼叫點沒改。
 * C14：同檔案內呼叫點文字位置在函式宣告之前時，宣告本身的編輯遺失
 *     實測：呼叫點正確重排引數順序，但函式宣告的參數順序沒有跟著改，
 *     產生「呼叫點與宣告不一致」的壞碼。
 *
 * 每筆皆採 apply 模式（無 --dry-run）後讀檔驗證最終內容，而非只看 dry-run 的 diff JSON。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI change-signature - 缺陷 regression（C11-C14）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('C11: 別名 import 呼叫點漏改', () => {
    it('透過 `import { combine as merge }` 呼叫的呼叫點應同步重排', async () => {
      await fixture.writeFile('src/c11-lib.ts', `
export function combine(first: string, second: string): string { return first + second; }
`.trim());
      await fixture.writeFile('src/c11-app.ts', `
import { combine as merge } from './c11-lib.js';

export const out = merge('a', 'b');
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/c11-lib.ts'),
          '--function', 'combine',
          '-p', fixture.rootPath,
          '--reorder', 'second,first',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updatedLib = await fixture.memfs.readFile(fixture.getFilePath('src/c11-lib.ts'), 'utf-8') as string;
      const updatedApp = await fixture.memfs.readFile(fixture.getFilePath('src/c11-app.ts'), 'utf-8') as string;

      // 定義應改為新順序 (second, first)
      expect(updatedLib).toContain('export function combine(second: string, first: string): string');
      // 正確行為：透過別名 merge 呼叫的呼叫點也要同步重排成 merge('b', 'a')；
      // 目前的壞行為是 app.ts 完全沒被改動，仍是 merge('a', 'b')
      expect(updatedApp).toContain('merge(\'b\', \'a\')');
    });
  });

  describe('C13: namespace import 呼叫點漏改', () => {
    it('透過 `import * as lib` 的 `lib.combine(...)` 呼叫點應同步重排', async () => {
      await fixture.writeFile('src/c13-lib.ts', `
export function combine(first: string, second: string): string { return first + second; }
`.trim());
      await fixture.writeFile('src/c13-ns.ts', `
import * as lib from './c13-lib.js';

export const nsOut = lib.combine('x', 'y');
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/c13-lib.ts'),
          '--function', 'combine',
          '-p', fixture.rootPath,
          '--reorder', 'second,first',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updatedLib = await fixture.memfs.readFile(fixture.getFilePath('src/c13-lib.ts'), 'utf-8') as string;
      const updatedNs = await fixture.memfs.readFile(fixture.getFilePath('src/c13-ns.ts'), 'utf-8') as string;

      expect(updatedLib).toContain('export function combine(second: string, first: string): string');
      // 正確行為：lib.combine('x', 'y') 應重排成 lib.combine('y', 'x')；
      // 目前的壞行為是 namespace member 呼叫形式完全沒被偵測到，ns.ts 沒有任何變動
      expect(updatedNs).toContain('lib.combine(\'y\', \'x\')');
    });
  });

  describe('C12: 兩層 barrel re-export 的 consumer 呼叫點漏改', () => {
    it('透過 target → barrel1 → barrel2 → consumer 兩層 re-export 的呼叫點應同步重排', async () => {
      await fixture.writeFile('src/c12-target.ts', `
export function stack(top: string, bottom: string): string { return top + bottom; }
`.trim());
      await fixture.writeFile('src/c12-barrel1.ts', `
export { stack } from './c12-target.js';
`.trim());
      await fixture.writeFile('src/c12-barrel2.ts', `
export { stack } from './c12-barrel1.js';
`.trim());
      await fixture.writeFile('src/c12-consumer.ts', `
import { stack } from './c12-barrel2.js';

export const out = stack('t', 'b');
`.trim());

      const result = await executeCLI(
        [
          'change-signature',
          '--file', fixture.getFilePath('src/c12-target.ts'),
          '--function', 'stack',
          '-p', fixture.rootPath,
          '--reorder', 'bottom,top',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updatedTarget = await fixture.memfs.readFile(fixture.getFilePath('src/c12-target.ts'), 'utf-8') as string;
      const updatedConsumer = await fixture.memfs.readFile(fixture.getFilePath('src/c12-consumer.ts'), 'utf-8') as string;

      expect(updatedTarget).toContain('export function stack(bottom: string, top: string): string');
      // 正確行為：stack('t', 'b') 應重排成 stack('b', 't')；
      // 目前的壞行為是只有一層 re-export 時消費端會更新，疊到兩層 barrel 後 consumer 完全沒被改動
      expect(updatedConsumer).toContain('stack(\'b\', \'t\')');
    });
  });

  describe('C14: 同檔呼叫點在宣告之前時宣告編輯遺失', () => {
    it('呼叫點在函式宣告之前（巢狀於另一函式內）時，宣告與呼叫點都應更新', async () => {
      const testFile = 'src/c14-order.ts';
      const original = `
export function helperCall(): void {
  setup('y', 2);
}

export function setup(name: string, count: number): void {
  void name;
  void count;
}
`.trim();
      await fixture.writeFile(testFile, original);

      const result = await executeCLI(
        [
          'change-signature', fixture.getFilePath(testFile), 'setup',
          '-p', fixture.rootPath,
          '--reorder', 'count,name',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updated = await fixture.memfs.readFile(fixture.getFilePath(testFile), 'utf-8') as string;
      const expected = `
export function helperCall(): void {
  setup(2, 'y');
}

export function setup(count: number, name: string): void {
  void name;
  void count;
}
`.trim();

      // 正確行為：呼叫點與宣告都要更新成新順序；
      // 目前的壞行為是呼叫點重排成 setup(2, 'y')，但宣告仍停留在 (name: string, count: number)——
      // 宣告編輯被遺失，產生呼叫點與宣告不一致的壞碼
      expect(updated).toBe(expected);
    });

    it('檔案第一行就有頂層呼叫、宣告在其後時，宣告與所有呼叫點都應更新，其餘內容不受影響', async () => {
      const testFile = 'src/c14-order-top-level.ts';
      const original = `
setup('x', 1);

export function helperCall2(): void {
  setup('y', 2);
}

export function setup(name: string, count: number): void {
  void name;
  void count;
}
`.trim();
      await fixture.writeFile(testFile, original);

      const result = await executeCLI(
        [
          'change-signature', fixture.getFilePath(testFile), 'setup',
          '-p', fixture.rootPath,
          '--reorder', 'count,name',
          '--format', 'json'
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const updated = await fixture.memfs.readFile(fixture.getFilePath(testFile), 'utf-8') as string;
      const expected = `
setup(1, 'x');

export function helperCall2(): void {
  setup(2, 'y');
}

export function setup(count: number, name: string): void {
  void name;
  void count;
}
`.trim();

      // 正確行為：頂層呼叫、巢狀呼叫、宣告三處都要同步更新為新引數順序，其餘行不變；
      // 目前的壞行為與上一案例同源：宣告編輯遺失（或連帶影響其餘呼叫點的更新一致性）
      expect(updated).toBe(expected);
    });
  });
});
