/**
 * CLI rename 命令 E2E 測試 - [audit-fix] F2-2
 *
 * 缺陷：src/core/rename/reference-updater.ts:316-321 展開 shorthand
 * 一律用 `${shorthandKeyText}: ${newName}`（保留原文字當 key、新名當 value），
 * 這對「重命名變數（value 端）」正確，但對「重命名 interface property（key 端）」
 * 方向反了：應改成 `${newName}: ${shorthandKeyText}`（新名當 key、原變數名維持
 * value），否則 rename interface property 後物件字面值仍指向不存在/錯誤的 key。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename - interface property shorthand 展開方向 [audit-fix] F2-2', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[audit-fix] F2-2：rename interface property foo→bar 應展開為 { bar: foo }（key 改、value 維持本地變數名）', async () => {
    await fixture.writeFile(
      'src/interface-prop-shorthand-f22.ts',
      `export interface OptionsF22 {
  foo: string;
}

export function makeF22(): OptionsF22 {
  const foo = 'x';
  return { foo };
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/interface-prop-shorthand-f22.ts:2:3',
        '--no-cache', '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/interface-prop-shorthand-f22.ts');
    expect(after).toContain('bar: string;');
    // interface property 改名：key 應變 bar，value 應維持指向本地變數 foo
    expect(after).toContain('return { bar: foo };');
    expect(after).not.toContain('return { foo: bar };');
    // 本地變數 foo 本身不應被這次 rename 誤改
    expect(after).toContain('const foo = \'x\';');
  });

  it('[audit-fix] F2-2 對照（保護性）：rename 本地變數 foo→bar 應展開為 { foo: bar }（現行已正確）', async () => {
    await fixture.writeFile(
      'src/interface-prop-shorthand-f22-var.ts',
      `export interface OptionsF22Var {
  foo: string;
}

export function makeF22Var(): OptionsF22Var {
  const foo = 'x';
  return { foo };
}
`
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'foo', '--to', 'bar',
        '--at', 'src/interface-prop-shorthand-f22-var.ts:6:9',
        '--no-cache', '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const after = await fixture.readFile('src/interface-prop-shorthand-f22-var.ts');
    // interface property 名稱應維持 foo 不變（本次 rename 目標是本地變數，非 property）
    expect(after).toContain('foo: string;');
    expect(after).toContain('return { foo: bar };');
    expect(after).not.toContain('return { bar: foo };');
  });
});
