/**
 * CLI move 命令 E2E 測試 - 多行與同行多筆呼叫系列（C10/P2-2/P3-1/P3-4/P2-CAP）
 *
 * 由 cli-move-import-rewrite-bugs.e2e.test.ts 依主題拆分（行為不變，內容逐字搬移）。
 *
 * C10: 多行 require() 與 dynamic import() 沒有被解析，move 後仍殘留舊 module specifier。
 * P2-2: 同一行兩筆 require()/import() 呼叫指向同一個被移動檔案時，
 *       pushSingleLineCallStatements 用整行當 rawStatement、行首縮排當 column，
 *       path-calculator.ts 的去重鍵只看 filePath:line:oldImport 導致碰撞，只有第一筆被更新，
 *       第二筆殘留舊 specifier。
 * P3-1: 多行 ES6 import 中間行含 `// } from './decoy.js'` 形狀的註解時，
 *       collectMultilineImportStatement 的完整性判斷（isCompleteImportStatement）未接遮罩，
 *       誤判 import 語句在中間行就已結束，導致真正的 from 子句完全沒被解析與更新。
 * P3-4: 多行 ES6 import 的起始行前方有含 'import' 字樣的字串字面值時，
 *       import-resolver.ts:117 用「未遮罩」原文的 `lines[startLineIndex].indexOf('import')`
 *       取 column，會命中字串字面值裡的 'import' 而非真正的 import 關鍵字，算出的 column
 *       指向錯誤位置。move-engine.ts:309-310 的 findPathUpdateStartOffset 用這個錯誤 column
 *       定位後以 content.startsWith(oldImport, startOffset) 驗證，驗證失敗回傳 -1，
 *       createPathUpdateTextEdit 因而拋出「找不到 import 語句」，導致整個 move 操作失敗。
 * P2-CAP（尚未修復）: src/core/move/statement-collector.ts:147-150
 *       collectMultilineExportStatement 的多行續行 cap 只有 10 行（同檔 import/require
 *       分支的 collectMultilineImportStatement／collectMultilineCallStatement cap 都是
 *       200，見同檔 :98、:187），超過 10 行的多行具名 re-export（如一行一個具名匯出項目、
 *       總項目數較多的 barrel 檔）在完整形狀 EXPORT_FROM_COMPLETE_PATTERN 尚未湊齊前就先撞
 *       cap break，函式回傳 null，真正的 from 子句完全沒被解析、更新。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 多行 require/dynamic import 未更新 (C10)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，多行 require() 與 dynamic import() 的 module specifier 應被更新', async () => {
    await fixture.writeFile('src/old.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/multiline-loader.ts',
      `const dynamicValue = import(
  './old.js'
);
const requireValue = require(
  './old.js'
);
export { dynamicValue, requireValue };
`
    );

    const result = await executeCLI(
      ['move', 'src/old.ts', 'src/fresh.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const loaderContent = await fixture.readFile('src/multiline-loader.ts');
    expect(loaderContent).toContain('\'./fresh.js\'');
    expect(loaderContent).not.toContain('\'./old.js\'');
  });
});

describe('CLI move - 同一行兩筆呼叫指向同一被移動檔案時只更新第一筆 (P2-2)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，同一行兩筆 require() 指向同一被移動檔案時，兩筆 specifier 都應更新', async () => {
    await fixture.writeFile('src/x.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/dup-require.ts',
      'const a = require(\'./x.js\'); const b = require(\'./x.js\');\nexport { a, b };\n'
    );

    const result = await executeCLI(
      ['move', 'src/x.ts', 'src/y.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/dup-require.ts');

    // 錯誤重現點：path-calculator.ts 的去重鍵（filePath:line:oldImport）在同一行兩筆
    // 相同 oldImport 時碰撞，只有第一筆被當作有效更新，第二筆殘留舊 specifier './x.js'
    expect(content).not.toContain('./x.js');
    expect(content.match(/\.\/y\.js/g)?.length).toBe(2);
  });

  it('move 後，同一行兩筆 dynamic import() 指向同一被移動檔案時，兩筆 specifier 都應更新', async () => {
    await fixture.writeFile('src/x.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/dup-import.ts',
      'const a = import(\'./x.js\'); const b = import(\'./x.js\');\nexport { a, b };\n'
    );

    const result = await executeCLI(
      ['move', 'src/x.ts', 'src/y.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/dup-import.ts');

    // 錯誤重現點同上（require 版本）
    expect(content).not.toContain('./x.js');
    expect(content.match(/\.\/y\.js/g)?.length).toBe(2);
  });
});

describe('CLI move - 多行 ES6 import 中間行含 decoy 註解時 span 切錯 (P3-1)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，多行 import 中間行含 `// } from \'./decoy.js\'` 形狀的註解時，真正的 from 子句應更新、註解應保持原樣', async () => {
    await fixture.writeFile(
      'src/real.ts',
      'export const value = 1;\nexport const other = 2;\n'
    );
    await fixture.writeFile(
      'src/decoy-comment-import.ts',
      `import {
  value, // } from './decoy.js'
  other
} from './real.js';

export const use = value + other;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/decoy-comment-import.ts');

    // 錯誤重現點：collectMultilineImportStatement 的完整性判斷未接遮罩，誤判中間行
    // `// } from './decoy.js'` 就是這個 import 語句真正的結尾，導致真正的
    // `from './real.js'` 完全沒被解析、也沒被更新
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 中間行的 decoy 註解應保持原樣
    expect(content).toContain('// } from \'./decoy.js\'');
  });
});

describe('CLI move - 多行 import 起始行前方字串含 import 字樣時 column 誤標 (P3-4)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，起始行前方字串字面值含 import 字樣的多行 import 應正確更新路徑', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/string-prefix-import.ts',
      `const s = "no import here"; import {
  value
} from './real.js';
export const use = value + s.length;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    // 錯誤重現點：indexOf('import') 對未遮罩原文取值，命中字串字面值
    // "no import here" 裡的 'import'，算出的 column 指向錯誤位置，導致
    // findPathUpdateStartOffset 驗證失敗、createPathUpdateTextEdit 拋出
    // 「找不到 import 語句」，move 操作整體失敗（exitCode 非 0）
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/string-prefix-import.ts');
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 字串字面值內容應保持原樣
    expect(content).toContain('"no import here"');
  });
});

/**
 * 超過 10 行 cap 的多行具名 re-export 永不解析（P2-CAP，見檔頭說明，尚未修復）。
 * collectMultilineExportStatement（statement-collector.ts:147-150）的續行 cap 只有
 * 10 行，同檔 import/require 分支的 cap 都是 200；一行一個具名匯出項目、項目數較多的
 * barrel 檔在完整形狀湊齊前就先撞 cap break，函式回傳 null，真正的 from 子句完全
 * 沒被解析、更新。
 */
describe('CLI move - 超過 10 行 cap 的多行具名 re-export 未被解析 (P2-CAP)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，超過 10 行 cap 的多行具名 re-export 路徑應被更新', async () => {
    await fixture.writeFile(
      'src/real.ts',
      Array.from({ length: 12 }, (_, idx) => `export const ${String.fromCharCode(65 + idx)} = ${idx + 1};`).join('\n') + '\n'
    );
    const names = Array.from({ length: 12 }, (_, idx) => String.fromCharCode(65 + idx));
    await fixture.writeFile(
      'src/barrel.ts',
      `export {\n${names.map(n => `  ${n},`).join('\n')}\n} from './real.js';\n`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/barrel.ts');

    // 錯誤重現點：起始行 `export {` 到收尾行 `} from './real.js';` 之間跨越 12 個
    // 具名匯出項目行，累計行數超過 10 行 cap，尚未湊齊完整形狀就先 break，
    // collectMultilineExportStatement 回傳 null，這個 re-export 完全沒被解析、更新
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
  });
});
