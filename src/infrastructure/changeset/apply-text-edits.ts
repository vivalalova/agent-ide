/**
 * 文字編輯套用核心
 *
 * 這是「把一組 TextEdit 套用到內容字串、算出檔案終態」的單一權威實作：
 * dedupe（去重冪等編輯）→ 重疊檢查（fast-fail）→ 排序 → 從後往前套用。
 *
 * ChangeApplicator（實際寫入）委派此函數，作為實寫終態的唯一來源；把此邏輯獨立成
 * 純函數，方便單獨測試、並讓「編輯如何套用」只有一處定義（含空內容 dedupe、同起點
 * tiebreak 等邊界規則）。
 */

import type { TextEdit } from './types.js';

/**
 * 將編輯操作套用到內容，回傳套用後的完整內容
 *
 * @param content 原始內容
 * @param edits 編輯操作列表
 * @returns 修改後的內容
 * @throws Error 偵測到互相踩踏（範圍重疊）的編輯時
 */
export function applyTextEdits(content: string, edits: readonly TextEdit[]): string {
  if (edits.length === 0) {
    return content;
  }

  // 完全相同（range 與 newText 皆相同）的重複編輯屬合法冪等操作，靜默 dedupe 為一筆。
  // dedupe 必須先於空內容快速路徑，否則空檔案 + 兩筆相同零寬插入會各自套用、產生重複內容
  // （與非空內容路徑不一致）。
  const dedupedEdits = dedupeIdenticalEdits(edits);

  // 空內容特殊處理：所有 edit 的位置都視為插入到開頭
  // 這是因為對空內容而言，任何位置的插入都等同於從頭開始
  if (content === '') {
    return dedupedEdits.map(e => e.newText).join('');
  }

  // 只分割一次，用於計算 offset
  const lines = splitLines(content);

  // 去重後仍有範圍重疊（以原始 offset 判定）即為衝突編輯，fast-fail：
  // 絕不靜默套用會互相踩踏的編輯，讓呼叫端走既有錯誤/回滾路徑
  assertNoOverlappingEdits(dedupedEdits, lines);

  // 按位置從後往前排序（避免位置偏移）
  const sortedEdits = [...dedupedEdits].sort((a, b) => {
    // 先比較起始行號
    if (a.range.start.line !== b.range.start.line) {
      return b.range.start.line - a.range.start.line; // 從後往前
    }
    // 同起始行則比較起始列號
    if (a.range.start.column !== b.range.start.column) {
      return b.range.start.column - a.range.start.column; // 從後往前
    }
    // 起點完全相同時的 tiebreak：結束位置較大者先套用（降冪）。
    // 「從後往前套用」時先套用的會被後套用的疊在前面；讓零寬插入（end === start，
    // 結束位置最小）最後套用，就能保留在整段替換的結果之前，不被替換吃掉。
    if (a.range.end.line !== b.range.end.line) {
      return b.range.end.line - a.range.end.line;
    }
    return b.range.end.column - a.range.end.column;
  });

  let result = content;

  // 依序應用編輯（直接在字串上操作，避免重複 join/split）
  for (const edit of sortedEdits) {
    const { range, newText } = edit;

    // 計算起始和結束偏移
    const startOffset = calculateOffset(lines, range.start.line, range.start.column);
    const endOffset = calculateOffset(lines, range.end.line, range.end.column);

    // 直接在字串上替換指定範圍
    result = result.substring(0, startOffset) + newText + result.substring(endOffset);
  }

  return result;
}

/**
 * 去除完全相同（range 與 newText 皆相同）的重複編輯
 * 這是合法的冪等情況（例如上游對同一筆變更重複產生），靜默 dedupe 為一筆即可，
 * 不應被後續的重疊偵測誤判為衝突
 * @param edits 原始編輯操作列表
 * @returns 去重後的編輯操作列表（保留原始相對順序）
 */
function dedupeIdenticalEdits(edits: readonly TextEdit[]): TextEdit[] {
  const seen = new Set<string>();
  const deduped: TextEdit[] = [];

  for (const edit of edits) {
    const { start, end } = edit.range;
    const key = `${start.line}:${start.column}-${end.line}:${end.column} ${edit.newText}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(edit);
  }

  return deduped;
}

/**
 * 偵測去重後仍存在的範圍重疊編輯，重疊時直接拋錯（fast-fail）
 *
 * 重疊判定以「原始內容」計算出的 offset 為準（同一份 lines，僅計算一次）：
 * - 零寬插入（start === end）與相鄰編輯（前一筆的 end === 後一筆的 start）
 *   兩者的範圍在字元層級並無重疊，不算衝突（move-member M4 的零寬 import 插入
 *   與後續整檔替換即依賴此邊界不誤殺）
 * - 僅當前一筆（依 start 遞增排序後）的結束 offset 嚴格大於後一筆的起始 offset，
 *   代表兩者實際字元範圍互踩，才視為衝突
 *
 * @param edits 已去重的編輯操作列表
 * @param lines 原始內容分割後的行陣列（用於計算 offset）
 * @throws Error 偵測到重疊編輯時，訊息包含兩筆編輯各自的 range 與 offset
 */
function assertNoOverlappingEdits(edits: readonly TextEdit[], lines: string[]): void {
  if (edits.length < 2) {
    return;
  }

  const withOffsets = edits
    .map(edit => ({
      edit,
      start: calculateOffset(lines, edit.range.start.line, edit.range.start.column),
      end: calculateOffset(lines, edit.range.end.line, edit.range.end.column)
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  for (let i = 1; i < withOffsets.length; i++) {
    const prev = withOffsets[i - 1];
    const curr = withOffsets[i];

    if (prev.end > curr.start) {
      const describe = (r: typeof prev): string =>
        `[${r.edit.range.start.line}:${r.edit.range.start.column}-${r.edit.range.end.line}:${r.edit.range.end.column}]（offset [${r.start},${r.end})）`;
      throw new Error(
        `偵測到重疊的 TextEdit：${describe(prev)} 與 ${describe(curr)} 重疊`
      );
    }
  }
}

/**
 * 分割內容為行（保留換行符）
 * @param content 原始內容
 * @returns 行陣列
 */
function splitLines(content: string): string[] {
  if (!content) {return [];}
  const lines = content.split('\n');
  // 保留換行符（除了最後一行）
  return lines.map((line, i) =>
    i < lines.length - 1 ? line + '\n' : line
  ).filter(line => line.length > 0 || lines.length === 1);
}

/**
 * 計算指定位置的字元偏移量
 *
 * 座標系統說明：
 * - line: 行號（1-based），有效範圍 [1, lines.length+1]
 *   - 1 = 第一行
 *   - lines.length+1 = 檔案末尾（用於追加內容）
 * - column: 列號（1-based），有效範圍 [1, 當前行長度+1]
 *   - 1 = 行首
 *   - 行長度+1 = 行尾（用於行尾插入）
 *
 * 超出範圍的處理：
 * - line > lines.length: 視為檔案末尾，offset 為檔案總長度
 * - column > 行長度: 視為行尾，offset 為該行最後一個字元後
 *
 * @param lines 行陣列
 * @param line 行號（1-based，從 1 開始，允許 lines.length+1 用於檔案末尾插入）
 * @param column 列號（1-based，從 1 開始，允許行長度+1 用於行尾插入）
 * @returns 字元偏移量
 * @throws Error 當行號 < 1 或列號 < 1 時
 */
function calculateOffset(lines: string[], line: number, column: number): number {
  // 驗證基本參數（只禁止負數，超出範圍允許用於插入操作）
  if (line < 1) {
    throw new Error(`無效的行號: ${line}，行號必須 >= 1（1-based 索引）`);
  }
  if (column < 1) {
    throw new Error(`無效的列號: ${column}，列號必須 >= 1（1-based 索引）`);
  }

  let offset = 0;

  // 累加前面所有行的長度（使用邊界檢查避免越界）
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length;
  }

  // 加上當前行的列偏移
  offset += column - 1;

  return offset;
}
