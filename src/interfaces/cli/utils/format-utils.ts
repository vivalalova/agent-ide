/**
 * 格式化工具模組
 * 提供輸出格式化相關功能
 */

import * as path from 'path';
import { OutputFormatter, OutputFormat } from '../output-formatter.js';

/**
 * 格式化檔案路徑（顯示相對路徑）
 */
export function formatFilePath(filePath: string): string {
  const cwd = process.cwd();
  const relativePath = path.relative(cwd, filePath);
  return relativePath.startsWith('..') ? filePath : relativePath;
}

/**
 * 高亮匹配內容
 */
export function highlightMatch(text: string, query: string): string {
  if (!text || !query) {
    return text;
  }

  // 簡單的高亮實作
  try {
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return text.replace(regex, `[${query}]`);
  } catch {
    return text;
  }
}

/**
 * 格式化搜尋結果
 */
export function formatSearchResults(result: any, options: any): void {
  switch (options.format) {
  case 'json':
    // 測試期望的格式是 { results: [...] } 而不是 { matches: [...] }
    // 將絕對路徑轉換為相對路徑，並增加 contextBefore/contextAfter
    const resultsWithRelativePaths = result.matches.map((match: any) => {
      const formatted: any = {
        ...match,
        filePath: formatFilePath(match.file)
      };

      // 移除 'file'
      delete formatted.file;

      // 增加 contextBefore/contextAfter（測試需要這些欄位）
      if (match.context) {
        formatted.contextBefore = match.context.before || [];
        formatted.contextAfter = match.context.after || [];
      }

      return formatted;
    });
    console.log(JSON.stringify({ results: resultsWithRelativePaths }, null, 2));
    break;

  case 'minimal':
    // AI Agent 友善的最小輸出
    result.matches.forEach((match: any) => {
      console.log(`${match.file}:${match.line}:${match.column}:${match.content.trim()}`);
    });
    break;

  case 'list':
  default:
    result.matches.forEach((match: any, index: number) => {
      console.log(`\n${index + 1}. ${formatFilePath(match.file)}:${match.line}:${match.column}`);
      console.log(`   ${highlightMatch(match.content, options.query)}`);

      // 顯示上下文
      if (options.context > 0 && match.context) {
        if (match.context.before.length > 0) {
          match.context.before.forEach((line: string, i: number) => {
            const lineNum = match.line - match.context.before.length + i;
            console.log(`   ${lineNum.toString().padStart(3, ' ')}: ${line}`);
          });
        }

        console.log(`>> ${match.line.toString().padStart(3, ' ')}: ${highlightMatch(match.content, options.query)}`);

        if (match.context.after.length > 0) {
          match.context.after.forEach((line: string, i: number) => {
            const lineNum = match.line + i + 1;
            console.log(`   ${lineNum.toString().padStart(3, ' ')}: ${line}`);
          });
        }
      }
    });
    break;
  }
}

/**
 * 格式化符號搜尋結果
 */
export function formatSymbolSearchResults(results: any[], options: any): void {
  switch (options.format) {
  case 'json':
    // 轉換為測試期望的格式
    const formattedResults = results.map(result => {
      const formatted: any = {
        name: result.symbol.name,
        type: result.symbol.type,
        filePath: formatFilePath(result.symbol.location.filePath),
        line: result.symbol.location.range.start.line,
        column: result.symbol.location.range.start.column
      };

      // 只在有值時才加入可選欄位
      if ((result.symbol as any).attributes && (result.symbol as any).attributes.length > 0) {
        formatted.attributes = (result.symbol as any).attributes;
      }
      if ((result.symbol as any).modifiers && (result.symbol as any).modifiers.length > 0) {
        formatted.modifiers = (result.symbol as any).modifiers;
      }
      if ((result.symbol as any).superclass) {
        formatted.superclass = (result.symbol as any).superclass;
      }
      if ((result.symbol as any).implements && (result.symbol as any).implements.length > 0) {
        formatted.implements = (result.symbol as any).implements;
      }

      return formatted;
    });
    console.log(JSON.stringify({ results: formattedResults }, null, 2));
    break;

  case 'minimal':
    results.forEach(result => {
      const symbol = result.symbol;
      console.log(
        `${symbol.location.filePath}:${symbol.location.range.start.line}:${symbol.location.range.start.column}:${symbol.type}:${symbol.name}`
      );
    });
    break;

  case 'list':
  default:
    results.forEach((result, index) => {
      const symbol = result.symbol;
      console.log(`\n${index + 1}. ${symbol.name} (${symbol.type})`);
      console.log(`   ${formatFilePath(symbol.location.filePath)}:${symbol.location.range.start.line}:${symbol.location.range.start.column}`);

      if ((symbol as any).attributes && (symbol as any).attributes.length > 0) {
        console.log(`   屬性: ${(symbol as any).attributes.join(', ')}`);
      }
      if ((symbol as any).modifiers && (symbol as any).modifiers.length > 0) {
        console.log(`   修飾符: ${(symbol as any).modifiers.join(', ')}`);
      }
    });
    break;
  }
}

/**
 * 建立輸出格式化器
 */
export function createFormatter(format?: string): OutputFormatter {
  let outputFormat: OutputFormat;

  switch (format?.toLowerCase()) {
  case 'markdown':
    outputFormat = OutputFormat.Markdown;
    break;
  case 'json':
    outputFormat = OutputFormat.Json;
    break;
  case 'minimal':
    outputFormat = OutputFormat.Minimal;
    break;
  case 'plain':
  default:
    outputFormat = OutputFormat.Plain;
    break;
  }

  return new OutputFormatter(outputFormat);
}
