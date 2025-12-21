/**
 * 刪除操作工具
 * 負責產生刪除操作和擴展範圍
 */

import type { Range } from '@shared/types/core.js';
import type { SymbolType } from '@shared/types/symbol.js';
import type { DeadCodeItem, RemovalOperation } from './types.js';

/**
 * 檔案讀取介面
 */
export interface FileReader {
  readFile(filePath: string): Promise<string | null>;
}

/**
 * 產生刪除操作
 */
export async function generateRemovalOperations(
  items: readonly DeadCodeItem[],
  fileReader: FileReader
): Promise<{ operations: RemovalOperation[]; warnings: string[] }> {
  const operations: RemovalOperation[] = [];
  const warnings: string[] = [];

  for (const item of items) {
    const content = await fileReader.readFile(item.location.filePath);
    if (!content) {
      warnings.push(`跳過 ${item.name}：無法讀取檔案 ${item.location.filePath}`);
      continue;
    }

    // 擴展範圍以包含完整宣告（含 JSDoc 註解）
    const expandedRange = expandRangeToFullDeclaration(
      content,
      item.location.range,
      item.type
    );

    const originalCode = extractCode(content, expandedRange);

    operations.push({
      filePath: item.location.filePath,
      range: expandedRange,
      originalCode,
      symbolName: item.name,
      symbolType: item.type
    });
  }

  return { operations, warnings };
}

/**
 * 擴展範圍至完整宣告（包含前導註解和空行）
 * 使用清理後的內容進行括號匹配，避免字串/註解中的括號干擾
 */
export function expandRangeToFullDeclaration(
  content: string,
  range: Range,
  symbolType: SymbolType
): Range {
  const lines = content.split('\n');
  let startLine = range.start.line - 1; // 轉為 0-based

  // 向上擴展：包含 JSDoc 註解和裝飾器
  while (startLine > 0) {
    const prevLine = lines[startLine - 1].trim();

    // Bug #32 修復：如果遇到 JSDoc 結尾 */，繼續向上找到開始 /**
    if (prevLine.endsWith('*/')) {
      startLine--;
      // 繼續向上找到 JSDoc 開始 /**（使用 >= 0 確保第 0 行也能檢查）
      while (startLine > 0) {
        const jsdocLine = lines[startLine - 1].trim();
        if (jsdocLine.startsWith('/**')) {
          startLine--;
          break;
        }
        startLine--;
      }
      // 額外檢查第 0 行是否為 JSDoc 開始
      if (startLine === 0 && lines[0].trim().startsWith('/**')) {
        // 已經到達第 0 行，不需要再減
      }
      continue;
    }

    // 處理單行註解、裝飾器、空行、JSDoc 中間行
    if (
      prevLine.startsWith('*') ||
      prevLine.startsWith('//') ||
      prevLine.startsWith('@') ||
      prevLine === ''
    ) {
      startLine--;
    } else {
      break;
    }
  }

  // 向下擴展：確保包含完整的結尾
  let endLine = range.end.line - 1;

  // 對於 class/function，需要找到對應的結尾括號
  if (symbolType === 'class' || symbolType === 'function') {
    let braceCount = 0;
    let foundOpenBrace = false;

    for (let i = range.start.line - 1; i < lines.length; i++) {
      // 清理該行的註解和字串，避免括號誤判
      const cleanLine = removeCommentsAndStringsFromLine(lines[i]);
      for (const char of cleanLine) {
        if (char === '{') {
          braceCount++;
          foundOpenBrace = true;
        }
        if (char === '}') {
          braceCount--;
        }
      }

      if (foundOpenBrace && braceCount === 0) {
        endLine = i;
        break;
      }
    }
  }

  // 對於 variable（可能是 arrow function），只有當包含 { 時才做括號匹配
  if (symbolType === 'variable') {
    const startLineContent = lines[range.start.line - 1] || '';
    // 檢查是否包含 arrow function 的 block body
    if (startLineContent.includes('=>') && startLineContent.includes('{')) {
      let braceCount = 0;
      let foundOpenBrace = false;

      for (let i = range.start.line - 1; i < lines.length; i++) {
        const cleanLine = removeCommentsAndStringsFromLine(lines[i]);
        for (const char of cleanLine) {
          if (char === '{') {
            braceCount++;
            foundOpenBrace = true;
          }
          if (char === '}') {
            braceCount--;
          }
        }

        if (foundOpenBrace && braceCount === 0) {
          endLine = i;
          break;
        }
      }
    }
  }

  // 包含後續空行（最多一行）
  if (endLine < lines.length - 1 && lines[endLine + 1].trim() === '') {
    endLine++;
  }

  return {
    start: { line: startLine + 1, column: 1, offset: undefined },
    end: { line: endLine + 1, column: lines[endLine].length + 1, offset: undefined }
  };
}

/**
 * 提取程式碼
 */
export function extractCode(content: string, range: Range): string {
  const lines = content.split('\n');
  // 邊界檢查：確保索引在有效範圍內
  const startLine = Math.max(0, Math.min(range.start.line - 1, lines.length - 1));
  const endLine = Math.max(0, Math.min(range.end.line - 1, lines.length - 1));

  if (startLine === endLine) {
    const line = lines[startLine] || '';
    return line.substring(range.start.column - 1, range.end.column - 1);
  }

  const result: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i] || '';
    if (i === startLine) {
      result.push(line.substring(range.start.column - 1));
    } else if (i === endLine) {
      result.push(line.substring(0, range.end.column - 1));
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * 移除註解和字串，用於準確檢測符號使用
 */
export function removeCommentsAndStrings(content: string): string {
  let result = content;

  // 移除多行註解 /* ... */
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  // 移除單行註解 // ...
  result = result.replace(/\/\/[^\n]*/g, '');

  // 移除模板字串 `...`（簡化處理，不處理嵌套）
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');

  // 移除雙引號字串 "..."
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');

  // 移除單引號字串 '...'
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'');

  return result;
}

/**
 * 移除單行中的註解和字串（用於括號匹配）
 */
export function removeCommentsAndStringsFromLine(line: string): string {
  let result = line;

  // 移除單行註解 // ...
  const commentIndex = result.indexOf('//');
  if (commentIndex !== -1) {
    // 確保 // 不在字串中
    const beforeComment = result.substring(0, commentIndex);
    const quoteCount = (beforeComment.match(/['"]/g) || []).length;
    if (quoteCount % 2 === 0) {
      result = beforeComment;
    }
  }

  // 移除字串（簡化處理）
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, '\'\'');
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, '""');

  return result;
}
