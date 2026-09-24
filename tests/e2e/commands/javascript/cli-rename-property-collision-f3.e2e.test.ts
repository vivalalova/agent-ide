/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * F3：JS 專案 rename 函式時誤改無關物件的同名屬性存取
 *
 * JS 沒有型別資訊，reference-finder／rename 對識別字的比對容易在缺乏 binding
 * 解析時退化為同名文字比對，把 object literal 的屬性鍵（`{ helper: 1 }`）與
 * 屬性存取（`cfg.helper`）誤當成對函式 `helper` 的引用一併改名，即使它們是完
 * 全無關的物件屬性。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 F3：JS 同名物件屬性誤改', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[F3] rename 匯入的函式時不應誤改無關物件的同名屬性鍵與屬性存取', async () => {
    await fixture.writeFile(
      'src/lib-f3.js',
      [
        'export function helperF3() {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/index-f3.js',
      [
        'import { helperF3 } from \'./lib-f3.js\';',
        '',
        'const cfgF3 = { helperF3: 1 };',
        'console.log(cfgF3.helperF3);',
        'console.log(helperF3());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helperF3', '--to', 'h2F3',
        '--at', 'src/lib-f3.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const indexContent = await fixture.readFile('src/index-f3.js');

    // import 與函式呼叫點必須改名
    expect(indexContent).toContain('import { h2F3 } from \'./lib-f3.js\';');
    expect(indexContent).toContain('console.log(h2F3());');

    // 無關物件的屬性鍵與屬性存取必須維持原樣，不可被誤改
    expect(indexContent).toContain('const cfgF3 = { helperF3: 1 };');
    expect(indexContent).toContain('console.log(cfgF3.helperF3);');
  });

  it('[F3] 同檔無 import 時，rename 函式不應誤改同檔內無關物件的同名屬性鍵與屬性存取', async () => {
    await fixture.writeFile(
      'src/single-f3.js',
      [
        'export function helper() {',
        '  return 1;',
        '}',
        'const cfg = { helper: () => 2 };',
        'console.log(cfg.helper());',
        'console.log(helper());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'renamed',
        '--at', 'src/single-f3.js:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/single-f3.js');

    // 無關物件的屬性鍵與屬性存取必須維持原樣
    expect(content).toContain('const cfg = { helper: () => 2 };');
    expect(content).toContain('console.log(cfg.helper());');

    // 函式定義與呼叫點必須改名
    expect(content).toContain('function renamed()');
    expect(content).toContain('console.log(renamed());');
  });

  it('[F3-ns] rename 無關同名函式時不應誤改其他模組透過 namespace import／require 對另一個同名函式的存取', async () => {
    await fixture.writeFile(
      'src/lib-f3ns.js',
      [
        'export function helper() {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/unrelated-f3ns.js',
      [
        'export function helper() {',
        '  return 2;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/ns-f3ns.js',
      [
        'import * as ns from \'./lib-f3ns.js\';',
        'console.log(ns.helper());',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/req-f3ns.js',
      [
        'const lib = require(\'./lib-f3ns.js\');',
        'lib.helper();',
        ''
      ].join('\n')
    );

    // rename 無關模組 unrelated-f3ns.js 的 helper：ns.js／req.js 對 lib-f3ns.js 的存取不應被改
    const resultUnrelated = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'h2',
        '--at', 'src/unrelated-f3ns.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );
    expect(resultUnrelated.exitCode).toBe(0);
    expect(JSON.parse(resultUnrelated.stdout).success).toBe(true);

    const nsContentAfterUnrelated = await fixture.readFile('src/ns-f3ns.js');
    const reqContentAfterUnrelated = await fixture.readFile('src/req-f3ns.js');
    expect(nsContentAfterUnrelated).toContain('console.log(ns.helper());');
    expect(reqContentAfterUnrelated).toContain('lib.helper();');

    // 對照：rename lib-f3ns.js 的 helper 才應改到 ns.js 的 namespace 存取
    const resultLib = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'h2',
        '--at', 'src/lib-f3ns.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );
    expect(resultLib.exitCode).toBe(0);
    expect(JSON.parse(resultLib.stdout).success).toBe(true);

    const nsContentAfterLib = await fixture.readFile('src/ns-f3ns.js');
    expect(nsContentAfterLib).toContain('console.log(ns.h2());');
    expect(nsContentAfterLib).not.toContain('ns.helper()');
  });

  it('[F3-destructure] rename 函式時不應誤改物件解構出的同名屬性 binding 與其呼叫點', async () => {
    await fixture.writeFile(
      'src/dstr-f3.js',
      [
        'export function helper() {',
        '  return 1;',
        '}',
        'const cfg = { helper: () => \'y\' };',
        'const { helper: h2 } = cfg;',
        'console.log(h2(), helper());',
        'function g() {',
        '  const { helper } = cfg;',
        '  return helper();',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'renamedHelper',
        '--at', 'src/dstr-f3.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const content = await fixture.readFile('src/dstr-f3.js');

    // 解構出的別名 binding 與 shorthand binding 皆是無關的物件屬性存取，不可被誤改
    expect(content).toContain('const cfg = { helper: () => \'y\' };');
    expect(content).toContain('const { helper: h2 } = cfg;');
    expect(content).toContain('const { helper } = cfg;');
    expect(content).toContain('return helper();');

    // 頂層函式定義與直接呼叫點必須改名
    expect(content).toContain('function renamedHelper()');
    expect(content).toContain('console.log(h2(), renamedHelper());');
  });

  it('[F3-ns-default] rename 具名匯出時不應誤改另一檔透過 default export 物件存取的同名屬性', async () => {
    await fixture.writeFile(
      'src/mod-f3.js',
      [
        'export function helper() {',
        '  return 1;',
        '}',
        'export default { helper: () => \'unrelated\' };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/consumer-f3.js',
      [
        'import def from \'./mod-f3.js\';',
        'import { helper } from \'./mod-f3.js\';',
        'console.log(def.helper());',
        'console.log(helper());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'renamedHelper',
        '--at', 'src/mod-f3.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const consumerContent = await fixture.readFile('src/consumer-f3.js');

    // default export 物件的同名屬性存取是無關屬性，不可被誤改
    expect(consumerContent).toContain('console.log(def.helper());');

    // 具名匯出的 import 與呼叫點必須改名
    expect(consumerContent).toContain('import { renamedHelper } from \'./mod-f3.js\';');
    expect(consumerContent).toContain('console.log(renamedHelper());');
  });
});
