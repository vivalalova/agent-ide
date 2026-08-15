/**
 * audit-fix P1 regression（先紅後綠）
 *
 * reference-updater.ts:374/421-429（prepareCallPathUpdates）：消費檔以多行形式
 * 呼叫 require()/動態 import()，如：
 *   const { movedMember } = require(
 *     './mm-source'
 *   );
 * callPattern（\s* 吃換行）可跨行匹配到整個呼叫，但發出的 ReferenceUpdate.location
 * 把 end.line 硬寫成 start 所在的首行（見 421-429 `end: { line: lineNumber, ... }`），
 * end.column 則是「首行 column + 整段跨行呼叫字串長度」——一個遠超首行實際長度的值。
 * apply-text-edits.ts:210 的 calculateOffset 對超出行長的 column 做 clamp，把這個
 * end 位置 clamp 回首行行尾，導致實際套用的 edit range 只涵蓋首行、換行後的原始
 * 第二三行（舊路徑字串、收尾括號）完全沒被納入替換範圍而原樣殘留，同時前面又插入
 * 了一份新的多行 require 呼叫文字，兩者疊在一起造成語法錯誤與新舊路徑並存。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix：move-member 消費檔多行 require() 呼叫不得殘留舊路徑造成檔案損毀', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('多行 require() 呼叫更新路徑後，消費檔不得同時殘留新舊兩段呼叫、且內容須維持語法有效', async () => {
    await fixture.writeFile('src/mm-a-source.ts', `export function movedMember() {
  return 1;
}
`);
    await fixture.writeFile('src/mm-a-target.ts', `export const placeholder = true;
`);
    await fixture.writeFile('src/mm-a-consumer.js', `const { movedMember } = require(
  './mm-a-source'
);

module.exports = { use: movedMember };
`);

    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/mm-a-source.ts')}:1`,
        fixture.getFilePath('src/mm-a-target.ts'),
        '--path', fixture.rootPath,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const consumerContent = await fixture.readFile('src/mm-a-consumer.js');

    // 正確行為：只應存在一段更新後的 require() 呼叫，指向新的目標路徑
    expect(consumerContent.match(/require\s*\(/g)).toHaveLength(1);
    expect(consumerContent).toContain('./mm-a-target');
    // 目前壞行為：舊路徑字串殘留（第二三行原樣留下），與新插入的呼叫並存
    expect(consumerContent).not.toContain('./mm-a-source');

    // 語法有效性：不得出現「呼叫結束後緊接孤兒字串常量」這種殘留特徵
    // （壞行為具體輸出為 `require(\n  './mm-a-target'\n)\n  './mm-a-source'\n);`——
    // 收尾多一個裸露的舊路徑字串陳述式）
    expect(consumerContent).not.toMatch(/\)\s*\n\s*['"][^'"]*mm-a-source['"]/);
    expect(consumerContent.match(/movedMember/g)?.length).toBeGreaterThan(0);
  });
});
