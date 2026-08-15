/**
 * [audit-fix] F3-2 先紅回歸
 *
 * src/core/move/path-calculator.ts:368-375 的 sourceFileStillExists 判斷，
 * 直接用 normalizedResolved（import specifier 字面解析出的路徑）逐一附加候選
 * 副檔名檢查存在性，沒有先用 stripSourceFileExtension 剝除 import 字面已帶的
 * 顯式副檔名（如 './b.js'，指向磁碟上實際的 b.ts，符合 TS ESM 慣例）。
 * 因此對顯式 `.js` import，sourceFileStillExists 永遠算出 false（因為候選路徑
 * 疊加變成 'b.js.ts' 之類，比對不到真正存在的 'b.ts'），導致「目標目錄剛好有
 * 同名 shadow 檔案、但來源檔其實還在原位」的保護邏輯誤判成「來源已被搬走」，
 * 錯誤地跳過本該更新的 import，讓 import 靜默沿用舊相對路徑、實際指向錯誤模組。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix F3-2：move 對顯式 .js import 的 shadow-file 保護不得誤判來源已消失', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('目標目錄剛好有無關的同名 .js 檔、來源 .ts 仍在原位時，顯式 .js import 仍須改寫為新相對路徑', async () => {
    await fixture.writeFile('src/f3-2-b.ts', 'export const bVal = 1;\n');
    await fixture.writeFile('src/f3-2-a.ts', `import { bVal } from './f3-2-b.js';
export const use = bVal;
`);
    // 目標目錄剛好有一個無關的同名 .js 檔（非 f3-2-b.ts 搬過去產生的）
    await fixture.writeFile('src/target/f3-2-b.js', 'export const bVal = \'unrelated\';\n');

    const result = await executeCLI(
      [
        'move',
        'src/f3-2-a.ts',
        'src/target/f3-2-a.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const movedContent = await fixture.readFile('src/target/f3-2-a.ts');

    // 正確行為：f3-2-b.ts 仍在原位 src/，搬到 src/target/ 後必須改寫成 '../f3-2-b.js'
    // 目前壞行為：sourceFileStillExists 誤判為 false，被 shadow-file 保護誤擋，
    // import 原樣保留 './f3-2-b.js'（0 changes），實際指向 target 目錄那個無關的 b.js
    expect(movedContent).toContain('from \'../f3-2-b.js\'');
    expect(movedContent).not.toContain('from \'./f3-2-b.js\'');
  });

  it('對照組：目標目錄沒有巧合同名 .js 檔時，顯式 .js import 應正確改寫（保護性，現行應綠）', async () => {
    await fixture.writeFile('src/f3-2-ctrl-b.ts', 'export const bVal = 1;\n');
    await fixture.writeFile('src/f3-2-ctrl-a.ts', `import { bVal } from './f3-2-ctrl-b.js';
export const use = bVal;
`);

    const result = await executeCLI(
      [
        'move',
        'src/f3-2-ctrl-a.ts',
        'src/target/f3-2-ctrl-a.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const movedContent = await fixture.readFile('src/target/f3-2-ctrl-a.ts');
    expect(movedContent).toContain('from \'../f3-2-ctrl-b.js\'');
  });
});
