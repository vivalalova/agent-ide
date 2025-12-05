/**
 * 統一的程式碼編輯器
 * 處理所有 TextChange 的應用，確保位置偏移正確
 */

import type { Range, Position } from '@shared/types/core.js';
import type { TextChange, FileChange } from './transform-types.js';

/**
 * 程式碼編輯器
 * 提供統一的文字變更應用機制
 */
export class CodeEditor {
  /**
   * 應用多個文字變更到內容
   * 自動處理位置偏移（從後往前應用）
   */
  applyChanges(content: string, changes: readonly TextChange[]): string {
    if (changes.length === 0) {
      return content;
    }

    // 排序：從後往前應用，避免位置偏移問題
    const sortedChanges = [...changes].sort((a, b) => {
      const lineDiff = b.range.start.line - a.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return b.range.start.column - a.range.start.column;
    });

    let result = content;

    for (const change of sortedChanges) {
      result = this.applySingleChange(result, change);
    }

    return result;
  }

  /**
   * 建立 FileChange 物件
   */
  createFileChange(filePath: string, originalContent: string, changes: readonly TextChange[]): FileChange {
    const newContent = this.applyChanges(originalContent, changes);

    return {
      filePath,
      originalContent,
      newContent,
      textChanges: changes
    };
  }

  /**
   * 計算變更的預覽（不實際應用）
   */
  previewChanges(content: string, changes: readonly TextChange[]): PreviewedChange[] {
    const lines = content.split('\n');

    return changes.map(change => {
      const startLine = change.range.start.line - 1; // 轉為 0-based
      const endLine = change.range.end.line - 1;
      const contextStart = Math.max(0, startLine - 2);
      const contextEnd = Math.min(lines.length - 1, endLine + 2);

      return {
        change,
        contextBefore: lines.slice(contextStart, startLine).join('\n'),
        affectedLines: lines.slice(startLine, endLine + 1).join('\n'),
        contextAfter: lines.slice(endLine + 1, contextEnd + 1).join('\n')
      };
    });
  }

  /**
   * 合併重疊的變更
   */
  mergeOverlappingChanges(changes: readonly TextChange[]): TextChange[] {
    if (changes.length <= 1) {
      return [...changes];
    }

    // 按位置排序
    const sorted = [...changes].sort((a, b) => {
      const lineDiff = a.range.start.line - b.range.start.line;
      if (lineDiff !== 0) {
        return lineDiff;
      }
      return a.range.start.column - b.range.start.column;
    });

    const merged: TextChange[] = [];
    let current = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];

      if (this.rangesOverlap(current.range, next.range)) {
        // 合併重疊的變更
        current = this.mergeChanges(current, next);
      } else {
        merged.push(current);
        current = next;
      }
    }

    merged.push(current);
    return merged;
  }

  /**
   * 驗證變更是否有效
   */
  validateChanges(content: string, changes: readonly TextChange[]): ValidationResult {
    const lines = content.split('\n');
    const errors: string[] = [];

    for (const change of changes) {
      // 檢查行號範圍
      if (change.range.start.line < 1 || change.range.start.line > lines.length + 1) {
        errors.push(`無效的起始行號: ${change.range.start.line}`);
      }

      if (change.range.end.line < 1 || change.range.end.line > lines.length + 1) {
        errors.push(`無效的結束行號: ${change.range.end.line}`);
      }

      // 檢查行號順序
      if (change.range.start.line > change.range.end.line) {
        errors.push(`起始行號大於結束行號: ${change.range.start.line} > ${change.range.end.line}`);
      }

      // 檢查同一行時的列號順序
      if (change.range.start.line === change.range.end.line
        && change.range.start.column > change.range.end.column) {
        errors.push(`起始列號大於結束列號: ${change.range.start.column} > ${change.range.end.column}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 應用單一變更
   */
  private applySingleChange(content: string, change: TextChange): string {
    const lines = content.split('\n');
    const startLine = change.range.start.line - 1; // 轉為 0-based
    const endLine = change.range.end.line - 1;
    const startColumn = change.range.start.column - 1;
    const endColumn = change.range.end.column - 1;

    // 處理邊界情況
    if (startLine < 0 || startLine >= lines.length) {
      return content;
    }

    // 取得要替換的範圍前後的內容
    const beforeStart = lines.slice(0, startLine).join('\n');
    const afterEnd = lines.slice(endLine + 1).join('\n');

    // 取得起始行和結束行
    const startLineContent = lines[startLine] || '';
    const endLineContent = lines[Math.min(endLine, lines.length - 1)] || '';

    // 組合新內容
    const prefix = startLineContent.substring(0, startColumn);
    const suffix = endLineContent.substring(endColumn);
    const newLineContent = prefix + change.newText + suffix;

    // 重組整個內容
    const parts: string[] = [];

    if (beforeStart) {
      parts.push(beforeStart);
    }

    parts.push(newLineContent);

    if (afterEnd) {
      parts.push(afterEnd);
    }

    return parts.join('\n');
  }

  /**
   * 檢查兩個範圍是否重疊
   */
  private rangesOverlap(a: Range, b: Range): boolean {
    // a 完全在 b 之後
    if (a.start.line > b.end.line
      || (a.start.line === b.end.line && a.start.column > b.end.column)) {
      return false;
    }

    // a 完全在 b 之前
    if (a.end.line < b.start.line
      || (a.end.line === b.start.line && a.end.column < b.start.column)) {
      return false;
    }

    return true;
  }

  /**
   * 合併兩個重疊的變更
   */
  private mergeChanges(a: TextChange, b: TextChange): TextChange {
    // 取較早的起始位置
    const start: Position = this.isPositionBefore(a.range.start, b.range.start)
      ? a.range.start
      : b.range.start;

    // 取較晚的結束位置
    const end: Position = this.isPositionBefore(a.range.end, b.range.end)
      ? b.range.end
      : a.range.end;

    return {
      range: { start, end },
      oldText: a.oldText + b.oldText, // 簡化合併
      newText: a.newText + b.newText
    };
  }

  /**
   * 比較兩個位置的先後
   */
  private isPositionBefore(a: Position, b: Position): boolean {
    if (a.line !== b.line) {
      return a.line < b.line;
    }
    return a.column < b.column;
  }
}

/**
 * 預覽變更結果
 */
export interface PreviewedChange {
  readonly change: TextChange;
  readonly contextBefore: string;
  readonly affectedLines: string;
  readonly contextAfter: string;
}

/**
 * 驗證結果
 */
interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly string[];
}

/**
 * 建立 CodeEditor 實例
 */
export function createCodeEditor(): CodeEditor {
  return new CodeEditor();
}
