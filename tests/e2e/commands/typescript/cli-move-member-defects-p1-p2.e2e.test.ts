/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * P1（靜默刪碼）：import-export-statement.ts 的 collectImportExportStatement
 *     多行收集只以 from 子句/分號終止、無大括號結構邊界。消費檔為 ASI
 *     無分號風格時，`export class Foo { ... }`（class body 內無分號）會被
 *     誤判為未結束的 import/export 語句，一路吸收到後面某行的
 *     `export { moved, other } from './source-file'` 才終止（跨語句融合）。
 *     多成員 re-export 會走「重建語句」分支（捨棄原始 text），導致整段
 *     被吸收進去的 class body 隨之被覆蓋刪除。單成員 re-export 因走
 *     path-only 的 replaceImportPath 分支（保留原始 text 僅替換路徑）
 *     不會觸發刪碼，故需多成員才能重現。
 *
 * P2：file-change-preparer.ts 的 findClassInsertPosition 對單行 class
 *     （`export class Svc { existing() {} }`）算出 insertLine=0，成員被
 *     插到 class 宣告之前、跑到 class 外。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（P1-P2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('P1：ASI 無分號消費檔的 class body 不得被跨語句融合誤刪', async () => {
    await fixture.writeFile('src/source-file.ts', `export function moved(): number { return 1; }
export function other(): number { return 2; }
`);

    await fixture.writeFile('src/target-file.ts', `export function existing(): void {}
`);

    // ASI 風格：class body 內完全無分號，僅在檔案後段有多成員 re-export
    await fixture.writeFile('src/consumer.ts', `export class Foo {
  bar() {
    return 1
  }

  baz() {
    return 2
  }
}

export { moved, other } from './source-file'
`);

    // moved 函式在 source-file.ts 第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/source-file.ts')}:1`, fixture.getFilePath('src/target-file.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const consumerContent = await fixture.memfs.readFile(fixture.getFilePath('src/consumer.ts'), 'utf-8') as string;

    // class Foo 的實作必須仍然存在，不得被誤判的跨語句融合整段刪除
    expect(consumerContent).toContain('class Foo');
    expect(consumerContent).toContain('bar()');
    expect(consumerContent).toContain('baz()');
  });

  it('P2：單行 class 的插入位置必須在大括號內，不得跑到 class 之前', async () => {
    await fixture.writeFile('src/user.ts', `export class User {
  name: string;

  validateEmail(email: string): boolean {
    return email.includes('@');
  }
}
`);

    // 目標 class 是單行（findClassInsertPosition 對單行 class 算出 insertLine=0）
    await fixture.writeFile('src/validator.ts', `export class Validator { existing(): boolean { return true; } }
`);

    // validateEmail 方法在 user.ts 第 4 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/user.ts')}:4`, fixture.getFilePath('src/validator.ts'),
        '--target-class', 'Validator', '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const validatorContent = await fixture.memfs.readFile(fixture.getFilePath('src/validator.ts'), 'utf-8') as string;

    // 被移動的成員宣告不得出現在 class 宣告之前（即不得被插到 class 外）
    const classIndex = validatorContent.indexOf('class Validator');
    expect(classIndex).toBeGreaterThanOrEqual(0);
    const beforeClass = validatorContent.slice(0, classIndex);
    expect(beforeClass).not.toContain('validateEmail');

    // 成員本體仍需存在（確認不是連同其他缺陷一起消失，而是位置錯誤）
    expect(validatorContent).toContain('validateEmail');
  });
});
