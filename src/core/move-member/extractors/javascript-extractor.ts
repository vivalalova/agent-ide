/**
 * JavaScript Member Extractor
 * 提取 JavaScript/JSX 檔案中的成員定義
 *
 * 由於 JavaScript 語法是 TypeScript 的子集，
 * 直接委託給 TypeScript extractor 處理
 */

import { MemberType, type MemberDefinition } from '../types.js';
import { extractTypeScriptMember, listTypeScriptMembers } from './typescript-extractor.js';

/**
 * 提取 JavaScript 成員
 *
 * @param content 檔案內容
 * @param filePath 檔案路徑
 * @param memberName 成員名稱
 * @param memberType 成員類型（可選）
 * @param className 所屬類別（可選）
 * @returns 找到的成員定義，或 null
 */
export function extractJavaScriptMember(
  content: string,
  filePath: string,
  memberName: string,
  memberType?: MemberType,
  className?: string
): MemberDefinition | null {
  return extractTypeScriptMember(content, filePath, memberName, memberType, className);
}

/**
 * 列出 JavaScript 成員
 *
 * @param content 檔案內容
 * @param filePath 檔案路徑
 * @param className 篩選特定類別的成員（可選）
 * @returns 成員定義陣列
 */
export function listJavaScriptMembers(
  content: string,
  filePath: string,
  className?: string
): MemberDefinition[] {
  return listTypeScriptMembers(content, filePath, className);
}
