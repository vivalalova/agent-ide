/**
 * audit-fix M1 regression（先紅後綠）
 *
 * 同檔 move-member 指定 target:line（insertPosition）時，行號應以
 * **原始檔**座標解讀。若實作先移除成員再以移除後內容解讀 insertPosition，
 * 會把成員插到錯位（使用者指定的「插在 gamma 前」實際落到錯誤列）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix M1：同檔 insertPosition 行號', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M1：同檔移到指定行時，成員應落在原始座標指定的鄰居之間', async () => {
    // 行號（1-based，原始檔）：
    // 1-3 alpha, 4 blank, 5-7 beta, 8 blank, 9-11 gamma
    const source = [
      'export function alphaM1() {',
      '  return 1;',
      '}',
      '',
      'export function betaM1() {',
      '  return 2;',
      '}',
      '',
      'export function gammaM1() {',
      '  return 3;',
      '}',
      ''
    ].join('\n');

    await fixture.writeFile('src/m1-same-file.ts', source);
    const filePath = fixture.getFilePath('src/m1-same-file.ts');

    // 把 alpha（L1）移到原始 L9（gamma 開頭）→ 期望順序 beta, alpha, gamma
    const result = await executeCLI(
      [
        'move',
        `${filePath}:1`,
        `${filePath}:9`,
        '--path',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const written = (await fixture.memfs.readFile(filePath, 'utf-8')) as string;
    const betaAt = written.indexOf('function betaM1');
    const alphaAt = written.indexOf('function alphaM1');
    const gammaAt = written.indexOf('function gammaM1');

    expect(betaAt).toBeGreaterThanOrEqual(0);
    expect(alphaAt).toBeGreaterThanOrEqual(0);
    expect(gammaAt).toBeGreaterThanOrEqual(0);

    // 正確：beta → alpha → gamma（插在原始 gamma 位置前）
    // Bug：移除 alpha 後行號上移，L9 解到檔尾或 gamma 後，順序錯位
    expect(betaAt).toBeLessThan(alphaAt);
    expect(alphaAt).toBeLessThan(gammaAt);
  });
});
