/**
 * PR #61 第二輪 review 缺陷 T3（跨目錄 specifier，reproduction，先紅後綠）
 *
 * move-member 跨目錄搬移時，成員的外部依賴 import 沿用「來源檔語境」的字面
 * specifier（file-change-preparer.ts addNeeded 呼叫處），不以目標檔為基準重算。
 * `src/dirA/source.ts` 的 `import { helper } from './helpers.js'` 搬到
 * `src/dirB/target.ts` 後仍寫 `./helpers.js`；而目標目錄剛好有同名
 * `src/dirB/helpers.ts` 且 target 已 import 它 → 錯誤字面在目標語境解析命中
 * 該檔 → 判重誤判「已有」→ 靜默跳過插入，搬進來的成員綁到錯的模組
 * （值錯、無編譯錯）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（跨目錄外部依賴 specifier 未以目標檔重算）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[錯誤重現點] 跨目錄搬移後目標檔必須含指向 dirA/helpers 的 import', async () => {
    await fixture.writeFile('src/dirA/helpers.ts', `export function helper(): string {
  return 'dirA-helper';
}
`);
    // useHelper 宣告在第 3 行
    await fixture.writeFile('src/dirA/source.ts', `import { helper } from './helpers.js';

export function useHelper(): string {
  return helper();
}
`);
    await fixture.writeFile('src/dirB/helpers.ts', `export function helper(): string {
  return 'dirB-helper';
}
`);
    await fixture.writeFile('src/dirB/target.ts', `import { helper } from './helpers';

export const targetBase = helper();
`);

    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/dirA/source.ts')}:3`,
        fixture.getFilePath('src/dirB/target.ts'),
        '-p',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const target = await fixture.readFile('src/dirB/target.ts');

    // 契約核心：dirA/helpers 這個來源必須出現在 target 的 import 中
    // （alias 化解同名衝突也算合法，故只釘模組來源、不釘 binding 名）
    const dirAImportLines = target
      .split('\n')
      .filter((line) => /^\s*import\s.*from\s*['"][^'"]*dirA\/helpers(\.js)?['"];?\s*$/.test(line));

    expect(dirAImportLines.length).toBeGreaterThanOrEqual(1);

    // 原本 dirB 自己的 './helpers' import 仍須保留
    expect(target).toMatch(/from\s*['"]\.\/helpers(\.js)?['"]/);

    // 來源語境字面滲漏：不得新增一條 `from './helpers.js'`
    const localHelpersImportCount = target
      .split('\n')
      .filter((line) => /^\s*import\s.*from\s*['"]\.\/helpers(\.js)?['"];?\s*$/.test(line)).length;

    expect(localHelpersImportCount).toBe(1);
  });
});
