/**
 * Path Parser
 * 解析 move 命令的路徑格式（支援 file:line:col）
 */

/**
 * 解析後的路徑資訊
 */
export interface ParsedPath {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 行號（1-based） */
  readonly line?: number;
  /** 欄位（1-based） */
  readonly column?: number;
}

/**
 * 解析移動目標路徑
 *
 * 支援格式：
 * - `/path/to/file.ts` → 純檔案路徑
 * - `/path/to/file.ts:25` → 檔案路徑 + 行號
 * - `/path/to/file.ts:25:10` → 檔案路徑 + 行號 + 欄位
 * - `C:\path\to\file.ts:25` → Windows 路徑（保留磁碟機代號）
 *
 * @param input 輸入字串
 * @returns 解析後的路徑資訊
 */
export function parseMoveTarget(input: string): ParsedPath {
  // 找最後一個可能是行號的 `:數字` 模式
  // 從後往前找，避免錯誤解析 Windows 磁碟機代號（如 C:\path）
  const parts = input.split(':');

  if (parts.length === 1) {
    // 無冒號，純路徑
    return { filePath: input };
  }

  // 檢查最後一部分是否為數字（column）
  const lastPart = parts[parts.length - 1];
  const secondLastPart = parts.length >= 2 ? parts[parts.length - 2] : '';

  // 判斷最後兩個部分是否都是數字
  const lastIsNumber = /^\d+$/.test(lastPart);
  const secondLastIsNumber = /^\d+$/.test(secondLastPart);

  if (lastIsNumber && secondLastIsNumber) {
    // 格式：path:line:col
    const line = parseInt(secondLastPart, 10);
    const column = parseInt(lastPart, 10);
    const filePath = parts.slice(0, -2).join(':');
    return { filePath, line, column };
  } else if (lastIsNumber) {
    // 格式：path:line
    const line = parseInt(lastPart, 10);
    const filePath = parts.slice(0, -1).join(':');
    return { filePath, line };
  }

  // 無有效位置資訊，當作純路徑
  return { filePath: input };
}

/**
 * 檢查路徑是否包含位置資訊
 */
export function hasPositionInfo(parsed: ParsedPath): boolean {
  return parsed.line !== undefined;
}
