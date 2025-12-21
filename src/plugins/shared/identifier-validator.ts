/**
 * 識別符驗證器
 *
 * 提供 Unicode 識別符驗證功能。
 * 支援多國語言識別符（中/日/韓/阿拉伯等）。
 */

import { JS_RESERVED_WORDS, TS_RESERVED_WORDS } from './reserved-words.js';

/**
 * Unicode 識別符正則表達式
 *
 * 根據 Unicode 標準 UAX #31：
 * - 第一個字元：Unicode 類別 ID_Start、底線 (_) 或 $
 * - 後續字元：Unicode 類別 ID_Continue 或 $
 *
 * 支援範例：
 * - const 用戶名稱 = "John"  // 中文
 * - let データ = 123         // 日文
 * - const 테마 = 'dark'      // 韓文
 * - let π = 3.14159          // 希臘字母
 */
export const UNICODE_IDENTIFIER_PATTERN = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;

/**
 * 驗證識別符名稱（不檢查保留字）
 *
 * 只驗證語法上是否為合法的識別符，不檢查是否為保留字。
 * 若需要檢查保留字，請使用 isValidIdentifier 函數。
 *
 * @param name - 要驗證的識別符名稱
 * @returns 是否為語法上合法的識別符
 *
 * @example
 * isValidIdentifierSyntax('userName')   // true
 * isValidIdentifierSyntax('用戶名稱')    // true
 * isValidIdentifierSyntax('class')      // true（不檢查保留字）
 * isValidIdentifierSyntax('123abc')     // false（數字開頭）
 * isValidIdentifierSyntax('')           // false（空字串）
 */
export function isValidIdentifierSyntax(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  return UNICODE_IDENTIFIER_PATTERN.test(name);
}

/**
 * 驗證識別符名稱（通用版本）
 *
 * 驗證名稱是否為合法的識別符，並檢查是否為 JavaScript 保留字。
 * 適用於 JavaScript 和需要相容兩者的場景。
 *
 * @param name - 要驗證的識別符名稱
 * @returns 是否為合法的識別符
 *
 * @example
 * isValidIdentifier('userName')   // true
 * isValidIdentifier('用戶名稱')    // true
 * isValidIdentifier('class')      // false（保留字）
 * isValidIdentifier('123abc')     // false（數字開頭）
 */
export function isValidIdentifier(name: string): boolean {
  return isValidIdentifierSyntax(name) && !isReservedWord(name);
}

/**
 * 檢查是否為 JavaScript 保留字
 *
 * @param name - 要檢查的名稱
 * @returns 是否為 JavaScript 保留字
 */
export function isReservedWord(name: string): boolean {
  return JS_RESERVED_WORDS.has(name);
}

/**
 * 檢查是否為 TypeScript 保留字
 *
 * TypeScript 保留字包含 JavaScript 保留字加上 TypeScript 特有的關鍵字。
 *
 * @param name - 要檢查的名稱
 * @returns 是否為 TypeScript 保留字
 */
export function isTypeScriptReservedWord(name: string): boolean {
  return TS_RESERVED_WORDS.has(name);
}

/**
 * 驗證 TypeScript 識別符名稱
 *
 * 驗證名稱是否為合法的 TypeScript 識別符。
 * 與 isValidIdentifier 的差異在於會檢查 TypeScript 額外的保留字。
 *
 * @param name - 要驗證的識別符名稱
 * @returns 是否為合法的 TypeScript 識別符
 *
 * @example
 * isValidTypeScriptIdentifier('userName')   // true
 * isValidTypeScriptIdentifier('用戶名稱')    // true
 * isValidTypeScriptIdentifier('class')      // false（JavaScript 保留字）
 * isValidTypeScriptIdentifier('enum')       // false（TypeScript 保留字）
 */
export function isValidTypeScriptIdentifier(name: string): boolean {
  return isValidIdentifierSyntax(name) && !isTypeScriptReservedWord(name);
}
