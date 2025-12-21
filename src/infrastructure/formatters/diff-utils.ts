/**
 * Diff 計算工具函數
 * 提供 LCS（最長共同子序列）算法和行級變更計算
 */

import type { LineChange } from './types.js';

/**
 * 計算兩段程式碼之間的行級變更
 * 使用 LCS（最長共同子序列）算法來找出差異
 *
 * 行號語義：
 * - 刪除行：使用原始檔案的行號（用於在原始檔案中定位被刪除的行）
 * - 新增行：使用浮點數行號（如 1.001, 1.002, 1.003）來保持連續新增行的順序
 *   - 基底為原始檔案中的插入位置（上一個原始行號）
 *   - 小數部分用於區分同一位置的多個新增行
 *
 * @param original - 原始程式碼
 * @param modified - 修改後的程式碼
 * @returns 行級變更列表
 */
export function calculateLineChanges(original: string, modified: string): LineChange[] {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const changes: LineChange[] = [];

  const lcs = computeLCS(originalLines, modifiedLines);

  // 使用命令式遍歷（非聲明式）：LCS 演算法需要同步追蹤三個索引狀態
  let origIdx = 0;
  let modIdx = 0;
  let lcsIdx = 0;
  // 追蹤原始檔案的當前行號（1-based）
  let origLineNum = 1;

  while (origIdx < originalLines.length || modIdx < modifiedLines.length) {
    const isCommonLine = lcsIdx < lcs.length
      && origIdx < originalLines.length
      && modIdx < modifiedLines.length
      && originalLines[origIdx] === lcs[lcsIdx]
      && modifiedLines[modIdx] === lcs[lcsIdx];

    if (isCommonLine) {
      // 共同行（context）- 不需要記錄為變更
      origIdx++;
      modIdx++;
      lcsIdx++;
      origLineNum++;
    } else if (origIdx < originalLines.length
               && (lcsIdx >= lcs.length || originalLines[origIdx] !== lcs[lcsIdx])) {
      // 刪除行 - 使用原始檔案行號
      changes.push({
        line: origLineNum,
        oldContent: originalLines[origIdx],
        newContent: null
      });
      origIdx++;
      origLineNum++;
    } else if (modIdx < modifiedLines.length
               && (lcsIdx >= lcs.length || modifiedLines[modIdx] !== lcs[lcsIdx])) {
      // 新增行 - 使用當前 origLineNum 作為插入點
      // 多個連續新增行會有相同的 line 值，依賴 changes 陣列順序保持正確性
      changes.push({
        line: origLineNum,
        oldContent: null,
        newContent: modifiedLines[modIdx]
      });
      modIdx++;
      // 新增行不增加 origLineNum，因為它不對應原始檔案中的任何行
    }
  }

  return changes;
}

/**
 * 計算兩個字串陣列的最長共同子序列（LCS）
 * 使用動態規劃算法，時間複雜度 O(mn)，空間複雜度 O(mn)
 *
 * @param a - 第一個字串陣列
 * @param b - 第二個字串陣列
 * @returns 最長共同子序列
 */
export function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;

  // 建立 DP 表格
  const dp: number[][] = Array.from(
    { length: m + 1 },
    () => Array(n + 1).fill(0)
  );

  // 填充 DP 表格
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯找出 LCS
  const lcs: string[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}
