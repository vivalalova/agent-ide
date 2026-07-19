/**
 * P2 — find-references 對 CJS require 解構匯入漏抓跨檔引用（reproduction，先紅後綠）
 *
 * consumer 以 `const { helper } = require('./util')` 解構匯入並呼叫時，find-references
 * 從匯出端（定義處）查詢應同時回傳 consumer 的解構 binding 與呼叫點引用；目前 CJS
 * require 路徑漏追，只回傳定義檔自身的 2 筆（定義 + module.exports 引用），totalReferences
 * 應 >=3、filesAffected 應為 2 卻分別回傳 2 與 1。從使用端以 `--at` 定位呼叫點座標時更直接
 * 回報「找不到符號」，完全無法查詢。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷：CJS require 解構匯入漏抓引用', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  async function writeCjsFixture(suffix: string): Promise<void> {
    await fixture.writeFile(
      `src/util-cjs-refs-${suffix}.js`,
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
      `src/main-cjs-refs-${suffix}.js`,
      [
        `const { helper } = require('./util-cjs-refs-${suffix}');`,
        '',
        'console.log(helper(5));',
        ''
      ].join('\n')
    );
  }

  it('從匯出端（定義處）查詢應包含 main.js 的 require 解構與呼叫點引用', async () => {
    await writeCjsFixture('a');

    const result = await executeCLI(
      [
        'find-references', 'helper',
        '--path', fixture.rootPath,
        '--at', 'src/util-cjs-refs-a.js:1:10',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const referenceFiles: string[] = output.references.map((ref: { file: string }) => ref.file);

    // Bug：目前只回傳 util 自身的 2 筆（定義 + module.exports），main.js 完全漏抓
    expect(referenceFiles.some((file) => file.includes('main-cjs-refs-a.js'))).toBe(true);
    expect(output.summary.totalReferences).toBeGreaterThanOrEqual(3);
    expect(output.summary.filesAffected).toBe(2);
  });

  it('從使用端以 --at 定位呼叫點應成功查到符號，而非報找不到', async () => {
    await writeCjsFixture('b');

    const result = await executeCLI(
      [
        'find-references', 'helper',
        '--path', fixture.rootPath,
        '--at', 'src/main-cjs-refs-b.js:3:13',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // Bug：目前使用端呼叫點座標定位直接回報「找不到符號」
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.targetSymbol).toBeDefined();
  });

  it('ESM 對照組：export/import 跨檔引用應完整回傳（現行應為綠燈）', async () => {
    await fixture.writeFile(
      'src/util-esm-refs.js',
      [
        'export function helperEsm(x) {',
        '  return x * 2;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/main-esm-refs.js',
      [
        'import { helperEsm } from \'./util-esm-refs.js\';',
        '',
        'console.log(helperEsm(5));',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references', 'helperEsm',
        '--path', fixture.rootPath,
        '--at', 'src/util-esm-refs.js:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const referenceFiles: string[] = output.references.map((ref: { file: string }) => ref.file);
    expect(referenceFiles.some((file) => file.includes('main-esm-refs.js'))).toBe(true);
    expect(output.summary.filesAffected).toBe(2);
  });
});
