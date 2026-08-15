/**
 * CLI move 命令 E2E 測試 - export ... from 系列（EXPORT-C5/EXPORT-P3-B/P3-A/P3-C/
 * P3-DUAL-EXPORT-LINE，形狀 A~E）
 *
 * 由 cli-move-import-rewrite-bugs.e2e.test.ts 依主題拆分（行為不變，內容逐字搬移）。
 *
 * EXPORT-C5（已修復）: parseImportStatements 的 export 分支（見下方「export 分支未遮罩語意判斷
 *       實驗」describe block）過去與已治本的 import 分支不對稱：對 collectMultilineExportStatement
 *       回傳的「未遮罩」串接文字找第一個 from '...'，當「假 export 字樣行緊鄰真 export-from
 *       語句」（字串字面值或行內註解裡含 from '...'，且與真正的 export-from 合併進同一段
 *       串接文字）時，會命中假路徑而非真正路徑，導致真正的 export-from 完全沒被更新（形狀
 *       B／C）；更隱蔽的變體（形狀 D）是 collectMultilineExportStatement 的續行判斷只看
 *       遮罩後該行有無 from '...'（10 行 cap），不驗證是否仍在 export 語法範圍內，於是
 *       「非 export-from 的真 export 行」也會被當成多行 export 的起點，一路收行直到撞上
 *       任何含 from 的行——即使那是後面一筆完全獨立、真正需要更新的 import 陳述式——把兩者
 *       誤併成同一個假 export span，被吞進 span 的真 import 因跳行從未被獨立解析，其
 *       specifier 靜默殘留舊路徑。單獨的假 export 字串行（不與真 export-from 相鄰）當時就已
 *       被 collectMultilineExportStatement 內部的遮罩式 from 偵測擋下回 null，不構成此缺陷、
 *       不致命（形狀 A）。現況：export 分支已改為對「遮罩後、逐字元對齊」的 span 文字定位
 *       from 與 export 關鍵字（見 import-resolver.ts 現行 parseImportStatements export 分支），
 *       形狀 A/B/C/D 四條測試現況皆為綠燈，保留作為釘住防回歸的 regression 覆蓋。
 * EXPORT-P3-B: 承上，export 分支修復後仍有一處與 import 分支不對稱的殘留：export-from 語句的
 *       rawStatement 由「export 關鍵字」切到 span 結尾，若 from '...' 之後同一行還有尾隨程式碼
 *       （如 `export { value } from './real.js'; export const tail = 1;`），rawStatement 尾端
 *       不再是 from '...'，path-calculator.ts replaceModuleSpecifier 的 fromSpecifierPattern
 *       尾錨定（要求 from '<oldPath>' 之後只能是可選的 import attributes／分號／空白／尾隨
 *       註解，接著就是字串結尾）不命中，也不符合 side-effect import 或 require/import() 呼叫
 *       樣式，三個 pattern 都不匹配，replaceModuleSpecifier 原樣退回 rawStatement，
 *       newImport === rawStatement 觸發呼叫端 `continue`，該 export-from 靜默不更新（見下方
 *       「export-from 尾隨程式碼」describe block，形狀 E，實測現況為紅：exitCode 0 但完全
 *       沒有任何內容被改動）。
 * P3-A（尚未修復）: export 開大括號區塊後緊跟的 require 行被假 span 吞掉。
 *       collectMultilineExportStatement 的進場守門（import-resolver.ts:430-433）只擋淨大括號
 *       深度 ≤0 的起始行；`export const config = {` 這類「非 re-export 的具名匯出宣告」開頭
 *       同樣淨深度 +1，會通過守門被誤判為多行 export-from 的合法起點。續行收集判斷
 *       （同檔案 :438-448）只看遮罩後淨深度是否回到 ≤0 且該行含 from '...'，未驗證這段期間
 *       是否仍在同一個 export 語法範圍內；大括號在下一行閉合後，只要往後幾行內出現任何
 *       `import ... from '...'`，就會把中間所有行（含真正的 require()/import() 呼叫）一併
 *       併入這個假 export span，parseImportStatements 因而 `i = endLineIndex; continue`
 *       跳行，span 內的 require()/import() 呼叫從未被獨立解析，其 module specifier 靜默
 *       殘留舊路徑（見下方「export 大括號區塊後緊跟 require」describe block）。
 * P3-C（已修復，見下方「export * from 換行形狀」describe block）: `export * from` 換行形狀
 *       （from 與其後的路徑字串分屬不同行）曾完全收不到，現況為綠、保留作為回歸釘住。
 * P3-DUAL-EXPORT-LINE（已修復，見下方「同一行兩筆 export-from」describe block）: 承上，
 *       單行 export span 曾只解析第一筆 export-from，現改用 EXPORT_FROM_STATEMENT_PATTERN
 *       matchAll 逐筆列舉，現況為綠、保留作為回歸釘住。
 * P2-LOCAL-EXPORT-SWALLOW（已修復，見下方「本地 export 清單假 span 吞行」describe block）:
 *       completeness 判斷曾未錨定在開出 span 的那筆 export 上，只要「累計文字中任一位置」
 *       湊出完整 `export ... from '...'` 形狀即視為完整，`export { setup };` 這類本地
 *       具名清單（無 from）開出 span 後會撞到後方任一筆真 re-export 就地誤收尾，把中間
 *       import/require 吞成假 span。現改用 sticky（'y' flag）錨定在開出此 span 的那筆
 *       export 上，只認「就地湊齊」，現況為綠、保留作為回歸釘住。
 * P2-STICKY-SINGLE-ANCHOR（尚未修復）: 承上，statement-collector.ts 的錨定修復只取
 *       `EXPORT_FROM_START_PATTERN.exec(maskedStartLine)` 找到的「起始行第一個」白名單
 *       export 當唯一錨點（見 collectMultilineExportStatement 的 exportOffset），未考慮
 *       同一行／同一 span 內可能有多筆候選 export，且第一筆恰好是無 from 的本地具名清單
 *       （如 `export { setup };`）時：sticky 完整性判斷永遠只在這唯一的 exportOffset 上
 *       嘗試比對，該清單自己永遠湊不齊完整形狀（sticky 不會、也不能重新嘗試以同行／同 span
 *       內第二筆 export 為錨點），導致 collectMultilineExportStatement 直接回傳 null——
 *       不只本地清單沒被解析，同行／同 span 內緊跟在後、原本語法完整的真 re-export（如
 *       `export { y } from './real.js'`）唯一的解析入口也隨之消失，其 module specifier
 *       move 後靜默殘留舊路徑（見下方「同行前置本地清單遮蔽真 re-export」describe block）。
 * P2-SINGLE-LINE-EXPORT-SPAN-SKIP-TRAILING-CALL（尚未修復）: import-resolver.ts 的 export
 *       分支不分單行／多行 span，一律 `i = endLineIndex; continue`（見 :187-189）。單行
 *       span 時 endLineIndex === startIndex === 當前行，此 continue 直接跳過本輪迴圈剩餘
 *       的 require()/動態 import() 解析階段（pushSingleLineCallStatements 等，見 :193-211），
 *       導致同一行內、export-from 之後緊接的 require()/import() 呼叫完全沒有機會被解析成
 *       ImportStatement，其 module specifier move 後靜默殘留舊路徑（見下方「export 單行
 *       span 收尾後同行尾隨 require 被跳過」describe block）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

/**
 * export 分支未遮罩語意判斷實驗 - parseImportStatements 的 export 分支
 * （import-resolver.ts:156 `line.includes('export')`、:162 對未遮罩串接文字
 * match(/from/)、:167 對未遮罩起始行 indexOf('export')）與已治本的 import
 * 分支相比，仍是未遮罩語意判斷，是 C5／P3-1／P3-4 系列缺陷的 export 版類比。
 * 以下三個形狀驗證「單獨假 export 字串行會被 collectMultilineExportStatement
 * 內部遮罩式 from 偵測擋住（回 null，不致命）；真正致命的是『假 export 字樣行
 * 緊鄰真 export-from 語句』」這個風險推斷是否成立。
 */
describe('CLI move - export 分支未遮罩語意判斷實驗（import 分支 C5 類比）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[形狀 A][現況綠，釘住防回歸] 單獨假 export 字串行被 collectMultilineExportStatement 擋下回 null，不影響其他檔案正常單行 export-from 的更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/decoy-standalone.ts',
      `const msg = 'do not export from here';
export const realDecl = 1;
`
    );
    await fixture.writeFile(
      'src/reexport.ts',
      'export { value } from \'./real.js\';\n'
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const reexportContent = await fixture.readFile('src/reexport.ts');
    expect(reexportContent).toContain('export { value } from \'./moved.js\';');

    // 假 export 字串行所在檔案應完全不受影響（collectMultilineExportStatement
    // 對此行遮罩後找不到 from，回 null，不構成多行 export span）
    const decoyContent = await fixture.readFile('src/decoy-standalone.ts');
    expect(decoyContent).toBe(
      `const msg = 'do not export from here';
export const realDecl = 1;
`
    );
  });

  it('[形狀 B][重點試驗，現況綠，釘住防回歸] 假 export 字樣行緊鄰真 export-from 語句時，真正的路徑應更新、字串應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/adjacent-fake-export.ts',
      'const note = "export { x } from \'./fake.js\'";\n' +
      'export { value } from \'./real.js\';\n'
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/adjacent-fake-export.ts');

    // 歷史缺陷重現點（已修復，見檔頭 EXPORT-C5）：collectMultilineExportStatement
    // 收集出的 span 曾是「假字串行 + 真 export-from 行」未遮罩串接文字，舊版
    // export 分支對此未遮罩文字找第一個 from '...'，會命中字串裡的假
    // "from './fake.js'"，導致真正的 export-from 路徑完全沒被更新。現行 export
    // 分支改對遮罩後、逐字元對齊的 span 文字定位 from，此斷言現況為綠。
    expect(content).toContain('export { value } from \'./moved.js\';');
    expect(content).toContain('const note = "export { x } from \'./fake.js\'";');
  });

  it('[形狀 C][重點試驗，現況綠，釘住防回歸] 多行 export-from 起始行行尾註解含假 from 時，真正的路徑應更新、註解應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/decoy-comment-export.ts',
      `export { // } from './decoy.js'
  value
} from './real.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/decoy-comment-export.ts');

    // 歷史缺陷重現點同形狀 B（已修復，見檔頭 EXPORT-C5）：舊版曾把起始行行尾
    // 註解裡的假 "from './decoy.js'" 與真正的 "from './real.js'" 未遮罩串接在
    // 一起，找第一個 from '...' 命中假路徑，真正的 export-from 沒被更新；
    // 現行 export 分支改用遮罩後 span 文字定位，此斷言現況為綠。
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 起始行行尾的 decoy 註解應保持原樣
    expect(content).toContain('// } from \'./decoy.js\'');
  });

  it('[形狀 D][重點試驗，現況綠，釘住防回歸] 真 export 行誤吞真 import 行、span 中間行字串含假 from 時，真 import 應被獨立解析並更新、字串應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/export-swallows-import.ts',
      `export const VERSION = '1.0';
const s = 'data from "./decoy.js"';
import { value } from './real.js';
export const use = value + s.length + VERSION.length;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/export-swallows-import.ts');

    // 歷史缺陷重現點（已修復，見檔頭 EXPORT-C5）：collectMultilineExportStatement
    // 舊版的續行判斷只看遮罩後該行有無 from '...'（10 行 cap），不驗證是否仍在
    // export 語法範圍內，於是「非 export-from 的真 export 行」（第一行）會一路
    // 收行、撞上下一行「真正的 import」就當成收尾，把三行併成一個假 export
    // span，導致真正的 import 從未被獨立解析、specifier 靜默殘留舊路徑。現行
    // collectMultilineExportStatement 以遮罩後起始行的大括號淨深度（見
    // import-resolver.ts:421 netBraceDepth）判斷是否為具名匯出起頭，非 re-export
    // 的 export 行不再起頭收集，此斷言現況為綠。
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 中間行字串裡的假路徑應保持原樣
    expect(content).toContain('data from "./decoy.js"');
  });
});

/**
 * export-from 尾隨程式碼實驗（EXPORT-P3-B，見檔頭說明）- export 分支修復後
 * （見上方「export 分支未遮罩語意判斷實驗」describe block）與 import 分支相比
 * 仍有一處不對稱殘留：export-from 語句的 rawStatement 從 export 關鍵字切到
 * span 結尾，若 from '...' 之後同一行還有尾隨程式碼，rawStatement 尾端不再是
 * from '...'，path-calculator.ts replaceModuleSpecifier 的尾錨定 pattern 不命中，
 * 三個候選 pattern 都不匹配，該 export-from 靜默不更新。
 */
describe('CLI move - export-from 尾隨程式碼時更新靜默丟失 (EXPORT-P3-B)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[形狀 E][重點試驗] export-from 同行尾隨程式碼時，真正的路徑應更新、尾隨程式碼應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/export-from-with-tail.ts',
      'export { value } from \'./real.js\'; export const tail = 1;\n'
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/export-from-with-tail.ts');

    // 錯誤重現點：export-from 語句的 rawStatement 是「export 關鍵字到 span
    // 結尾」的整段文字，此處 span 只有一行、結尾就是整行末，因此 rawStatement
    // 包含 from './real.js' 之後的尾隨 `export const tail = 1;`。
    // path-calculator.ts replaceModuleSpecifier 對沒有 specifierOffset 的 export
    // 陳述式改走 fromSpecifierPattern：要求 from '<oldPath>' 之後只能接可選的
    // import attributes／分號／空白／單行或區塊註解，接著就是字串結尾——這裡後面
    // 還有 `export const tail = 1;` 這種非註解、非空白的程式碼，lookahead 不成立、
    // 整個 pattern 不命中；後兩個候選 pattern（side-effect import、require/import()
    // 呼叫樣式）語法上也對不上 export-from，三者皆不匹配，replaceModuleSpecifier
    // 原樣退回 rawStatement，newImport === rawStatement 觸發呼叫端 continue，
    // 真正的 export-from 完全沒被更新
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./real.js\'');
    // 尾隨程式碼應保持原樣
    expect(content).toContain('export const tail = 1;');
  });
});

/**
 * export 開大括號區塊後緊跟 require 行被假 span 吞掉（P3-A，見檔頭說明，已修復）。
 * collectMultilineExportStatement 的進場守門曾只擋淨大括號深度 ≤0 的起始行，
 * `export const config = {`（非 re-export 的具名匯出宣告，深度 +1）能通過守門；現改用
 * EXPORT_FROM_START_PATTERN 白名單（export 需緊接 `{` 或 `*`），`export const` 這類非
 * re-export 宣告直接被擋在進場守門之外，不再誤判為多行 export-from 起點，現況為綠、
 * 保留作為回歸釘住。
 */
describe('CLI move - export 大括號區塊閉合後緊跟 require 行未被解析 (P3-A)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，export 大括號區塊閉合後的 require() 行應被獨立解析並更新，其後的 import 應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile('src/other.ts', 'export const other = 2;\n');
    await fixture.writeFile(
      'src/config-then-require.ts',
      `export const config = {
  name: 'x'
};
const dep = require('./real.js');
import { other } from './other.js';
export const use = dep;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/config-then-require.ts');

    // 歷史缺陷重現點（已修復，見檔頭 P3-A）：collectMultilineExportStatement 曾把
    // `export const config = {` 誤判為多行 export-from 的合法起點，收行收到下一行
    // 「import other」（第一個含 from 的行）併成假 span，中間的 require 行因
    // i = endLineIndex 跳行從未被解析，module specifier 靜默殘留舊路徑 './real.js'。
    // 現行 EXPORT_FROM_START_PATTERN 白名單直接擋下此進場守門，此斷言現況為綠。
    expect(content).toContain('require(\'./moved.js\')');
    expect(content).not.toContain('require(\'./real.js\')');
    // 假 span 完全無關的 import other 陳述式應保持原樣
    expect(content).toContain('import { other } from \'./other.js\';');
  });
});

/**
 * export * from 換行形狀收不到（P3-C，見檔頭說明，已修復）。
 * collectMultilineExportStatement 的進場守門曾要求起始行淨大括號深度 >0 或同行含
 * from '...'，`export * from` 換行形狀（from 與路徑字串分屬不同行）兩者皆非，
 * 曾直接 return null。現行 EXPORT_FROM_START_PATTERN 白名單接受 `export *`（含
 * `* as ns`），完整性判斷改用 sticky 錨定累計後續行，from 換行後即使分屬不同行
 * 也能就地湊齊，現況為綠、保留作為回歸釘住。
 */
describe('CLI move - export * from 換行形狀未被解析 (P3-C)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，export * from 換行形狀的路徑應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/star-export-newline.ts',
      `export * from
  './real.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/star-export-newline.ts');

    // 歷史缺陷重現點（已修復，見檔頭 P3-C）：起始行無大括號（淨深度 0）且同行沒有
    // from 後接字串，舊版兩個進場條件都不成立，collectMultilineExportStatement
    // return null，次行的路徑字串完全沒被解析、更新。現行白名單＋sticky 累計可正確
    // 跨行湊齊，此斷言現況為綠。
    expect(content).toContain('\'./moved.js\'');
    expect(content).not.toContain('\'./real.js\'');
  });
});

/**
 * 同一行兩筆 export-from 只有第一筆被解析（P3-DUAL-EXPORT-LINE，見檔頭說明，已修復）。
 * import-resolver.ts export 分支的 maskedSpanText.match(...) 曾未帶 'g' flag，單行
 * export span 只取第一個 from 子句；move 第一個被匯出的檔案時剛好命中第一筆、看似
 * 正常，但 move 第二個被匯出的檔案時，第二筆從未被獨立解析，其 module specifier
 * 靜默殘留舊路徑。現改用 EXPORT_FROM_STATEMENT_PATTERN matchAll 逐筆列舉單行 span
 * 內每一筆 export-from，現況為綠、保留作為回歸釘住。
 */
describe('CLI move - 同一行兩筆 export-from 只有第一筆被解析 (P3-DUAL-EXPORT-LINE)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[現況預期綠] move 同行第一個被匯出的檔案時，第一筆 export-from 應更新、第二筆應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile('src/second.ts', 'export const other = 2;\n');
    await fixture.writeFile(
      'src/dual-export.ts',
      'export { value } from \'./real.js\'; export { other } from \'./second.js\';\n'
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/dual-export.ts');
    expect(content).toContain('export { value } from \'./moved.js\';');
    expect(content).toContain('export { other } from \'./second.js\';');
  });

  it('[現況綠，釘住防回歸] move 同行第二個被匯出的檔案時，第二筆 export-from 應更新、第一筆應保持原樣', async () => {
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile('src/second.ts', 'export const other = 2;\n');
    await fixture.writeFile(
      'src/dual-export.ts',
      'export { value } from \'./real.js\'; export { other } from \'./second.js\';\n'
    );

    const result = await executeCLI(
      ['move', 'src/second.ts', 'src/renamed.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/dual-export.ts');

    // 歷史缺陷重現點（已修復，見檔頭 P3-DUAL-EXPORT-LINE）：export 分支的
    // maskedSpanText.match(...) 曾沒有 'g' flag，單行 export span 只取第一個 from
    // （第一筆 './real.js'），第二筆 export { other } from './second.js' 從未被獨立
    // 解析成 ImportStatement，move second.ts 時第二筆完全沒被更新。現行 export 分支
    // 改用 EXPORT_FROM_STATEMENT_PATTERN matchAll 逐筆列舉單行 span 內的每筆
    // export-from，此斷言現況為綠。
    expect(content).toContain('export { other } from \'./renamed.js\';');
    expect(content).toContain('export { value } from \'./real.js\';');
  });
});

/**
 * 本地 export 清單假 span 吞行（P2-LOCAL-EXPORT-SWALLOW，見檔頭說明，已修復）。
 * `export { setup };` 這種無 from 子句的本地具名匯出清單通過 EXPORT_FROM_START_PATTERN
 * 白名單開出多行 span，自己永遠湊不出完整 from 形狀；完整性判斷曾未錨定字串開頭，
 * 只要往後累計到任何一筆真正的 re-export 就在任意位置命中收尾，把中間所有行（含真正
 * 的 import/require 陳述式）全部併入假 span 而未被獨立解析。現改用 sticky（'y' flag）
 * 錨定在開出此 span 的那筆 export 上，本地清單自己永遠湊不齊、不再誤撞後方真
 * re-export 收尾，現況為綠、保留作為回歸釘住。
 */
describe('CLI move - 本地 export 清單假 span 吞行 (P2-LOCAL-EXPORT-SWALLOW)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[緊鄰版][現況綠，釘住防回歸] move 收尾那筆真 re-export 指向的檔案時，該筆路徑應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const x = 1;\n');
    await fixture.writeFile('src/other.ts', 'export const y = 2;\n');
    await fixture.writeFile(
      'src/local-list-then-reexport.ts',
      `export { setup };
const setup = 1;
import { x } from './real.js';
export { y } from './other.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/other.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/local-list-then-reexport.ts');

    // 歷史缺陷重現點（已修復，見檔頭 P2-LOCAL-EXPORT-SWALLOW）：`export { setup };`
    // 通過白名單開出多行 span，舊版完整性判斷未錨定，累計到收尾那筆
    // `export { y } from './other.js';` 時在任意位置命中收尾，把中間的
    // `import { x } from './real.js';` 一併吞入假 span，收尾那筆真正的 re-export
    // 完全沒有對應的 statement。現行 sticky 錨定只認「就地湊齊」，此斷言現況為綠。
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./other.js\'');
    // 被吞的 import 陳述式與 move 標的無關，應保持原樣
    expect(content).toContain('import { x } from \'./real.js\';');
  });

  it('[填充變體，cap 邊界][現況綠，釘住防回歸] 本地清單與真 re-export 之間隔 15 行無關程式碼時，move 收尾 re-export 指向的檔案，該筆路徑仍應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const x = 1;\n');
    await fixture.writeFile('src/other.ts', 'export const y = 2;\n');
    const fillerLines = Array.from({ length: 15 }, (_, idx) => `const filler${idx + 1} = ${idx + 1};`).join('\n');
    await fixture.writeFile(
      'src/local-list-then-reexport-padded.ts',
      `export { setup };
const setup = 1;
import { x } from './real.js';
${fillerLines}
export { y } from './other.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/other.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/local-list-then-reexport-padded.ts');

    // 歷史缺陷重現點同緊鄰版（已修復）：起始行到收尾 re-export 行之間跨越 15 行
    // 填充內容，超過舊 cap 10、仍在現行統一 cap 200 內，驗證此修復不受行數影響，
    // 此斷言現況為綠
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('from \'./other.js\'');
    expect(content).toContain('import { x } from \'./real.js\';');
  });
});

/**
 * 同行前置本地清單遮蔽真 re-export（P2-STICKY-SINGLE-ANCHOR，見檔頭說明，尚未修復）。
 * collectMultilineExportStatement 的 sticky 錨定修復只取起始行第一個白名單 export 當
 * 唯一錨（EXPORT_FROM_START_PATTERN.exec 只回傳第一筆），若這唯一的錨點恰好是無 from
 * 的本地具名清單（如 `export { setup };`），sticky 完整性判斷永遠只在這個錨點上就地
 * 嘗試、永遠湊不齊，函式直接回傳 null——不只本地清單本身沒被解析，同一行／同一 span
 * 內緊接在後、原本語法完整的真 re-export 也因此失去唯一的解析入口，一併被吞掉。
 */
describe('CLI move - 同行前置本地清單遮蔽真 re-export (P2-STICKY-SINGLE-ANCHOR)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[單行版][錯誤重現點] 同一行本地具名清單在前、真 re-export 在後時，真 re-export 的路徑應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const y = 1;\n');
    await fixture.writeFile(
      'src/single-line-local-then-reexport.ts',
      `const setup = 1;
export { setup }; export { y } from './real.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/single-line-local-then-reexport.ts');

    // 錯誤重現點：EXPORT_FROM_START_PATTERN.exec 只取行內第一筆白名單 export
    // （`export { setup }`）當唯一錨點，sticky 完整性判斷永遠在這個錨點上就地
    // 嘗試，該本地清單自己永遠湊不出 from 子句，collectMultilineExportStatement
    // 直接回傳 null——整行（含後面語法完整的 `export { y } from './real.js'`）
    // 完全沒被解析，路徑靜默殘留舊值
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('./real.js');
  });

  it('[跨行版][錯誤重現點] 本地具名清單與跨行真 re-export 同一 span 時，真 re-export 的路徑應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const y = 1;\n');
    await fixture.writeFile(
      'src/multiline-local-then-reexport.ts',
      `const setup = 1;
export { setup }; export {
  y,
} from './real.js';
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/multiline-local-then-reexport.ts');

    // 錯誤重現點同單行版：起始行第一筆白名單 export（`export { setup }`）成為
    // sticky 唯一錨點，該清單永遠湊不齊，即使後續行是語法完整的
    // `export {\n  y,\n} from './real.js';`，也因為錨點固定在前一筆本地清單而
    // 從未被獨立解析，路徑靜默殘留舊值
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('./real.js');
  });

  it('[順序對照組][現況預期綠，釘住] 真 re-export 在前、本地具名清單在後時，真 re-export 的路徑應被更新', async () => {
    await fixture.writeFile('src/real.ts', 'export const y = 1;\n');
    await fixture.writeFile(
      'src/reexport-then-local.ts',
      `const setup = 1;
export { y } from './real.js'; export { setup };
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/reexport-then-local.ts');

    // 對照組：真 re-export 剛好是行內第一筆白名單 export，sticky 錨點就地命中
    // 自己的完整形狀，成功解析並更新；證明變因確實是「第一筆湊不齊、遮蔽後筆」，
    // 非本地清單本身或多筆 export 同行的機制性問題
    expect(content).toContain('from \'./moved.js\'');
    expect(content).not.toContain('./real.js');
    expect(content).toContain('export { setup };');
  });
});

/**
 * export 單行 span 收尾後同行尾隨 require 被跳過
 * (P2-SINGLE-LINE-EXPORT-SPAN-SKIP-TRAILING-CALL，見檔頭說明，尚未修復)。
 * import-resolver.ts 的 export 分支不分單行／多行 span 一律 `i = endLineIndex; continue`；
 * 單行 span 時 endLineIndex 就是當前行，continue 直接跳過本輪迴圈剩餘的
 * require()/動態 import() 解析階段，導致同一行內 export-from 之後緊接的 require() 呼叫
 * 完全沒有機會被解析。
 */
describe('CLI move - export 單行 span 收尾後同行尾隨 require 被跳過 (P2-SINGLE-LINE-EXPORT-SPAN-SKIP-TRAILING-CALL)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[錯誤重現點] move 後，export-from 同行尾隨的 require() 呼叫應被獨立解析並更新、export-from 應保持原樣', async () => {
    await fixture.writeFile('src/keep.ts', 'export const a = 1;\n');
    await fixture.writeFile('src/real.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/export-then-require.ts',
      `export { a } from './keep.js'; const z = require('./real.js');
export const use = z;
`
    );

    const result = await executeCLI(
      ['move', 'src/real.ts', 'src/moved.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/export-then-require.ts');

    // 錯誤重現點：export-from 是單行 span（endLineIndex === startLineIndex ===
    // 當前行），import-resolver.ts 處理完該 span 後一律 `i = endLineIndex; continue`，
    // 直接跳過本輪迴圈剩餘的 require() 解析階段（pushSingleLineCallStatements 等）；
    // 該行內緊接在 export-from 之後的 `require('./real.js')` 因此從未被解析成
    // ImportStatement，move real.ts 時完全沒被更新
    expect(content).toContain('require(\'./moved.js\')');
    expect(content).not.toContain('require(\'./real.js\')');
    // 與 move 標的無關的 export-from 應保持原樣
    expect(content).toContain('from \'./keep.js\'');
  });
});
