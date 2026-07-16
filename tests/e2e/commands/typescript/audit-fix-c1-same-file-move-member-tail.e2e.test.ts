/**
 * audit-fix C1 regression（先紅後綠）
 *
 * 同檔 move-member：source 在檔首、移到檔尾後，apply 寫回磁碟不得殘留
 * 被移走成員的尾段垃圾（range 若以「移除後內容」長度計算，只替換前段，
 * 原檔後半會殘留）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix C1：同檔 move-member 不得殘留尾段垃圾', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C1：檔首成員移到檔尾後，寫入內容不得殘留移除前尾段／重複成員', async () => {
    // 多行成員 + 後續成員：放大 range 錯位時的殘留尾段
    const source = [
      'export function alphaMoved() {',
      '  const a = 1;',
      '  const b = 2;',
      '  return a + b;',
      '}',
      '',
      'export function betaStay() {',
      '  return 20;',
      '}',
      '',
      'export function gammaStay() {',
      '  return 30;',
      '}',
      ''
    ].join('\n');

    await fixture.writeFile('src/c1-same-file.ts', source);

    // 同檔：source 第 1 行 alpha → target 同檔（預設插到檔尾）
    const filePath = fixture.getFilePath('src/c1-same-file.ts');
    const result = await executeCLI(
      [
        'move',
        `${filePath}:1`,
        filePath,
        '--path',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const written = (await fixture.memfs.readFile(filePath, 'utf-8')) as string;

    // 每個成員恰好一次（殘留尾段常見症狀：重複 function / 半截宣告）
    expect(written.match(/function alphaMoved\(/g)).toHaveLength(1);
    expect(written.match(/function betaStay\(/g)).toHaveLength(1);
    expect(written.match(/function gammaStay\(/g)).toHaveLength(1);

    // beta、gamma 應在 alpha 之前（alpha 從檔首搬到檔尾）
    expect(written.indexOf('function betaStay')).toBeLessThan(written.indexOf('function alphaMoved'));
    expect(written.indexOf('function gammaStay')).toBeLessThan(written.indexOf('function alphaMoved'));

    // 不得殘留半截：原 alpha body 片段若因 range 過短被留在檔尾，會多出孤立行
    // 完整檔案應可被視為「三個完整函式 + 合理空白」——尾端不得出現無 export/function 前綴的 body 殘渣
    const afterLastFunction = written.slice(written.lastIndexOf('function alphaMoved'));
    // alpha 本體應完整閉合一次，且之後不得再出現 beta/gamma 殘段
    expect(afterLastFunction).toMatch(/function alphaMoved\(\) \{\n {2}const a = 1;\n {2}const b = 2;\n {2}return a \+ b;\n\}/);
    expect(afterLastFunction).not.toMatch(/function betaStay/);
    expect(afterLastFunction).not.toMatch(/function gammaStay/);

    // 寫入長度應接近「移除+插入後」合理大小，不得接近 original+newText 疊加
    expect(written.length).toBeLessThan(source.length + 40);
    expect(written.trimEnd().endsWith('}')).toBe(true);
  });
});
