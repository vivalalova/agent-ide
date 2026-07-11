/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * 缺陷 1：target 帶 target:line 格式，且該行落在目標檔 import 區內時，
 * 目標檔既有 import 行會被複製一份，且被移動成員未插在指定位置。
 *
 * 缺陷 2：成員移動後，跨檔引用更新會丟棄來源 import 明確指定的 .js 副檔名。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('缺陷1：target:line 落在 import 區內時，import 行不應被複製，且成員需插入指定位置', async () => {
    await fixture.writeFile('src/util.ts', `export function helperUtil(): number { return 1; }
`);

    await fixture.writeFile('src/a.ts', `export function existingA(): void {}
`);

    await fixture.writeFile('src/b.ts', `export function existingB(): void {}
`);

    await fixture.writeFile('src/source.ts', `import { helperUtil } from './util';

export function moved(): number {
  return helperUtil();
}
export function kept(): number { return 2; }
`);

    await fixture.writeFile('src/target.ts', `import { existingA } from './a';
import { existingB } from './b';

export function existing(): void {}
`);

    // moved 函式在 source.ts 第 3 行；target.ts 第 1 行落在 import 區內
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source.ts')}:3`, `${fixture.getFilePath('src/target.ts')}:1`,
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/target.ts'), 'utf-8') as string;

    // 既有 import 不得被複製
    const existingAImportLines = targetContent.split('\n').filter(l => /^import \{ existingA \}/.test(l.trim()));
    const existingBImportLines = targetContent.split('\n').filter(l => /^import \{ existingB \}/.test(l.trim()));
    expect(existingAImportLines.length).toBe(1);
    expect(existingBImportLines.length).toBe(1);

    // 被移動成員需要的 helperUtil import 也只能出現一次
    const helperUtilImportLines = targetContent.split('\n').filter(l => /helperUtil/.test(l) && /^import/.test(l.trim()));
    expect(helperUtilImportLines.length).toBe(1);

    // 內容不得整份重複
    expect(targetContent).not.toContain('import { existingB } from \'./b\';\nimport { existingB } from \'./b\';');

    // 被移動的函式與原本存在的函式都應保留
    expect(targetContent).toContain('function moved');
    expect(targetContent).toContain('function existing');
  });

  it('缺陷2：跨檔引用更新不得丟棄來源 import 明確指定的 .js 副檔名', async () => {
    await fixture.writeFile('src/source.ts', `export function moved(): number { return 1; }
`);

    await fixture.writeFile('src/dest.ts', `export function existing(): void {}
`);

    await fixture.writeFile('src/consumer.ts', `import { moved } from './source.js';
export const x = moved();
`);

    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source.ts')}:1`, fixture.getFilePath('src/dest.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8') as string;

    // 更新後的 import 必須保留 .js 副檔名，指向 dest.js
    expect(consumerContent).toContain('from \'./dest.js\'');
  });
});
