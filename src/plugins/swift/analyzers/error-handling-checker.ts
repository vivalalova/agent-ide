/**
 * Swift 錯誤處理檢查器
 * 檢測空 catch 區塊、try!、缺少錯誤處理的 async 函式
 */

/**
 * Swift 錯誤處理檢查器
 */
export class ErrorHandlingChecker {
  /**
   * 檢查檔案的錯誤處理問題
   */
  async check(files: string[], fileContents: Map<string, string>): Promise<number> {
    let totalIssues = 0;

    for (const file of files) {
      if (!this.isSwiftFile(file)) {
        continue;
      }

      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      // 檢測空 catch 區塊
      const emptyCatchCount = this.detectEmptyCatch(content);
      totalIssues += emptyCatchCount * 3; // 權重 x3

      // 檢測 try! 強制執行
      const forceTryMatches = content.match(/\btry!\s+/g);
      if (forceTryMatches) {
        totalIssues += forceTryMatches.length * 5; // 權重 x5（高風險）
      }

      // 檢測缺少錯誤處理的 async 函式
      const missingErrorHandlingCount = this.detectMissingErrorHandling(content);
      totalIssues += missingErrorHandlingCount * 2; // 權重 x2
    }

    return totalIssues;
  }

  /**
   * 檢測空 catch 區塊
   */
  private detectEmptyCatch(content: string): number {
    let count = 0;

    // 匹配 catch { } 或 catch { 只有註解 }
    const emptyCatchRegex = /catch\s*\{[^}]*\}/g;
    let match: RegExpExecArray | null;

    while ((match = emptyCatchRegex.exec(content)) !== null) {
      const catchBlock = match[0];

      // 提取 catch 區塊內容
      const bodyMatch = catchBlock.match(/\{([^}]*)\}/);
      if (bodyMatch) {
        const body = bodyMatch[1];

        // 移除註解
        const withoutComments = body
          .replace(/\/\/.*$/gm, '') // 單行註解
          .replace(/\/\*[\s\S]*?\*\//g, ''); // 多行註解

        // 檢查是否只有空白
        if (withoutComments.trim().length === 0) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 檢測缺少錯誤處理的 async 函式
   */
  private detectMissingErrorHandling(content: string): number {
    let count = 0;

    // 匹配 async 函式但沒有 throws
    const asyncFuncRegex = /func\s+\w+\s*\([^)]*\)\s+async\s+(?!throws)/g;
    const matches = content.match(asyncFuncRegex);

    if (matches) {
      // 檢查函式內部是否有 try
      for (const match of matches) {
        const funcStart = content.indexOf(match);
        const braceStart = content.indexOf('{', funcStart);
        const braceEnd = this.findMatchingBrace(content, braceStart);

        if (braceEnd !== -1) {
          const funcBody = content.substring(braceStart, braceEnd + 1);

          // 如果函式內有 try 但函式簽章沒有 throws，可能是問題
          if (/\btry\s+/.test(funcBody) && !/\bdo\s*\{/.test(funcBody)) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * 找到配對的右大括號
   */
  private findMatchingBrace(content: string, startPos: number): number {
    let braceCount = 1;
    let inString = false;
    let stringChar = '';

    for (let i = startPos + 1; i < content.length; i++) {
      const char = content[i];
      const prevChar = content[i - 1];

      if ((char === '"' || char === '\'') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
        continue;
      }

      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }

  /**
   * 判斷是否為 Swift 檔案
   */
  private isSwiftFile(file: string): boolean {
    return file.endsWith('.swift');
  }
}

/**
 * 預設導出檢查函式
 */
export default async function checkErrorHandling(
  files: string[],
  fileContents: Map<string, string>
): Promise<number> {
  const checker = new ErrorHandlingChecker();
  return checker.check(files, fileContents);
}
