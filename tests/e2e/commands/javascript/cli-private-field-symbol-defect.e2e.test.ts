/**
 * CLI 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * 缺陷：ES2022 私有欄位（`#secret`）完全不被 JS/Babel symbol extractor 收錄
 * （src/plugins/javascript/types.ts 的 isSymbolDeclaration 不含
 * ClassPrivateProperty/ClassPrivateMethod、getNodeName 的 key 分支不認
 * babel.PrivateName；src/plugins/javascript/parser.ts 的 extractSymbols
 * 未註冊 ClassPrivateProperty/ClassPrivateMethod traverse 分支）。
 *
 * 對齊 TS 側同型缺陷（tests/e2e/commands/typescript/cli-private-field-symbol-defect.e2e.test.ts）。
 *
 * 影響：
 * - search 找不到私有欄位（0 筆結果）
 * - find-references 找不到定義與使用處
 * - rename --at 指到私有欄位宣告行會報「找不到符號」
 *
 * 對照組：一般 class 欄位（非 `#` 語法）現行可正常索引，
 * 用來確認本測試只鎖定 `#` 私有欄位語法，不影響既有欄位支援。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

const BOX_SOURCE = [
  'class Box {',
  '  #secret = 1;',
  '  reveal() {',
  '    return this.#secret;',
  '  }',
  '}',
  '',
  'module.exports = Box;',
  ''
].join('\n');

describe('CLI 私有欄位（#secret）JS/Babel symbol extractor 缺陷 regression', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
    await fixture.writeFile('src/box.js', BOX_SOURCE);
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('search 應找到私有欄位 #secret 的宣告', async () => {
    const result = await executeCLI(
      ['search', 'secret', '--path', fixture.rootPath, '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // Bug：目前 results 為空陣列，#secret 完全未被索引
    const boxResults = output.results.filter((r: any) => r.filePath.endsWith('box.js'));
    expect(boxResults.length).toBeGreaterThan(0);
    expect(boxResults.some((r: any) => r.line === 2)).toBe(true);
  });

  it('find-references 應回傳 #secret 的宣告與 this.#secret 使用處', async () => {
    const result = await executeCLI(
      ['find-references', 'secret', '--path', fixture.rootPath, '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // Bug：目前 definition 為 null、references 為空陣列
    expect(output.definition).not.toBeNull();
    expect(output.definition.file).toContain('box.js');
    expect(output.definition.line).toBe(2);

    const boxReferences = output.references.filter((r: any) => r.file.endsWith('box.js'));
    expect(boxReferences.some((r: any) => r.line === 4)).toBe(true);
  });

  it('rename #secret -> #hidden 應同步改宣告與使用處並產出合法 JS', async () => {
    const result = await executeCLI(
      [
        'rename',
        '--path', fixture.rootPath,
        '--from', 'secret',
        '--to', 'hidden',
        '--at', 'src/box.js:2:3',
        '--no-cache',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // Bug：目前因「找不到符號 "secret"」報錯，exitCode 為 1
    expect(result.exitCode).toBe(0);

    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const afterContent = await fixture.readFile('src/box.js');

    // 宣告與使用處都應同步改名，且仍保留 `#` 私有欄位語法（合法 JS）
    expect(afterContent).toContain('#hidden = 1;');
    expect(afterContent).toContain('return this.#hidden;');
    expect(afterContent).not.toContain('#secret');
  });

  it('對照組：一般 class 欄位（非 # 語法）現行可正常索引（防退化）', async () => {
    await fixture.writeFile('src/normal-box.js', [
      'class NormalBox {',
      '  normalSecret = 1;',
      '  reveal() {',
      '    return this.normalSecret;',
      '  }',
      '}',
      '',
      'module.exports = NormalBox;',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['search', 'normalSecret', '--path', fixture.rootPath, '--no-cache', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const results = output.results.filter((r: any) => r.filePath.endsWith('normal-box.js'));
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r: any) => r.line === 2)).toBe(true);
  });

  it('rename #secret -> #hidden 不應誤改其他檔案同名但無關的 .secret 屬性存取／欄位', async () => {
    const OTHER_SOURCE = [
      'function readConfig(cfg) {',
      '  return cfg.secret + 1;',
      '}',
      '',
      'const data = { secret: 42 };',
      '',
      'module.exports = { readConfig, data };',
      ''
    ].join('\n');

    await fixture.writeFile('src/other.js', OTHER_SOURCE);

    const result = await executeCLI(
      [
        'rename',
        '--path', fixture.rootPath,
        '--from', 'secret',
        '--to', 'hidden',
        '--at', 'src/box.js:2:3',
        '--no-cache',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const boxAfter = await fixture.readFile('src/box.js');
    expect(boxAfter).toContain('#hidden = 1;');
    expect(boxAfter).toContain('return this.#hidden;');
    expect(boxAfter).not.toContain('#secret');

    // Bug（同 TS 側同型缺陷）：跨檔 rename 誤改了 other.js 內完全無關的
    // `.secret` 屬性存取／欄位，與 Box 的私有欄位 #secret 毫無關聯
    const otherAfter = await fixture.readFile('src/other.js');
    expect(otherAfter).toBe(OTHER_SOURCE);
  });
});
