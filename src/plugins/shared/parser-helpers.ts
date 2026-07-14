/**
 * Parser 共用輔助函數
 * TypeScript 和 JavaScript Parser 共享的邏輯
 */

import { createHash } from 'node:crypto';
import type { Range, Position } from '@shared/types/core.js';
import { matchesAnyGlobPattern } from '@shared/path-pattern.js';
import type {
  Documentation,
  DocumentationTag,
  PatternInfo,
  FormattedParameter
} from '@infrastructure/parser/index.js';
import {
  LINE_TOLERANCE,
  NON_FACTORY_RETURN_TYPES,
  FACTORY_NAME_PREFIXES
} from './constants.js';

/**
 * 計算程式碼內容的雜湊值（SHA256，全內容）
 * 用於 AST/符號索引快取驗證與快取 key；全內容雜湊避免「同長度+同前綴」
 * 的弱雜湊（如僅取長度+前 N 字元）造成不同內容碰撞、靜默拿到錯誤快取結果
 *
 * @param content 原始程式碼內容
 * @returns SHA256 十六進位雜湊字串
 */
export function computeContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 檢查節點行號是否匹配目標行號
 * 允許 JSDoc 造成的偏移
 *
 * @param nodeStartLine 節點起始行（1-based）
 * @param targetLine 目標行（1-based）
 * @returns 是否匹配
 */
export function isLineMatch(nodeStartLine: number, targetLine: number): boolean {
  return Math.abs(nodeStartLine - targetLine) <= LINE_TOLERANCE;
}

/**
 * 判斷回傳型別是否符合 factory 模式
 * 排除 void、never、基本型別、Promise<void> 等
 *
 * @param typeName 型別名稱
 * @returns 是否可能是 factory 回傳型別
 */
export function isFactoryReturnType(typeName: string): boolean {
  const normalizedType = typeName.trim().toLowerCase();

  // 排除基本排除型別
  if ((NON_FACTORY_RETURN_TYPES as readonly string[]).includes(normalizedType)) {
    return false;
  }

  // 排除 Promise<void>
  if (/^promise\s*<\s*void\s*>$/i.test(typeName)) {
    return false;
  }

  // 排除純陣列基本型別
  if (/^(string|number|boolean)\[\]$/.test(normalizedType)) {
    return false;
  }

  return true;
}

/**
 * 計算 factory 模式的信心度
 *
 * @param functionName 函數名稱
 * @param returnType 回傳型別（可選，JavaScript 沒有型別）
 * @param hasNewExpression 是否有 new 表達式
 * @param hasObjectReturn 是否回傳物件字面量
 * @returns 信心度 (0-1)
 */
export function calculateFactoryConfidence(
  functionName: string,
  returnType: string | undefined,
  hasNewExpression: boolean,
  hasObjectReturn: boolean
): number {
  let confidence = 0;

  // 名稱前綴權重
  const nameWeight = returnType ? 0.3 : 0.4; // JavaScript 沒有型別，名稱權重較高
  if (FACTORY_NAME_PREFIXES.some(prefix =>
    functionName.toLowerCase().startsWith(prefix)
  )) {
    confidence += nameWeight;
  }

  // 回傳型別權重（僅 TypeScript）
  if (returnType && returnType !== 'any') {
    confidence += 0.3;
  }

  // Factory 行為權重
  if (hasNewExpression) {
    confidence += 0.4;
  }
  if (hasObjectReturn) {
    confidence += 0.3;
  }

  return Math.min(confidence, 1);
}

/**
 * 建立 PatternInfo 物件
 *
 * @param symbolName 符號名稱
 * @param confidence 信心度
 * @param producedType 產生的型別（可選）
 * @returns PatternInfo 物件
 */
export function createFactoryPatternInfo(
  symbolName: string,
  confidence: number,
  producedType?: string
): PatternInfo {
  return {
    type: 'factory',
    symbolName,
    confidence,
    metadata: producedType ? { producedType } : undefined
  };
}

/**
 * 解析 JSDoc 內容
 * 從原始 JSDoc 文字中提取描述和標籤
 *
 * @param content JSDoc 內容（不含 /** 和 * /）
 * @returns 解析後的描述和標籤
 */
export function parseJSDocContent(content: string): {
  description?: string;
  tags: DocumentationTag[];
} {
  const lines = content.split('\n');
  const tags: DocumentationTag[] = [];
  const descriptionLines: string[] = [];
  let inDescription = true;

  for (const line of lines) {
    // 移除行首的 * 和空白
    const trimmedLine = line.replace(/^\s*\*\s?/, '').trim();

    // 檢查是否為標籤行
    const tagMatch = trimmedLine.match(/^@(\w+)\s*(.*)?$/);

    if (tagMatch) {
      inDescription = false;
      const tagName = tagMatch[1];
      const tagText = tagMatch[2]?.trim() ?? '';
      tags.push({ name: tagName, text: tagText });
    } else if (inDescription && trimmedLine) {
      descriptionLines.push(trimmedLine);
    }
  }

  const description = descriptionLines.length > 0
    ? descriptionLines.join(' ').trim()
    : undefined;

  return { description, tags };
}

/**
 * 建立 Documentation 物件
 *
 * @param rawText 原始 JSDoc 文字
 * @param description 描述
 * @param tags 標籤列表
 * @returns Documentation 物件，如果無內容則返回 null
 */
export function createDocumentation(
  rawText: string,
  description?: string,
  tags?: DocumentationTag[]
): Documentation | null {
  if (!rawText.trim()) {
    return null;
  }

  return {
    rawText,
    description,
    tags: tags ?? []
  };
}

/**
 * 建立 FormattedParameter 物件
 *
 * @param name 參數名稱
 * @param type 參數型別（JavaScript 預設為 'any'）
 * @param optional 是否可選
 * @param defaultValue 預設值
 * @returns FormattedParameter 物件
 */
export function createFormattedParameter(
  name: string,
  type: string = 'any',
  optional: boolean = false,
  defaultValue?: string
): FormattedParameter {
  return {
    name,
    type,
    optional,
    defaultValue
  };
}

/**
 * 建立空 Range（用於錯誤情況）
 */
export function createEmptyRange(): Range {
  const emptyPosition: Position = { line: 0, column: 0, offset: 0 };
  return { start: emptyPosition, end: emptyPosition };
}

/**
 * 檢查路徑是否為相對路徑
 * 相對路徑以 ./ 或 ../ 開頭
 *
 * @param path 路徑字串
 * @returns 是否為相對路徑
 */
export function isRelativePath(path: string): boolean {
  return path.startsWith('./') || path.startsWith('../');
}

/**
 * 預編譯的 Unicode 識別符正則表達式
 * 符合 UAX #31 標準：
 * - 第一個字元：Unicode 類別 ID_Start、底線、或 $
 * - 後續字元：Unicode 類別 ID_Continue 或 $
 */
export const UNICODE_IDENTIFIER_PATTERN = /^[\p{ID_Start}_$][\p{ID_Continue}$]*$/u;

/**
 * 檢查名稱是否符合 Unicode 識別符格式
 * 不包含保留字檢查，僅驗證格式
 *
 * @param name 識別符名稱
 * @returns 是否符合格式
 */
export function isValidUnicodeIdentifier(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }
  return UNICODE_IDENTIFIER_PATTERN.test(name);
}

/**
 * 檢查檔案路徑是否匹配任一模式
 * 實際比對邏輯委派共用的 path-pattern 模組（見 @shared/path-pattern.js），
 * 避免各 Parser 各自手刻子字串匹配造成 dist/distance 之類的誤判
 *
 * @param filePath 檔案路徑
 * @param patterns 模式列表
 * @returns 是否匹配
 */
export function matchesAnyPattern(filePath: string, patterns: readonly string[]): boolean {
  const normalizedPath = filePath.replace(/^\.?\//, '');
  return matchesAnyGlobPattern(normalizedPath, patterns);
}
