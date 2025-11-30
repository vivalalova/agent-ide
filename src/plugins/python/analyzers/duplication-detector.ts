/**
 * Python 重複代碼檢測器
 * 提取程式碼片段用於重複代碼檢測
 */

import { createHash } from 'crypto';
import type { CodeFragment } from '@infrastructure/parser/analysis-types.js';

/**
 * Python 重複代碼檢測器類別
 */
export class PythonDuplicationDetector {
  /**
   * 提取程式碼片段
   */
  extractFragments(code: string, filePath: string): CodeFragment[] {
    const fragments: CodeFragment[] = [];
    const lines = code.split('\n');

    // 提取方法級片段
    this.extractMethodFragments(code, filePath, fragments);

    // 提取常量片段
    this.extractConstantFragments(code, filePath, fragments);

    return fragments;
  }

  /**
   * 提取方法級片段
   */
  private extractMethodFragments(
    code: string,
    filePath: string,
    fragments: CodeFragment[]
  ): void {
    const lines = code.split('\n');
    let currentMethod: {
      startLine: number;
      lines: string[];
      indentLevel: number;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 檢測函式定義開始
      if (trimmedLine.startsWith('def ') || trimmedLine.startsWith('async def ')) {
        // 保存前一個方法
        if (currentMethod && currentMethod.lines.length > 3) {
          fragments.push(this.createFragment(
            currentMethod.lines.join('\n'),
            filePath,
            currentMethod.startLine,
            i - 1,
            'method'
          ));
        }

        // 開始新方法
        currentMethod = {
          startLine: i,
          lines: [trimmedLine],
          indentLevel: this.getIndentLevel(line)
        };
      } else if (currentMethod) {
        // 檢查是否仍在當前方法內
        const currentIndent = this.getIndentLevel(line);

        if (trimmedLine === '' || currentIndent > currentMethod.indentLevel) {
          currentMethod.lines.push(trimmedLine);
        } else if (currentIndent <= currentMethod.indentLevel && trimmedLine !== '') {
          // 方法結束
          if (currentMethod.lines.length > 3) {
            fragments.push(this.createFragment(
              currentMethod.lines.join('\n'),
              filePath,
              currentMethod.startLine,
              i - 1,
              'method'
            ));
          }
          currentMethod = null;

          // 檢查是否是新方法的開始
          if (trimmedLine.startsWith('def ') || trimmedLine.startsWith('async def ')) {
            currentMethod = {
              startLine: i,
              lines: [trimmedLine],
              indentLevel: this.getIndentLevel(line)
            };
          }
        }
      }
    }

    // 處理最後一個方法
    if (currentMethod && currentMethod.lines.length > 3) {
      fragments.push(this.createFragment(
        currentMethod.lines.join('\n'),
        filePath,
        currentMethod.startLine,
        lines.length - 1,
        'method'
      ));
    }
  }

  /**
   * 提取常量片段
   */
  private extractConstantFragments(
    code: string,
    filePath: string,
    fragments: CodeFragment[]
  ): void {
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 檢測常量賦值（全大寫變數名）
      const constantMatch = trimmedLine.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (constantMatch) {
        const [, name, value] = constantMatch;
        fragments.push(this.createFragment(
          trimmedLine,
          filePath,
          i,
          i,
          'constant'
        ));
      }
    }
  }

  /**
   * 創建程式碼片段
   */
  private createFragment(
    code: string,
    filePath: string,
    startLine: number,
    endLine: number,
    type: CodeFragment['type']
  ): CodeFragment {
    return {
      type,
      code,
      tokens: this.tokenize(code),
      location: {
        filePath,
        startLine,
        endLine
      },
      hash: this.hashCode(code)
    };
  }

  /**
   * 程式碼 tokenize
   */
  private tokenize(code: string): string[] {
    // 簡單的 tokenize：移除空白和註解，保留結構
    const tokens: string[] = [];

    // 移除字串內容（保留結構）
    let normalized = code.replace(/(["'])(?:(?!\1)[^\\]|\\.)*\1/g, 'STRING');

    // 移除註解
    normalized = normalized.replace(/#.*/g, '');

    // 分割為 token
    const tokenRegex = /[a-zA-Z_][a-zA-Z0-9_]*|\d+|[+\-*/%=<>!&|^~]+|[()[\]{}:,;.]/g;
    let match;

    while ((match = tokenRegex.exec(normalized)) !== null) {
      tokens.push(match[0]);
    }

    return tokens;
  }

  /**
   * 計算程式碼雜湊
   */
  private hashCode(code: string): string {
    // 正規化程式碼：移除空白和註解
    const normalized = code
      .replace(/\s+/g, ' ')
      .replace(/#.*/g, '')
      .trim();

    return createHash('md5').update(normalized).digest('hex');
  }

  /**
   * 獲取縮排層級
   */
  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    if (!match) {return 0;}

    const indent = match[1];
    // 假設使用 4 空格或 1 tab
    return Math.floor(indent.replace(/\t/g, '    ').length / 4);
  }
}
