/**
 * P2 — CJS 多筆 edit 同行時，rename dry-run 預覽與實際 apply 結果分歧（reproduction，先紅後綠）
 *
 * `changeset-converter.ts` 的 `applyEditsToLine`（:87-99）在同一行有多筆 edit 時，
 * 用原始（rename 前）的 column 依序對同一份 string 做 substring 替換，未在套用後
 * 重新校正後續 edit 的 offset。當 CJS `require` 解構式（`const { helper } = require(...)`）
 * 同一行同時命中「解構 binding」與其他 edit 座標重疊時，這個未重校 offset 的替換順序
 * 會把新名稱疊加套用兩次，產生 `doubleItIt` 這種損壞文字；但 `ChangeApplicator` 實際落盤
 * 走的是另一條套用路徑，寫入結果是正確的 `doubleIt`——導致 dry-run 預覽騙人，與實際結果不一致。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename dry-run 缺陷：CJS 多筆 edit 同行預覽損壞', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('dry-run diff 預覽不得出現重複疊加的 doubleItIt，宣告行應為 doubleIt', async () => {
    await fixture.writeFile(
      'src/util-preview-bug.js',
      [
        'function helper(x) {',
        '  return x * 2;',
        '}',
        '',
        'module.exports = { helper };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/main-preview-bug.js',
      [
        'const { helper } = require(\'./util-preview-bug\');',
        '',
        'console.log(helper(5));',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'doubleIt',
        '--at', 'src/util-preview-bug.js:1:10',
        '--dry-run', '--format', 'diff'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    // Bug：預覽把 require 解構 binding 的新名稱疊加套用兩次
    expect(result.stdout).not.toContain('doubleItIt');
    expect(result.stdout).toContain('const { doubleIt } = require(\'./util-preview-bug\');');

    // 對照：dry-run 不寫入檔案，原始內容維持不變
    const mainContentAfterDryRun = await fixture.readFile('src/main-preview-bug.js');
    expect(mainContentAfterDryRun).toContain('const { helper } = require(\'./util-preview-bug\');');
  });

  it('實際 apply（非 dry-run）落盤結果應為正確的 doubleIt，證明預覽與實寫分歧', async () => {
    await fixture.writeFile(
      'src/util-preview-bug2.js',
      [
        'function helper(x) {',
        '  return x * 2;',
        '}',
        '',
        'module.exports = { helper };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/main-preview-bug2.js',
      [
        'const { helper } = require(\'./util-preview-bug2\');',
        '',
        'console.log(helper(5));',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'doubleIt',
        '--at', 'src/util-preview-bug2.js:1:10',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const mainContent = await fixture.readFile('src/main-preview-bug2.js');
    expect(mainContent).toContain('const { doubleIt } = require(\'./util-preview-bug2\');');
    expect(mainContent).not.toContain('doubleItIt');
    expect(mainContent).toContain('console.log(doubleIt(5));');
  });
});
