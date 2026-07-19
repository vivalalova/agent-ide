/**
 * P2 — find-references 對 CJS require 解構誤把「不同模組、同名 helper」的區域綁定
 * 也算成同一符號的引用（reproduction，先紅後綠）
 *
 * `src/plugins/typescript/lexical-scope-binding.ts` 的 `isImportBindingName` 只要看到
 * `const { helper } = require(...)` 解構就一律視為 import-equivalent binding（非遮蔽），
 * 完全沒比對 require 的來源模組路徑。因此當同一檔案內某函式局部又用
 * `const { helper } = require('./moduleB')` 解構出「同名但不同模組」的 helper 時，
 * 這個區域綁定不會被判定為遮蔽外層對 `./moduleA` 的 helper 引用，導致從 moduleA 的
 * 定義處查詢 find-references 時，誤把 moduleB 區域 require 那行與該函式內的
 * `helper()` 呼叫也算成 moduleA helper 的引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷：不同模組同名 require 解構誤判為同一符號引用', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  beforeEach(async () => {
    await fixture.writeFile(
      'src/moduleA.js',
      [
        'function helper(x) {',
        '  return x * 1;',
        '}',
        '',
        'module.exports = { helper };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/moduleB.js',
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
      'src/main.js',
      [
        'const { helper } = require(\'./moduleA\');',
        '',
        'function useTopLevelHelper() {',
        '  return helper();',
        '}',
        '',
        'function useModuleBHelper() {',
        '  const { helper } = require(\'./moduleB\');',
        '  return helper();',
        '}',
        ''
      ].join('\n')
    );
  });

  it('從 moduleA 定義處查詢不應包含 useModuleBHelper 內指向 moduleB 的區域 require 與呼叫', async () => {
    const result = await executeCLI(
      [
        'find-references', 'helper',
        '--path', fixture.rootPath,
        '--at', 'src/moduleA.js:1:10',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const mainRefLines: number[] = output.references
      .filter((ref: { file: string }) => ref.file.includes('main.js'))
      .map((ref: { line: number }) => ref.line);

    // Bug：目前誤把 useModuleBHelper 內的 moduleB 區域 require（第 8 行）與其
    // helper() 呼叫（第 9 行）也算成 moduleA helper 的引用
    expect(mainRefLines).not.toContain(8);
    expect(mainRefLines).not.toContain(9);

    // 防修過頭：頂層 require 解構（第 1 行）與 useTopLevelHelper 的呼叫（第 4 行）
    // 是真引用，必須保留
    expect(mainRefLines).toContain(1);
    expect(mainRefLines).toContain(4);
  });

  // 對照組（--at moduleB 區域 require 位置定位 moduleB 專屬引用）現況實跑後同樣是紅：
  // symbol finder 對 src/main.js:8:11 解析出的 targetSymbol 與 references 和查詢
  // moduleA 定義處完全相同（仍指向 moduleA:1:10 與同一組 6 筆引用），代表這條路徑
  // 自身也受同一缺陷影響、並非可作為綠燈對照的獨立行為，故不寫成對照測試。
});
