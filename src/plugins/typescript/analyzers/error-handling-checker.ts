/**
 * 錯誤處理檢查器
 * 檢測空 catch 區塊和靜默吞錯
 */

import * as fs from 'fs/promises';

/**
 * 錯誤處理檢查器
 */
export class ErrorHandlingChecker {
  /**
   * 檢查檔案的錯誤處理問題
   */
  async check(files: string[]): Promise<number> {
    let totalIssues = 0;

    for (const file of files) {
      if (!this.isJavaScriptOrTypeScript(file)) {
        continue;
      }

      try {
        const content = await fs.readFile(file, 'utf-8');

        // 檢測空 catch 區塊：catch() {} 或 catch(e) {}
        const emptyCatchMatches = content.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
        if (emptyCatchMatches) {
          totalIssues += emptyCatchMatches.length * 3; // 空 catch 權重 x3
        }

        // 檢測靜默吞錯：catch 內只有註解
        const silentCatchCount = this.detectSilentCatch(content);
        totalIssues += silentCatchCount * 2; // 靜默吞錯權重 x2
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    return totalIssues;
  }

  /**
   * 檢測靜默吞錯（catch 內只有註解，無實際處理）
   */
  private detectSilentCatch(content: string): number {
    let count = 0;

    // 正則：catch 區塊內只有 // ignore、/* skip */、TODO 等註解
    const silentPatterns = [
      /catch\s*\([^)]*\)\s*\{[^}]*\/\/\s*ignore[^}]*\}/gi,
      /catch\s*\([^)]*\)\s*\{[^}]*\/\*[^}]*ignore[^}]*\*\/[^}]*\}/gi,
      /catch\s*\([^)]*\)\s*\{[^}]*\/\*[^}]*skip[^}]*\*\/[^}]*\}/gi,
      /catch\s*\([^)]*\)\s*\{[^}]*\/\/\s*TODO[^}]*\}/gi,
    ];

    for (const pattern of silentPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // 進一步驗證：確保 catch 內只有註解，沒有其他語句
        for (const match of matches) {
          if (this.isOnlyComment(match)) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * 判斷 catch 區塊是否只有註解
   */
  private isOnlyComment(catchBlock: string): boolean {
    // 移除 catch(...) { 和 }
    const body = catchBlock.replace(/catch\s*\([^)]*\)\s*\{/, '').replace(/\}$/, '');

    // 移除所有註解
    const withoutComments = body
      .replace(/\/\/.*$/gm, '') // 單行註解
      .replace(/\/\*[\s\S]*?\*\//g, ''); // 多行註解

    // 檢查剩下的內容是否只有空白
    return withoutComments.trim().length === 0;
  }

  /**
   * 判斷是否為 JavaScript 或 TypeScript 檔案
   */
  private isJavaScriptOrTypeScript(file: string): boolean {
    return (
      file.endsWith('.ts') ||
      file.endsWith('.tsx') ||
      file.endsWith('.js') ||
      file.endsWith('.jsx')
    );
  }
}
