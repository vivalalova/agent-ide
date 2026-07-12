/**
 * CLI deadcode 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * G2：JS parser 把物件字面值的 key 發成 Variable symbol，
 *     reference-finder 又刻意忽略非計算屬性的 key（正確），
 *     於是「未被讀取的 key」被判 dead；--apply 時宣告範圍查不到
 *     ObjectProperty，fallback 擴到整行，把仍在使用的 const 整行刪掉。
 *     預期契約：物件屬性不是可獨立刪除的 dead code，--apply 不得動該行。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 物件 key regression（G2，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('物件字面值中未讀取的 key 不得導致整行 const 被 --apply 刪除', async () => {
    await fixture.writeFile('src/g2-config.js', [
      'const g2Config = { unusedKeyG2: 1, usedKeyG2: 2 };',
      '',
      'export function readG2Config() {',
      '  return g2Config.usedKeyG2;',
      '}',
      '',
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const content = await fixture.readFile('src/g2-config.js');
    expect(content).toContain('const g2Config = { unusedKeyG2: 1, usedKeyG2: 2 };');
    expect(content).toContain('return g2Config.usedKeyG2;');
  });
});
