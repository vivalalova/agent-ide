/**
 * PR #61 第二輪 review 缺陷 T3（reproduction，先紅後綠）
 *
 * file-change-preparer.ts:402/528/683 用字面 specifier 比對判斷目標檔是否
 * 已有需要的 import。目標檔既有 `from './t3-source'`（無副檔名）而新產生的
 * import 用 `'./t3-source.js'`，兩者等價卻被判為不同，於是目標檔多出一條
 * 重複的 helper import（duplicate binding，編譯失敗）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（T3：等價 specifier 判重失效）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[錯誤重現點] 目標檔已有等價 import 時不得再插入重複 binding', async () => {
    await fixture.writeFile('src/t3-source.ts', `export function helper(): number {
  return 1;
}

export function movedMember(): number {
  return helper() + 1;
}
`);
    await fixture.writeFile('src/t3-target.ts', `import { helper } from './t3-source';

export const base = helper();
`);

    // movedMember 宣告在第 5 行
    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/t3-source.ts')}:5`,
        fixture.getFilePath('src/t3-target.ts'),
        '-p',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const target = await fixture.readFile('src/t3-target.ts');

    // 錯誤重現點：目標檔出現第二條 helper import（duplicate binding）
    const helperImportCount = target
      .split('\n')
      .filter((line) => /^\s*import\s*\{[^}]*\bhelper\b[^}]*\}\s*from\s*['"]\.\/t3-source(\.js)?['"];?\s*$/.test(line))
      .length;

    expect(helperImportCount).toBe(1);
  });

  it('[錯誤重現點] 來源檔為 index.ts 時目錄式 import 應視為等價、不得重複插入', async () => {
    await fixture.writeFile('src/t3b-foo/index.ts', `export function helper(): number {
  return 1;
}

export function movedMember(): number {
  return helper() + 1;
}
`);
    await fixture.writeFile('src/t3b-target.ts', `import { helper } from './t3b-foo';

export const base = helper();
`);

    // movedMember 宣告在第 5 行
    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/t3b-foo/index.ts')}:5`,
        fixture.getFilePath('src/t3b-target.ts'),
        '-p',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const target = await fixture.readFile('src/t3b-target.ts');

    // 錯誤重現點：'./t3b-foo' 與 './t3b-foo/index.js' 指向同一模組，卻各插入一條 helper import
    const helperImportCount = target
      .split('\n')
      .filter((line) => /^\s*import\s*\{[^}]*\bhelper\b[^}]*\}\s*from\s*['"][^'"]*t3b-foo(\/index(\.js)?)?['"];?\s*$/.test(line))
      .length;

    expect(helperImportCount).toBe(1);
  });

  it('[錯誤重現點] foo.ts 與 foo/index.ts 並存的歧義佈局下，指向不同檔案的 specifier 不得被判為等價而吞掉 import', async () => {
    // 歧義佈局：./t3c-foo 解析到 t3c-foo.ts（不是 t3c-foo/index.ts）
    await fixture.writeFile('src/t3c-foo.ts', `export function helper(): number {
  return 1;
}
`);
    await fixture.writeFile('src/t3c-foo/index.ts', `export function helper(): number {
  return 2;
}
`);
    await fixture.writeFile('src/t3c-bar.ts', `import { helper } from './t3c-foo';

export function movedMember(): number {
  return helper() + 100;
}
`);
    await fixture.writeFile('src/t3c-target.ts', `import { helper } from './t3c-foo/index.js';

export const base = helper();
`);

    // movedMember 宣告在第 3 行
    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/t3c-bar.ts')}:3`,
        fixture.getFilePath('src/t3c-target.ts'),
        '-p',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const target = await fixture.readFile('src/t3c-target.ts');

    // 錯誤重現點：'./t3c-foo'（→ t3c-foo.ts）與 './t3c-foo/index.js'（→ t3c-foo/index.ts）
    // 是兩個不同模組，判重合併會讓移進來的 movedMember 靜默綁到錯的 helper。
    // 契約只釘「指向 t3c-foo.ts 的 helper import 有被插入」，不斷言可編譯
    // （同名雙 import 造成的 TS2300 是可接受的響亮失敗）。
    const nonIndexHelperImportCount = target
      .split('\n')
      .filter((line) =>
        /^\s*import\s*\{[^}]*\bhelper\b[^}]*\}\s*from\s*['"]\.\/t3c-foo(\.js)?['"];?\s*$/.test(line)
      ).length;

    expect(nonIndexHelperImportCount).toBeGreaterThanOrEqual(1);
  });
});
