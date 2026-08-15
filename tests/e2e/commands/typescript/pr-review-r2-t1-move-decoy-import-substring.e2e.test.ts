/**
 * PR #61 第二輪 review 缺陷 T1（reproduction，先紅後綠）
 *
 * src/core/move/statement-collector.ts:135 用裸 `includes('import')` 判斷
 * 多行 import 起點，導致 `const important = true;` 這種只是「子字串含
 * import」的普通語句被誤判成 multiline import 開頭，收集器一路吞到下一個
 * 真 import 為止，中間的語句（含 `require('./other')`）全被跳過，
 * 移動檔案時不會更新它們的路徑。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move 缺陷 regression（T1：decoy import 子字串吞語句）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[錯誤重現點] `const important = true;` 之後的 require 路徑仍須隨檔案移動更新', async () => {
    await fixture.writeFile('src/t1-source.ts', `export function helperFn(): number {
  return 1;
}
`);
    await fixture.writeFile('src/t1-other.ts', `module.exports = { value: 1 };
`);
    await fixture.writeFile('src/t1-consumer.ts', `const important = true;
const other = require('./t1-other');
import { helperFn } from './t1-source';

export const used = important && Boolean(other) && helperFn() > 0;
`);

    const result = await executeCLI(
      ['move', 'src/t1-other.ts', 'src/t1-moved-other.ts', '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const consumer = await fixture.readFile('src/t1-consumer.ts');

    // 錯誤重現點：require 指向已被移走的舊路徑，未被更新
    expect(consumer).toContain('require(\'./t1-moved-other\')');
    expect(consumer).not.toContain('require(\'./t1-other\')');
  });
});
