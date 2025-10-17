/**
 * 安全性檢查器
 * 檢測硬編碼密碼、API Key、eval、innerHTML 等安全風險
 */

import * as fs from 'fs/promises';

/**
 * 安全性檢查器
 */
export class SecurityChecker {
  /**
   * 檢查檔案的安全性問題
   */
  async check(files: string[]): Promise<number> {
    let criticalIssues = 0; // 關鍵安全問題
    let highIssues = 0; // 高風險問題
    let mediumIssues = 0; // 中風險問題

    for (const file of files) {
      if (!this.isJavaScriptOrTypeScript(file)) {
        continue;
      }

      try {
        const content = await fs.readFile(file, 'utf-8');

        // 關鍵問題：硬編碼密碼和金鑰
        criticalIssues += this.checkHardcodedSecrets(content);

        // 關鍵問題：eval 使用
        criticalIssues += this.checkEvalUsage(content);

        // 高風險：innerHTML 使用
        highIssues += this.checkInnerHTMLUsage(content);

        // 中風險：console.log 包含敏感資訊
        mediumIssues += this.checkConsoleLogSecrets(content);
      } catch {
        // 忽略無法讀取的檔案
      }
    }

    // 計算總分（關鍵問題權重最高）
    return criticalIssues * 5 + highIssues * 3 + mediumIssues;
  }

  /**
   * 檢測硬編碼的密碼和 API Key
   */
  private checkHardcodedSecrets(content: string): number {
    let count = 0;

    // 硬編碼密碼模式
    const passwordPatterns = [
      /password\s*=\s*['"][^'"]+['"]/gi,
      /dbPassword\s*=\s*['"][^'"]+['"]/gi,
      /userPassword\s*=\s*['"][^'"]+['"]/gi,
    ];

    // API Key 模式
    const apiKeyPatterns = [
      /apiKey\s*=\s*['"][^'"]+['"]/gi,
      /secretKey\s*=\s*['"][^'"]+['"]/gi,
      /api_key\s*=\s*['"][^'"]+['"]/gi,
    ];

    // 檢測密碼
    for (const pattern of passwordPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // 排除環境變數（process.env.PASSWORD）
        for (const match of matches) {
          if (!match.includes('process.env') && !match.includes('env.')) {
            count++;
          }
        }
      }
    }

    // 檢測 API Key
    for (const pattern of apiKeyPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // 排除環境變數
        for (const match of matches) {
          if (!match.includes('process.env') && !match.includes('env.')) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * 檢測 eval 使用
   */
  private checkEvalUsage(content: string): number {
    const evalMatches = content.match(/\beval\s*\(/g);
    return evalMatches ? evalMatches.length : 0;
  }

  /**
   * 檢測 innerHTML 使用（XSS 風險）
   */
  private checkInnerHTMLUsage(content: string): number {
    const innerHTMLMatches = content.match(/\.innerHTML\s*=/g);
    return innerHTMLMatches ? innerHTMLMatches.length : 0;
  }

  /**
   * 檢測 console.log 包含敏感資訊
   */
  private checkConsoleLogSecrets(content: string): number {
    let count = 0;

    // 檢測 console.log 包含 password、token、secret 等關鍵字
    const sensitivePatterns = [
      /console\.log\([^)]*password[^)]*\)/gi,
      /console\.log\([^)]*token[^)]*\)/gi,
      /console\.log\([^)]*secret[^)]*\)/gi,
      /console\.log\([^)]*apiKey[^)]*\)/gi,
    ];

    for (const pattern of sensitivePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
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
