/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F2（JS 版）：內層以 shorthand property 引用外層同名變數時，rename 改名為
 * 該名應被視為衝突。與 TS 版（cli-rename-scope-conflict-f2.e2e.test.ts）同一
 * 根因：RenameEngine.generateChangeset() 只呼叫 validateRename()，從未呼叫
 * detectConflicts()（NameCollision／ScopeConflict 檢查），故任何作用域衝突
 * 皆不會被偵測與擋下。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 F2（JS）：shorthand property 捕獲外層同名變數', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F2] 內層以 shorthand property 引用外層名稱時，改名為該名應擋，非 dry-run 場景', async () => {
    const relPath = 'src/f2-js-shorthand-capture.js';
    const original = `const sharedF2Js = 1;
export function fF2Js() {
  const localF2Js = 2;
  return { sharedF2Js, localF2Js };
}
export const sF2Js = sharedF2Js;
`;
    await fixture.writeFile(relPath, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'localF2Js', '--to', 'sharedF2Js',
        '--at', `${relPath}:3`,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // `{ sharedF2Js, localF2Js }` 的 sharedF2Js 是 shorthand property，讀的是
    // 外層變數；改名後內層宣告遮蔽外層，shorthand 改讀內層值，且物件字面值
    // 產生兩個同名鍵——必須拒絕寫入、檔案不變
    expect(result.exitCode).not.toBe(0);
    const updated = await fixture.readFile(relPath);
    expect(updated).toBe(original);
  });

  it('[F2] 內層以 shorthand property 引用外層名稱時，改名為該名應擋，dry-run 場景須標示衝突', async () => {
    const relPath = 'src/f2-js-shorthand-capture-dry.js';
    const original = `const sharedF2Js2 = 1;
export function fF2Js2() {
  const localF2Js2 = 2;
  return { sharedF2Js2, localF2Js2 };
}
export const sF2Js2 = sharedF2Js2;
`;
    await fixture.writeFile(relPath, original);

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'localF2Js2', '--to', 'sharedF2Js2',
        '--at', `${relPath}:3`,
        '--dry-run', '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.conflicts).toBeDefined();
    expect(Array.isArray(output.conflicts)).toBe(true);
    expect(output.conflicts.length).toBeGreaterThan(0);
  });
});
