/**
 * CLI rename 命令 E2E 測試 - 跨檔案 bug 重現（先紅後綠）
 *
 * 已用 CLI 實跑確認的缺陷：
 * - C1（P1）：rename 誤改「毫無 import 關係」的他檔同名頂層符號
 * - C2（P2）：rename named export 時，別名 import（`import { x as y }`）的來源名未更新
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename cross-file bugs - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('缺陷C1: rename 誤改毫無 import 關係的他檔同名頂層符號', () => {
    it('a.js 的 greet 改名時，b.js 裡無關的同名 greet 與其呼叫點不應被改動', async () => {
      // Given: a.js 定義並 export 一個 greet，b.js 定義另一個完全獨立的 greet（無 import 關係）
      await fixture.writeFile(
        'src/a.js',
        `export function greet() {
  return 'hello';
}
`
      );
      await fixture.writeFile(
        'src/b.js',
        `function greet() {
  return 'unrelated';
}

export function useLocal() {
  return greet();
}
`
      );

      // When: 用 --at 精確鎖定 a.js 的 greet 定義，執行實際重命名（非 dry-run）
      const result = await executeCLI(
        [
          'rename', '--path', fixture.rootPath,
          '--from', 'greet', '--to', 'sayHi',
          '--at', 'src/a.js:1',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // Then: a.js 應該被改名
      const aContent = await fixture.readFile('src/a.js');
      expect(aContent).toContain('export function sayHi()');
      expect(aContent).not.toContain('greet');

      // Then: b.js 與 a.js 毫無 import 關係，其獨立定義的 greet 與呼叫點應維持原樣
      // 目前的壞行為（實測）：b.js 的頂層 greet 定義與 useLocal() 內的呼叫也被誤改成 sayHi
      const bContent = await fixture.readFile('src/b.js');
      expect(bContent).toContain('function greet()');
      expect(bContent).toContain('return \'unrelated\';');
      expect(bContent).toContain('return greet();');
      expect(bContent).not.toContain('sayHi');
    });
  });

  describe('缺陷C2: rename named export 時別名 import 的來源名未更新', () => {
    it('a2.js 的 greet2 改名後，c.js 的 `import { greet2 as g }` 應同步改為 `import { sayHi2 as g }`，本地別名與呼叫點不變', async () => {
      // Given: a2.js export greet2，c.js 用別名 import 並呼叫本地別名 g
      await fixture.writeFile(
        'src/a2.js',
        `export function greet2() {
  return 'hi';
}
`
      );
      await fixture.writeFile(
        'src/c.js',
        `import { greet2 as g } from './a2.js';

export function run() {
  return g();
}
`
      );

      // When: 用 --at 精確鎖定 a2.js 的 greet2 定義，執行實際重命名（非 dry-run）
      const result = await executeCLI(
        [
          'rename', '--path', fixture.rootPath,
          '--from', 'greet2', '--to', 'sayHi2',
          '--at', 'src/a2.js:1',
          '--format', 'json',
        ],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // Then: a2.js 定義應改名
      const a2Content = await fixture.readFile('src/a2.js');
      expect(a2Content).toContain('export function sayHi2()');
      expect(a2Content).not.toContain('greet2');

      // Then: c.js 的 import 來源名應同步更新為 sayHi2，本地別名 g 與其呼叫點維持不變
      // 目前的壞行為（實測）：c.js 的 `import { greet2 as g }` 原樣未動，
      // 導致引用一個已不存在的 export（greet2），本地別名 g 與 g() 呼叫則不受影響
      const cContent = await fixture.readFile('src/c.js');
      expect(cContent).toContain('import { sayHi2 as g } from \'./a2.js\';');
      expect(cContent).not.toContain('greet2');
      expect(cContent).toContain('return g();');
    });
  });
});
