/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）- JavaScript 專案
 *
 * 缺陷：rename 對 object literal shorthand（`{ foo }`）與 destructuring
 * shorthand（`const { foo } = opts`）做天真的識別符文字替換，未展開成
 * `key: newName` 形式。TS 側同缺陷見
 * tests/e2e/commands/typescript/cli-rename-shorthand-bugs.e2e.test.ts；
 * 本檔驗證 javascript plugin（.js 檔）走相同壞路徑。
 *
 * 已用 CLI 實跑確認（node ./bin/agent-ide.js rename ... --no-cache）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（shorthand 展開）- JavaScript', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('物件字面值 shorthand：rename 後應展開為 { foo: bar }，保住原 key', async () => {
    await fixture.writeFile(
      'src/shorthand-obj-js.js',
      `function makeShorthandObjJs() {
  const foo = 42;
  return { foo };
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/shorthand-obj-js.js:2:9',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/shorthand-obj-js.js');
    expect(after).toContain('const bar = 42;');
    // Bug：現況把 `{ foo }` 天真改成 `{ bar }`，物件 key 被改掉；
    // 正確應保留 key `foo`，展開成 `{ foo: bar }`
    expect(after).toContain('return { foo: bar };');
    expect(after).not.toContain('return { bar };');
  });

  it('解構 shorthand：rename 後應展開為 { foo: bar } = opts，保住來源欄位名', async () => {
    await fixture.writeFile(
      'src/shorthand-destructure-js.js',
      `function useShorthandDestructureJs(opts) {
  const { foo } = opts;
  return foo + 1;
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/shorthand-destructure-js.js:2:11',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/shorthand-destructure-js.js');
    // Bug：現況把 `const { foo } = opts;` 天真改成 `const { bar } = opts;`，
    // 導致執行期讀不到 opts.foo；正確應展開成 `const { foo: bar } = opts;`
    expect(after).toContain('const { foo: bar } = opts;');
    expect(after).not.toContain('const { bar } = opts;');
    expect(after).toContain('return bar + 1;');
  });
});
