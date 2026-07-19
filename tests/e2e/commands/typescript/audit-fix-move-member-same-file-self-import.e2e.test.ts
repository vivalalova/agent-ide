/**
 * audit-fix P1 regression（先紅後綠）
 *
 * reference-updater.ts:305 buildSourceSelfReferenceImport 未檢查
 * options.sourceFile === options.target.filePath。same-file move
 * （`move <file>:1 <file>`，把 export function 移到同檔尾端）exitCode 0 成功，
 * 卻在同檔頂部寫入 `import { alpha } from './self-move.js';`——來源檔就是
 * 目標檔本身，這個 self-import 撞上檔案稍後仍宣告的同名本地 `alpha`，
 * 造成重複識別符（TS2440：Import declaration conflicts with local declaration）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix：move-member 同檔案移動不得寫入指向自身的 import', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('同檔內把成員從檔首移到檔尾後，檔案不得含指向自身的 import', async () => {
    await fixture.writeFile('src/mm-b-self-move.ts', `export function alpha() {
  return 1;
}

export function beta() {
  return alpha() + 2;
}
`);

    const filePath = fixture.getFilePath('src/mm-b-self-move.ts');
    const result = await executeCLI(
      [
        'move',
        `${filePath}:1`,
        filePath,
        '--path', fixture.rootPath,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const written = await fixture.readFile('src/mm-b-self-move.ts');

    // 正確行為：same-file move 不需要（也不能）補 self-import，alpha 仍在同檔內
    // 目前壞行為：頂部被插入 `import { alpha } from './mm-b-self-move.js';`，
    // 與稍後 `export function alpha()` 本地宣告衝突（TS2440）
    expect(written).not.toMatch(/import\s*\{\s*alpha\s*\}\s*from\s*['"]\.\/mm-b-self-move(?:\.js)?['"]/);
    expect(written).not.toContain('mm-b-self-move');

    // alpha 仍應以本地函式宣告的形式存在（唯一一份，且是函式宣告而非 import binding）
    expect(written.match(/function alpha\(\)/g)).toHaveLength(1);
    expect(written).toContain('function beta()');
  });
});
