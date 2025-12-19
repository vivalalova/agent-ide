/**
 * Diff 計算工具函數
 * 提供 LCS（最長共同子序列）算法和行級變更計算
 */

import type { LineChange } from './types.js';

/**
 * 計算兩段程式碼之間的行級變更
 * 使用 LCS（最長共同子序列）算法來找出差異
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
  let virtualLineNum = 1;  // 用於追蹤輸出行號

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
      virtualLineNum++;
    } else if (origIdx < originalLines.length
               && (lcsIdx >= lcs.length || originalLines[origIdx] !== lcs[lcsIdx])) {
      // 刪除行
      changes.push({
        line: virtualLineNum,
        oldContent: originalLines[origIdx],
        newContent: null
      });
      origIdx++;
      virtualLineNum++;
    } else if (modIdx < modifiedLines.length
               && (lcsIdx >= lcs.length || modifiedLines[modIdx] !== lcs[lcsIdx])) {
      // 新增行 - 使用當前 virtualLineNum 作為參考行號
      changes.push({
        line: virtualLineNum,
        oldContent: null,
        newContent: modifiedLines[modIdx]
      });
      modIdx++;
      virtualLineNum++;
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
