/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * 缺陷：rename 對 object literal shorthand（`{ foo }`）與 destructuring
 * shorthand（`const { foo } = opts`）做天真的識別符文字替換，未展開成
 * `key: newName` 形式，導致：
 * 1. Object literal shorthand：`return { foo };` rename foo→bar 後
 *    變成 `return { bar };`（物件 key 被誤改，破壞物件形狀）；
 *    正確應為 `return { foo: bar };`（保留 key `foo`，值改指向 `bar`）。
 * 2. Destructuring shorthand：`const { foo } = opts;` rename foo→bar 後
 *    變成 `const { bar } = opts;`（解構來源欄位被誤改，執行期讀不到
 *    `opts.foo`）；正確應為 `const { foo: bar } = opts;`。
 *
 * 另一種誤判方向：rename 對「非物件」解構（array destructuring、
 * rest element）誤套物件 shorthand 展開規則，產出語法非法的
 * `key: newName` 形式：
 * 3. Array destructuring：`const [foo] = arr;` rename foo→bar 後
 *    變成 `const [foo: bar] = arr;`（非法語法，array pattern 沒有
 *    key:value 形式）；正確應為 `const [bar] = arr;`（單純識別符替換）。
 * 4. Rest element：`const { a, ...rest } = obj;` rename rest→leftover
 *    後變成 `const { a, ...rest: leftover } = obj;`（非法語法，
 *    rest element 不能展開成 key:value）；正確應為
 *    `const { a, ...leftover } = obj;`。
 *
 * 已用 CLI 實跑確認（node ./bin/agent-ide.js rename ... --no-cache）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（shorthand 展開）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('物件字面值 shorthand：rename 後應展開為 { foo: bar }，保住原 key', async () => {
    await fixture.writeFile(
      'src/shorthand-obj-ts.ts',
      `function makeShorthandObjTs() {
  const foo = 42;
  return { foo };
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/shorthand-obj-ts.ts:2:9',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/shorthand-obj-ts.ts');
    expect(after).toContain('const bar = 42;');
    // Bug：現況把 `{ foo }` 天真改成 `{ bar }`，物件 key 被改掉；
    // 正確應保留 key `foo`，展開成 `{ foo: bar }`
    expect(after).toContain('return { foo: bar };');
    expect(after).not.toContain('return { bar };');
  });

  it('解構 shorthand：rename 後應展開為 { foo: bar } = opts，保住來源欄位名', async () => {
    await fixture.writeFile(
      'src/shorthand-destructure-ts.ts',
      `function useShorthandDestructureTs(opts: any) {
  const { foo } = opts;
  return foo + 1;
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/shorthand-destructure-ts.ts:2:11',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/shorthand-destructure-ts.ts');
    // Bug：現況把 `const { foo } = opts;` 天真改成 `const { bar } = opts;`，
    // 導致執行期讀不到 opts.foo；正確應展開成 `const { foo: bar } = opts;`
    expect(after).toContain('const { foo: bar } = opts;');
    expect(after).not.toContain('const { bar } = opts;');
    expect(after).toContain('return bar + 1;');
  });

  it('array destructuring：rename 後應為 [bar]，禁誤套物件 shorthand 展開成非法的 [foo: bar]', async () => {
    await fixture.writeFile(
      'src/array-destructure-ts.ts',
      `function useArrayDestructureTs(arr: number[]) {
  const [foo] = arr;
  return foo + 1;
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/array-destructure-ts.ts:2:10',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/array-destructure-ts.ts');
    // Bug：array pattern 沒有 key:value 形式，現況誤套物件 shorthand 規則
    // 產出非法語法 `const [foo: bar] = arr;`；正確應單純替換識別符
    expect(after).toContain('const [bar] = arr;');
    expect(after).not.toContain('foo:');
    expect(after).toContain('return bar + 1;');
  });

  it('rest element：rename 後應為 ...leftover，禁誤套物件 shorthand 展開成非法的 ...rest: leftover', async () => {
    await fixture.writeFile(
      'src/rest-element-ts.ts',
      `function useRestElementTs(obj: any) {
  const { a, ...rest } = obj;
  return rest.b + a;
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'rest', '--to', 'leftover',
        '--at', 'src/rest-element-ts.ts:2:17',
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/rest-element-ts.ts');
    // Bug：rest element 不能展開成 key:value，現況誤套物件 shorthand 規則
    // 產出非法語法 `...rest: leftover`；正確應單純替換識別符為 `...leftover`
    expect(after).toContain('const { a, ...leftover } = obj;');
    expect(after).not.toContain('rest:');
    expect(after).toContain('return leftover.b + a;');
  });
});
