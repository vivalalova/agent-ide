/**
 * 文字搜尋引擎實作
 * 提供高效的文字搜尋功能，支援正則表達式、模糊匹配等
 */

import { readFile } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

import type {
  TextQuery,
  TextSearchOptions,
  SearchResult,
  Match,
  MatchContext,
  SearchScope
} from '../types.js';

/**
 * 文字搜尋引擎
 */
export class TextSearchEngine {
  private readonly defaultOptions: Required<TextSearchOptions> = {
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    multiline: false,
    fuzzy: false,
    invert: false,
    scope: { type: 'project' },
    includeFiles: [],
    excludeFiles: [],
    maxResults: 1000,
    timeout: 30000,
    useIndex: false,
    showContext: true,
    contextLines: 2
  };

  /**
   * 執行文字搜尋
   */
  async search(query: TextQuery): Promise<SearchResult> {
    const startTime = performance.now();
    const options = { ...this.defaultOptions, ...query.options };

    try {
      // 1. 獲取要搜尋的檔案列表
      const files = await this.getSearchFiles(options.scope, options);

      // 2. 執行搜尋
      const matches: Match[] = [];
      let totalCount = 0;
      let regexError: Error | null = null;

      // 確保 query.query 是字符串
      const searchQuery = typeof query.query === 'string' ? query.query : String(query.query || '');

      // 如果是正則表達式模式，先驗證正則表達式
      if (options.regex) {
        try {
          this.buildSearchRegex(searchQuery, options);
        } catch (error) {
          throw error;  // 直接拋出正則表達式錯誤
        }
      }

      for (const filePath of files) {
        // 檢查是否超時
        if (performance.now() - startTime > options.timeout) {
          break;
        }

        // 檢查是否達到最大結果數
        if (matches.length >= options.maxResults) {
          break;
        }

        try {
          const fileMatches = await this.searchInFile(filePath, searchQuery, options);
          matches.push(...fileMatches.slice(0, options.maxResults - matches.length));
          totalCount += fileMatches.length;
        } catch (error) {
          console.warn(`搜尋檔案失敗 ${filePath}:`, error);
          continue;
        }
      }

      // 3. 排序結果
      const sortedMatches = this.sortMatches(matches, searchQuery);

      const searchTime = Math.round(performance.now() - startTime);
      const truncated = totalCount > options.maxResults;

      return {
        matches: sortedMatches,
        totalCount,
        searchTime,
        truncated
      };

    } catch (error) {
      throw new Error(`文字搜尋失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 在單個檔案中搜尋
   */
  private async searchInFile(
    filePath: string,
    query: string,
    options: Required<TextSearchOptions>
  ): Promise<Match[]> {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const matches: Match[] = [];

    // 建立搜尋正則表達式
    const searchRegex = this.buildSearchRegex(query, options);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      let match: RegExpExecArray | null;

      // 重置正則表達式
      searchRegex.lastIndex = 0;

      while ((match = searchRegex.exec(line)) !== null) {
        const matchObj: Match = {
          file: filePath,
          line: lineIndex + 1, // 從 1 開始計數
          column: match.index + 1, // 從 1 開始計數
          content: match[0],
          context: this.buildContext(lines, lineIndex, options.contextLines),
          score: this.calculateScore(match[0], query, line),
          length: match[0].length,
          range: {
            start: {
              line: lineIndex + 1,
              column: match.index + 1,
              offset: this.calculateOffset(lines, lineIndex, match.index)
            },
            end: {
              line: lineIndex + 1,
              column: match.index + match[0].length + 1,
              offset: this.calculateOffset(lines, lineIndex, match.index + match[0].length)
            }
          }
        };

        matches.push(matchObj);

        // 避免無限迴圈
        if (!searchRegex.global) {
          break;
        }
      }
    }

    // 處理反向搜尋
    if (options.invert) {
      return matches.length === 0 ? [{
        file: filePath,
        line: 1,
        column: 1,
        content: '(檔案不包含搜尋模式)',
        context: this.buildContext(lines, 0, 0),
        score: 1.0,
        length: 0,
        range: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 1, offset: 0 }
        }
      }] : [];
    }

    return matches;
  }

  /**
   * 建立搜尋正則表達式
   */
  private buildSearchRegex(query: string, options: Required<TextSearchOptions>): RegExp {
    // 確保 query 是字符串
    if (typeof query !== 'string') {
      throw new Error('搜尋模式必須是字符串');
    }

    // 處理空字符串
    if (query === '') {
      // 空查詢不匹配任何內容
      return new RegExp('(?!.*)', 'g');
    }

    let pattern = query;
    let flags = 'g'; // 總是使用全域搜尋

    if (!options.caseSensitive) {
      flags += 'i';
    }

    if (options.multiline) {
      flags += 'm';
    }

    if (!options.regex) {
      // 轉義正則表達式特殊字符
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    if (options.wholeWord) {
      pattern = `\\b${pattern}\\b`;
    }

    if (options.fuzzy) {
      // 簡單的模糊匹配：允許字符間有其他字符
      pattern = pattern.split('').join('.*?');
    }

    try {
      return new RegExp(pattern, flags);
    } catch (error) {
      throw new Error(`無效的搜尋模式: ${pattern}`);
    }
  }

  /**
   * 建立匹配上下文
   */
  private buildContext(
    lines: string[],
    lineIndex: number,
    contextLines: number
  ): MatchContext {
    const before: string[] = [];
    const after: string[] = [];

    // 獲取前面的行
    for (let i = Math.max(0, lineIndex - contextLines); i < lineIndex; i++) {
      before.push(lines[i]);
    }

    // 獲取後面的行
    for (let i = lineIndex + 1; i <= Math.min(lines.length - 1, lineIndex + contextLines); i++) {
      after.push(lines[i]);
    }

    return {
      before,
      after,
      function: this.findEnclosingFunction(lines, lineIndex),
      class: this.findEnclosingClass(lines, lineIndex)
    };
  }

  /**
   * 尋找包圍的函式名稱
   */
  private findEnclosingFunction(lines: string[], lineIndex: number): string | undefined {
    // 簡單的函式檢測正則表達式
    const functionPattern = /(?:function\s+(\w+)|(\w+)\s*(?:\([^)]*\))?\s*(?:=>|{))/;

    for (let i = lineIndex; i >= 0; i--) {
      const match = lines[i].match(functionPattern);
      if (match) {
        return match[1] || match[2];
      }
    }

    return undefined;
  }

  /**
   * 尋找包圍的類別名稱
   */
  private findEnclosingClass(lines: string[], lineIndex: number): string | undefined {
    // 簡單的類別檢測正則表達式
    const classPattern = /class\s+(\w+)/;

    for (let i = lineIndex; i >= 0; i--) {
      const match = lines[i].match(classPattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * 計算字符偏移量
   */
  private calculateOffset(lines: string[], lineIndex: number, columnIndex: number): number {
    let offset = 0;

    // 加上前面所有行的長度（包括換行字符）
    for (let i = 0; i < lineIndex; i++) {
      offset += lines[i].length + 1; // +1 for newline character
    }

    // 加上當前行的偏移
    offset += columnIndex;

    return offset;
  }

  /**
   * 計算匹配分數
   */
  private calculateScore(match: string, query: string, line: string): number {
    let score = 0;

    // 1. 精確匹配得分更高
    if (match === query) {
      score += 1.0;
    } else if (match.toLowerCase() === query.toLowerCase()) {
      score += 0.8;
    } else {
      score += 0.5;
    }

    // 2. 匹配長度比例
    score += (match.length / query.length) * 0.2;

    // 3. 在行中的位置（行首得分更高）
    const position = line.indexOf(match);
    score += (1.0 - (position / line.length)) * 0.2;

    // 4. 行長度（短行得分更高，通常更相關）
    score += (1.0 - Math.min(line.length / 200, 1.0)) * 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * 排序匹配結果
   */
  private sortMatches(matches: Match[], query: string): Match[] {
    return matches.sort((a, b) => {
      // 首先按分數排序（高到低）
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      // 然後按檔案名稱排序
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }

      // 最後按行號排序
      return a.line - b.line;
    });
  }

  /**
   * 獲取要搜尋的檔案列表
   */
  private async getSearchFiles(
    scope: SearchScope,
    options: Required<TextSearchOptions>
  ): Promise<string[]> {
    let searchPath: string;
    let pattern: string;

    switch (scope.type) {
      case 'file':
        return scope.path ? [scope.path] : [];

      case 'directory':
        searchPath = scope.path || process.cwd();
        pattern = scope.recursive !== false ? '**/*' : '*';  // 預設遞迴搜尋
        break;

      case 'project':
      case 'workspace':
        searchPath = scope.path || process.cwd();
        pattern = '**/*';
        break;

      default:
        throw new Error(`不支援的搜尋範圍類型: ${scope.type}`);
    }

    // 使用 glob 找出檔案
    const globPattern = path.join(searchPath, pattern);
    let files = await glob(globPattern, {
      ignore: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.git/**',
        '**/coverage/**',
        '**/*.min.js',
        '**/*.min.css'
      ],
      nodir: true
    });

    // 過濾檔案類型
    files = files.filter(file => {
      // 只搜尋文字檔案
      const ext = path.extname(file).toLowerCase();
      const textExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.txt',
        '.css', '.scss', '.sass', '.less', '.html', '.xml',
        '.vue', '.svelte', '.py', '.java', '.c', '.cpp', '.h',
        '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt'
      ];

      return textExtensions.includes(ext);
    });

    // 應用包含過濾器
    if (options.includeFiles && options.includeFiles.length > 0) {
      const includePatterns = options.includeFiles.map(p => {
        // 將 glob 模式轉換為正則表達式
        const regexPattern = p
          .replace(/\./g, '\\.')  // 轉義點
          .replace(/\*/g, '.*')     // * 轉換為 .*
          .replace(/\?/g, '.');     // ? 轉換為 .
        return new RegExp(regexPattern + '$');  // 加上結束符
      });
      files = files.filter(file =>
        includePatterns.some(pattern => pattern.test(file))
      );
    }

    // 應用排除過濾器
    if (options.excludeFiles && options.excludeFiles.length > 0) {
      const excludePatterns = options.excludeFiles.map(p => {
        // 將 glob 模式轉換為正則表達式
        const regexPattern = p
          .replace(/\./g, '\\.')  // 轉義點
          .replace(/\*/g, '.*')     // * 轉換為 .*
          .replace(/\?/g, '.');     // ? 轉換為 .
        return new RegExp(regexPattern + '$');  // 加上結束符
      });
      files = files.filter(file => {
        const fileName = path.basename(file);
        return !excludePatterns.some(pattern => pattern.test(fileName));
      });
    }

    // 限制最大深度
    if (scope.maxDepth !== undefined) {
      const basePath = path.resolve(searchPath);
      files = files.filter(file => {
        const relativePath = path.relative(basePath, file);
        const depth = relativePath.split(path.sep).length - 1;
        return depth <= scope.maxDepth!;
      });
    }

    return files;
  }
}