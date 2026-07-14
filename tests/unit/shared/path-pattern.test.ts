/**
 * path-pattern 單元測試
 *
 * P3-5: matchesGlobPattern 對「純檔名樣式」永不命中葉節點。
 *   純名稱樣式（如 'generated.ts'、'**\/LICENSE'）在 extractPureName 判定後，一律正規化成
 *   `**\/name/**`；但 minimatch 的 `/**` 尾端要求「至少存在一層後代路徑」，若該名稱本身就是
 *   路徑最末端（檔案，無後代），永遠無法命中。根因：src/shared/path-pattern.ts:17,36
 *   （PURE_NAME_PATTERN、effectivePattern 的組裝）。
 *
 * P3-2: 純名稱含逗號時語意炸開。PURE_NAME_PATTERN（`[^*?/]+`）沒有排除逗號，
 *   'foo,bar' 這種含逗號的合法目錄/檔名會被 extractPureName 判定為純名稱，
 *   effectivePattern 組成 `{**\/${pureName},**\/${pureName}/**}` 時，pureName 本身的逗號
 *   被當成 brace-expansion 分隔符，'{**\/foo,bar,**\/foo,bar/**}' 被 minimatch 展開成四個
 *   選項（`**\/foo`、`bar`、`**\/foo`、`bar/**`），沒有一個代表「foo,bar 這個名稱整段路徑
 *   命中」的正確語意，導致含逗號名稱的排除/納入樣式失真。根因：
 *   src/shared/path-pattern.ts:44（effectivePattern 組裝時未跳脫 pureName 中的逗號）。
 *
 * brace 字面目錄名（尚未修復）：合法目錄名稱恰好整段就是 `{a,b}` 這種 brace 語法字面值時，
 *   extractPureName 的 PURE_NAME_PATTERN（`[^*?/]+`，未排除 `{`/`}`/`,`）仍判定它是純名稱，
 *   於是原樣交給 matchesPathFragment 組成 `**\/{a,b}` 與 `**\/{a,b}/**` 兩個樣式字串，
 *   minimatch 對這兩個字串執行 brace-expansion，把 `{a,b}` 展開成「a 或 b」兩個候選路徑段，
 *   而非「精確等於 {a,b} 這一段名稱」。結果是真正名為 `{a,b}` 的目錄反而命中不了（無任何
 *   展開後選項代表它），而單純名為 `a` 或 `b` 的目錄卻被誤判命中。根因：
 *   src/shared/path-pattern.ts:60-61（matchesPathFragment 直接把 normalizedFragment 內插進
 *   minimatch pattern 字串，未跳脫其中的 brace 特殊字元）。
 */

import { describe, it, expect } from 'vitest';
import { matchesGlobPattern, matchesPathFragment } from '@shared/path-pattern.js';

describe('matchesGlobPattern - 純檔名樣式對葉節點永不命中 (P3-5)', () => {
  it('錯誤重現點：純檔名樣式應能命中路徑末端的同名檔案本身', () => {
    // 'generated.ts' 正規化成 '**/generated.ts/**'，要求其後至少還有一層路徑，
    // 但 'src/generated.ts' 中 generated.ts 就是路徑末端，永遠命中不了
    expect(matchesGlobPattern('src/generated.ts', 'generated.ts')).toBe(true);
  });

  it('錯誤重現點：`**/name` 形式的純檔名樣式同樣應能命中路徑末端的同名檔案本身', () => {
    // '**/LICENSE' 正規化成 '**/LICENSE/**'，同上問題
    expect(matchesGlobPattern('docs/LICENSE', '**/LICENSE')).toBe(true);
  });

  it('釘住既有正確行為：純檔名樣式不應誤傷同前綴的不同名稱（dist 不匹配 distance）', () => {
    expect(matchesGlobPattern('src/distance/foo.ts', 'dist')).toBe(false);
  });

  it('釘住既有正確行為：純檔名樣式應命中任一層級的同名目錄下的檔案', () => {
    expect(matchesGlobPattern('src/dist/foo.ts', 'dist')).toBe(true);
  });

  it('釘住既有正確行為：純檔名樣式應命中專案根目錄下的同名目錄', () => {
    expect(matchesGlobPattern('dist/foo.ts', 'dist')).toBe(true);
  });
});

describe('matchesGlobPattern - 純名稱含逗號時被誤判為 brace-expansion (P3-2)', () => {
  it('錯誤重現點：含逗號的目錄名稱應精確命中該目錄下的檔案', () => {
    // 'foo,bar' 是合法目錄名稱，effectivePattern 組裝時逗號被誤當 brace 分隔符炸開，
    // 沒有任何展開後的選項代表「foo,bar 整段路徑」，導致命中不了
    expect(matchesGlobPattern('a/foo,bar/x.ts', 'foo,bar')).toBe(true);
  });

  it('釘住正確行為：含逗號的樣式不應被展開後的片段誤傷同名前綴的 foo 目錄', () => {
    expect(matchesGlobPattern('src/foo/x.ts', 'foo,bar')).toBe(false);
  });
});

describe('matchesGlobPattern - brace 字面目錄名被 minimatch 誤判為 alternation', () => {
  it('錯誤重現點：字面 brace 目錄名稱 {a,b} 應精確命中該目錄下的檔案', () => {
    // '{a,b}' 是合法目錄名稱字面值，但組出的 '**/{a,b}' 與 '**/{a,b}/**' 被 minimatch
    // 當成 brace-expansion 語法展開成「a 或 b」兩個候選路徑段，而非「精確等於 {a,b}
    // 這一段名稱」，導致真正名為 {a,b} 的目錄反而命中不了
    expect(matchesGlobPattern('src/{a,b}/x.ts', '{a,b}')).toBe(true);
  });

  it('錯誤重現點：不應把 brace 字面樣式誤展開成 a 或 b 的 alternation 而誤傷單純命名為 a 的目錄', () => {
    // 展開後 '**/{a,b}/**' 等價 '**/a/**' 或 '**/b/**'，會誤把單純命名為 a 的目錄
    // 判定為命中，但樣式的真實語意是「精確等於 {a,b} 這個名稱」，不該命中單獨的 a
    expect(matchesGlobPattern('src/a/x.ts', '{a,b}')).toBe(false);
  });
});

/**
 * matchesPathFragment 對前導 `./` 未正規化 (fragment 正規化缺陷)
 *
 * matchesPathFragment 只用 `fragment.replace(/\/+$/, '')` 移除「尾端」斜線，未處理
 * fragment 前導的 `./`。fragment 帶前導 `./`（如使用者以 `./src/legacy/api.ts` 描述路徑片段）
 * 時，組出的樣式變成 `**\/./src/legacy/api.ts`（與 `**\/./src/legacy/api.ts/**`），
 * minimatch 不會把 `**\/.` 中的 `.` 當成當前目錄折疊掉，這兩個樣式都無法匹配任何實際路徑，
 * 導致帶前導 `./` 的 fragment 永遠不命中。根因：src/shared/path-pattern.ts:49
 * （normalizedFragment 只用 `replace(/\/+$/, '')`，未移除前導 `./` 或正規化前導 `/`）。
 */
describe('matchesPathFragment - fragment 前導 ./ 未正規化', () => {
  it('錯誤重現點：fragment 帶前導 ./ 應與不帶前導 ./ 的等價片段一樣能命中', () => {
    expect(matchesPathFragment('a/src/legacy/api.ts', './src/legacy/api.ts')).toBe(true);
  });

  it('釘住現況行為：fragment 為絕對路徑、filePath 也是同一絕對路徑時應能命中（實跑為綠燈，非本次缺陷範圍，保留作為回歸釘住）', () => {
    expect(matchesPathFragment('/abs/proj/src/x.ts', '/abs/proj/src/x.ts')).toBe(true);
  });
});
