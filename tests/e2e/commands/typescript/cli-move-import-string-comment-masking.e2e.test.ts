/**
 * CLI move 命令 E2E 測試 - Import 字串/註解遮罩系列（C5/C9/P2-1/P2-B）
 *
 * 由 cli-move-import-rewrite-bugs.e2e.test.ts 依主題拆分（行為不變，內容逐字搬移）。
 *
 * C5: move 更新 import 路徑時，誤把字串字面值與行內註解中長得像 import 陳述式的文字也改掉，
 *     應該只更新真正的 import 陳述式，字串與註解內容要維持原樣。
 * C9: require() 與 dynamic import() 解析未遮罩字串及行內註解，move 會改寫文件範例或註解中的
 *     module specifier；這些內容不是實際的模組依賴，應保持原樣。
 * P2-1: 多行 require()/import() 呼叫，起始行行尾註解含完整形狀的假呼叫時，
 *       pushMultilineCallStatement 對未遮罩原文取第一個 regex 命中，抓到註解裡的假路徑，
 *       導致真正的 module specifier 完全沒被更新（import-resolver.ts:385-387）。
 * P2-B: 某行的 'import' 字樣只出現在字串字面值或行內註解中（遮罩後消失），且緊接的下一行
 *       才是真正指向被移動檔案的 import 陳述式時，collectMultilineImportStatement（見
 *       import-resolver.ts:295-320）僅檢查「起始行原文（未遮罩）是否包含 'import' 字樣」
 *       就把該行當成多行 import 的起點，於是把假陽性起始行與下一行的真 import 合併成同一個
 *       多行 span。import-resolver.ts:119-121 對此 span 的 columnIndex 改用
 *       `maskStringsAndComments(lines[startLineIndex]).indexOf('import')` 定位——遮罩後起始行
 *       的假 'import' 已消失，indexOf 回傳 -1，未 guard 直接送進 createImportStatement→
 *       createPosition(lineNumber, columnIndex + 1) = createPosition(lineNumber, 0)，
 *       因 column 必須 ≥ 1 而丟出「Column 必須大於等於 1」例外。
 *       實測驗證：此例外實際從 file-scanner.ts:183（findAffectedFiles 掃描哪些檔案引用了
 *       被移動路徑時呼叫 parseImportStatements，無 try/catch 包裹）未攔截逸出，直接讓整個
 *       move 指令以 `{"success":false,"error":"Column 必須大於等於 1"}`、exitCode 1 失敗
 *       （非原先預期的「exitCode 0 但靜默漏更新」——path-calculator.ts:229 的 per-file
 *       catch 只保護該檔案本身 import 更新的計算，不保護更早的引用掃描階段）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - import 路徑改寫誤傷字串與註解 (C5)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，字串字面值與行內註解中的 import 字樣應保持原樣，只更新真正的 import 陳述式', async () => {
    await fixture.writeFile('src/old.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/note.ts',
      `import { value } from './old.js';

export const docExample = "import { value } from './old.js'";
export const usage = value; // 參考 import { value } from './old.js' 的寫法
`
    );

    const result = await executeCLI(
      ['move', 'src/old.ts', 'src/fresh.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const noteContent = await fixture.readFile('src/note.ts');

    // 真正的 import 陳述式應更新為新路徑
    expect(noteContent).toContain('import { value } from \'./fresh.js\';');

    // 錯誤重現點 1：字串字面值中的 import 字樣目前被誤改成 './fresh.js'，
    // 正確行為應保持原樣（字串內容不是真正的 import）
    expect(noteContent).toContain(
      'export const docExample = "import { value } from \'./old.js\'";'
    );

    // 錯誤重現點 2：行內註解中的 import 字樣目前也被誤改，
    // 正確行為應保持原樣（註解不是真正的 import）
    expect(noteContent).toContain(
      'export const usage = value; // 參考 import { value } from \'./old.js\' 的寫法'
    );
  });
});

describe('CLI move - require/dynamic import 誤傷字串與行內註解 (C9)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，非程式碼中的 require() 與 dynamic import() 文字應保持原樣', async () => {
    await fixture.writeFile('src/old.ts', 'export const value = 1;\n');
    const originalContent = `const dynamicExample = "import('./old.js')";
const requireExample = "require('./old.js')";
const marker = 1; // import('./old.js') require('./old.js')
`;
    await fixture.writeFile('src/examples.ts', originalContent);

    const result = await executeCLI(
      ['move', 'src/old.ts', 'src/fresh.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(await fixture.readFile('src/examples.ts')).toBe(originalContent);
  });
});

describe('CLI move - 多行呼叫起始行行尾註解含假呼叫時 specifier 綁錯 (P2-1)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，多行 require() 起始行行尾註解含完整假呼叫形狀時，真正的 specifier 應更新、註解應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/multiline-fake-comment-require.ts',
      `const real = require( // legacy: require('./fake.js')
  './real.js'
);
export { real };
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/multiline-fake-comment-require.ts');

    // 錯誤重現點：真正的 require() 呼叫（第二行的 './real.js'）目前完全沒被更新，
    // 因為 pushMultilineCallStatement 對未遮罩原文取第一個 regex 命中，抓到了
    // 行尾註解裡假呼叫的 './fake.js'，誤判該呼叫語句的 module specifier 就是它
    expect(content).toContain('./moved.js');
    expect(content).not.toContain('./real.js\'');
    // 註解裡的假路徑應保持原樣，不應被誤改
    expect(content).toContain('// legacy: require(\'./fake.js\')');
  });

  it('move 後，多行 dynamic import() 起始行行尾註解含完整假呼叫形狀時，真正的 specifier 應更新、註解應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/multiline-fake-comment-import.ts',
      `const real = import( // legacy: import('./fake.js')
  './real.js'
);
export { real };
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/multiline-fake-comment-import.ts');

    // 錯誤重現點：真正的 dynamic import() 呼叫（第二行的 './real.js'）目前完全沒被更新，
    // 原因同上（require 版本），改抓到行尾註解裡假呼叫的 './fake.js'
    expect(content).toContain('./moved.js');
    expect(content).not.toContain('./real.js\'');
    // 註解裡的假路徑應保持原樣，不應被誤改
    expect(content).toContain('// legacy: import(\'./fake.js\')');
  });
});

describe('CLI move - 假陽性起始行與下一行真 import 誤合併成多行 span 導致 column 為 -1 (P2-B)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，前一行字串字面值含 import 字樣、下一行才是真正 import 時，真正的 import 應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    const originalMsgLine = 'const msg = \'cannot import x\';';
    await fixture.writeFile(
      'src/string-line-then-import.ts',
      `${originalMsgLine}
import { value } from './real.js';
export const use = value + msg.length;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    // 錯誤重現點：collectMultilineImportStatement 只檢查起始行原文（未遮罩）是否含
    // 'import' 字樣，把字串字面值行誤判為多行 import 的起點，與下一行真正的 import
    // 合併成同一個 span；columnIndex 改用遮罩後的起始行 indexOf('import')，遮罩後
    // 字串裡的假 'import' 已消失，回傳 -1，未 guard 直接送進 createPosition 拋出
    // 「Column 必須大於等於 1」例外。此例外從 file-scanner.ts 掃描引用階段（無
    // try/catch 包裹）未攔截逸出，導致整個 move 指令失敗：
    // 現況為 exitCode 1、`{"success":false,"error":"Column 必須大於等於 1"}`
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/string-line-then-import.ts');
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 字串字面值內容應保持原樣
    expect(content).toContain(originalMsgLine);
  });

  it('move 後，前一行行內註解含 import 字樣、下一行才是真正 import 時，真正的 import 應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    const originalCommentLine = 'const a = 1; // import note';
    await fixture.writeFile(
      'src/comment-line-then-import.ts',
      `${originalCommentLine}
import { value } from './real.js';
export const use = value + a;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    // 錯誤重現點同上（字串版本），起始行改為行內註解含 'import' 字樣，
    // 現況同樣為 exitCode 1、`{"success":false,"error":"Column 必須大於等於 1"}`
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/comment-line-then-import.ts');
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 行內註解內容應保持原樣
    expect(content).toContain(originalCommentLine);
  });
});
