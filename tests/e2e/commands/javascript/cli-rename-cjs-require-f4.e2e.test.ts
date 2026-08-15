/**
 * F4 P2 — CJS require 跨檔 rename 漏（reproduction，先紅後綠）
 *
 * consumer 以 `const { foo } = require('./mod')` 解構匯入時，rename 定義端的
 * foo 應同步更新 consumer 的 destructuring binding 與呼叫點；目前 CJS require
 * 解構路徑漏追，consumer 原樣不動。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 F4：CJS require 跨檔 destructuring', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('rename module.exports 的 foo 後，require 解構 consumer 應同步改名', async () => {
    await fixture.writeFile(
      'src/mod-f4.js',
      [
        'function foo() {',
        '  return \'hello\';',
        '}',
        'module.exports = { foo };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/consumer-f4.js',
      [
        'const { foo } = require(\'./mod-f4\');',
        'function use() {',
        '  return foo();',
        '}',
        'module.exports = { use };',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/mod-f4.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const modContent = await fixture.readFile('src/mod-f4.js');
    expect(modContent).toContain('function bar()');
    expect(modContent).toContain('module.exports = { bar }');
    expect(modContent).not.toContain('foo');

    // Bug：consumer 的 require 解構與呼叫點目前不會被更新
    const consumerContent = await fixture.readFile('src/consumer-f4.js');
    expect(consumerContent).toContain('const { bar } = require(\'./mod-f4\')');
    expect(consumerContent).toContain('return bar()');
    expect(consumerContent).not.toContain('foo');
  });
});
