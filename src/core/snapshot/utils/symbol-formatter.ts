/**
 * 符號簽章格式化器
 * 提供統一的符號簽章格式化邏輯
 */

import * as path from 'path';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import type { FormattedSignature } from '@infrastructure/parser/index.js';
import type { Symbol } from '@shared/types/index.js';
import {
  parseSignatureWithBalancing,
  formatParsedSignature
} from './bracket-balancer.js';

/**
 * 擴展 Symbol 型別，包含 Parser 額外資訊
 */
export interface ExtendedSymbol extends Symbol {
  readonly signature?: string;
  readonly typeInfo?: string;
}

/**
 * 格式化符號簽章（方法或函數）
 * 優先使用 Parser AST 解析，fallback 到 simplifySignature
 * @param symbol 符號
 * @param fileContents 檔案內容 Map（供 Parser 使用）
 * @returns 格式化後的簽章字串
 */
export function formatSymbolSignature(
  symbol: ExtendedSymbol,
  fileContents: Map<string, string>
): string {
  // 優先使用 Parser AST 解析簽章
  const filePath = symbol.location?.filePath;
  const line = symbol.location?.range?.start?.line;
  const code = filePath ? fileContents.get(filePath) : undefined;

  if (filePath && line !== undefined && code) {
    const parserResult = formatSignatureWithParser(filePath, symbol.name, line, code);
    if (parserResult) {
      return parserResult;
    }
  }

  // Fallback：使用 IndexEngine 提取的簽章
  if (symbol.signature) {
    return simplifySignature(symbol.signature);
  }
  return '() → unknown';
}

/**
 * 使用 Parser AST 格式化簽章
 * @param filePath 檔案路徑（用於選擇 Parser）
 * @param symbolName 符號名稱
 * @param line 行號（1-based）
 * @param code 檔案內容
 * @returns 格式化後的簽章字串，如果無法解析則返回 null
 */
export function formatSignatureWithParser(
  filePath: string,
  symbolName: string,
  line: number,
  code: string
): string | null {
  const ext = path.extname(filePath);
  const parser = ParserRegistry.getInstance().getParser(ext);

  if (!parser?.formatSignature) { return null; }

  const sig: FormattedSignature | null = parser.formatSignature(code, symbolName, line);
  if (!sig) { return null; }

  // 轉換 FormattedSignature → 簡化字串
  const params = sig.parameters
    .map(p => {
      let str = p.name;
      if (p.optional && !p.defaultValue) { str += '?'; }
      if (p.type && p.type !== 'any') { str += `: ${p.type}`; }
      if (p.defaultValue) { str += ` = ${p.defaultValue}`; }
      return str;
    })
    .join(', ');

  return params ? `(${params}) → ${sig.returnType}` : `() → ${sig.returnType}`;
}

/**
 * 簡化簽章格式（移除函數名稱，保留參數和回傳型別）
 * 使用括號平衡算法處理巢狀泛型
 * @param signature 原始簽章字串
 * @returns 簡化後的簽章
 */
export function simplifySignature(signature: string): string {
  // 使用括號平衡算法找到參數列表的開始和結束位置
  const result = parseSignatureWithBalancing(signature);
  if (result) {
    return formatParsedSignature(result);
  }

  // Fallback：原始正則邏輯（向後相容）
  const match = signature.match(/^[^(]*\(([^)]*)\)(?:\s*:\s*(.+))?$/);
  if (match) {
    const params = match[1].trim();
    const returnType = match[2]?.trim() || 'void';
    return params ? `(${params}) → ${returnType}` : `() → ${returnType}`;
  }
  return signature;
}
