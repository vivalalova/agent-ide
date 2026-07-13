/**
 * CLI deadcode object method 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * C16：物件字面值中的 dead method（無人呼叫）被判 dead 後，--apply 刪除範圍
 *      擴大到整個宣告行，把同一物件中仍在使用的其他成員（live: true）一起刪掉，
 *      導致 `o` 變數整個宣告消失，readLive() 讀取 o.live 會 ReferenceError。
 *      預期契約：只能刪 dead() 成員本身（或整體不刪），不得動 o 宣告與 live: true。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode object method 缺陷（C16，JS 專案，reproduction）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('object 中的 dead method 被刪除時，不得連帶刪除同物件中仍在使用的 live 成員', async () => {
    await fixture.writeFile('src/obj.js', `const o = { dead() { return 1; }, live: true };

export function readLive() {
  return o.live;
}
`);

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const content = await fixture.readFile('src/obj.js');
    // 實測錯誤結果：整行 `const o = ...` 被刪掉（o 宣告消失）
    // 正確行為：o 的宣告必須保留
    expect(content).toMatch(/const\s+o\s*=/);
    // live: true 仍被 readLive() 使用，不得被連帶刪除
    expect(content).toContain('live: true');
    // readLive 函式本身應保留
    expect(content).toContain('function readLive');
  });
});
