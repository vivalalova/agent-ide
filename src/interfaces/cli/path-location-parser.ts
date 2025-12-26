/**
 * CLI 路徑位置解析器
 * 統一處理 file:line:column 格式的路徑解析
 *
 * 支援格式：
 * - `/path/to/file.ts` → 純檔案路徑
 * - `/path/to/file.ts:25` → 檔案路徑 + 行號
 * - `/path/to/file.ts:25:10` → 檔案路徑 + 行號 + 欄位
 * - `C:\path\to\file.ts:25` → Windows 路徑（保留磁碟機代號）
 */

import * as path from 'path';

/**
 * 解析後的路徑位置資訊（無位置）
 */
export interface ParsedPathLocationWithoutPosition {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 行號（1-based） */
  readonly line?: undefined;
  /** 欄位（1-based） */
  readonly column?: undefined;
}

/**
 * 解析後的路徑位置資訊（有位置）
 */
export interface ParsedPathLocationWithPosition {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 行號（1-based） */
  readonly line: number;
  /** 欄位（1-based） */
  readonly column?: number;
}

/**
 * 解析後的路徑位置資訊（discriminated union）
 */
export type ParsedPathLocation = ParsedPathLocationWithoutPosition | ParsedPathLocationWithPosition;

/**
 * 解析路徑位置字串
 *
 * 從後往前解析冒號分隔的數字部分，避免錯誤解析 Windows 磁碟機代號（如 C:\path）
 *
 * @param input 輸入字串（如 `src/file.ts:42:10`）
 * @returns 解析後的路徑位置資訊
 *
 * @example
 * parsePathLocation('src/file.ts')          // { filePath: 'src/file.ts' }
 * parsePathLocation('src/file.ts:42')       // { filePath: 'src/file.ts', line: 42 }
 * parsePathLocation('src/file.ts:42:10')    // { filePath: 'src/file.ts', line: 42, column: 10 }
 * parsePathLocation('C:\\path\\file.ts:25') // { filePath: 'C:\\path\\file.ts', line: 25 }
 */
export function parsePathLocation(input: string): ParsedPathLocation {
  const parts = input.split(':');

  if (parts.length === 1) {
    // 無冒號，純路徑
    return { filePath: input };
  }

  // 從後往前檢查，判斷最後幾個部分是否為數字
  const lastPart = parts[parts.length - 1];
  const secondLastPart = parts.length >= 2 ? parts[parts.length - 2] : '';

  const lastIsNumber = /^\d+$/.test(lastPart);
  const secondLastIsNumber = /^\d+$/.test(secondLastPart);

  if (lastIsNumber && secondLastIsNumber) {
    // 格式：path:line:column
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
 * 解析路徑位置並轉換為絕對路徑
 *
 * @param input 輸入字串
 * @param basePath 基準路徑（用於解析相對路徑）
 * @returns 解析後的路徑位置資訊（filePath 為絕對路徑）
 */
export function parsePathLocationAbsolute(input: string, basePath: string): ParsedPathLocation {
  const parsed = parsePathLocation(input);

  // 轉換為絕對路徑
  const absoluteFilePath = path.isAbsolute(parsed.filePath)
    ? parsed.filePath
    : path.resolve(basePath, parsed.filePath);

  return {
    ...parsed,
    filePath: absoluteFilePath
  };
}

/**
 * 檢查路徑是否包含位置資訊（行號或欄位）
 * 使用 type guard 讓 TypeScript 能夠正確收窄型別
 */
export function hasPositionInfo(parsed: ParsedPathLocation): parsed is ParsedPathLocationWithPosition {
  return parsed.line !== undefined;
}
