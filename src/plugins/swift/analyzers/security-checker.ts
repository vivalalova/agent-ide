/**
 * Swift 安全性檢查器
 * 檢測硬編碼密碼、API Key、UserDefaults 儲存敏感資料、非 HTTPS 請求
 */

/**
 * Swift 安全性檢查器
 */
export class SecurityChecker {
  /**
   * 檢查檔案的安全性問題
   */
  async check(files: string[], fileContents: Map<string, string>): Promise<number> {
    let criticalIssues = 0; // 關鍵安全問題
    let highIssues = 0; // 高風險問題
    let mediumIssues = 0; // 中風險問題

    for (const file of files) {
      if (!this.isSwiftFile(file)) {
        continue;
      }

      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      // 關鍵問題：硬編碼密碼和金鑰
      criticalIssues += this.checkHardcodedSecrets(content);

      // 高風險：UserDefaults 儲存敏感資料
      highIssues += this.checkUserDefaultsSecrets(content);

      // 高風險：非 HTTPS 請求
      highIssues += this.checkInsecureHTTP(content);

      // 中風險：print 包含敏感資訊
      mediumIssues += this.checkPrintSecrets(content);
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
      /let\s+password\s*=\s*"[^"]+"/gi,
      /var\s+password\s*=\s*"[^"]+"/gi,
      /let\s+apiKey\s*=\s*"[^"]+"/gi,
      /var\s+apiKey\s*=\s*"[^"]+"/gi,
      /let\s+secretKey\s*=\s*"[^"]+"/gi,
      /var\s+secretKey\s*=\s*"[^"]+"/gi
    ];

    for (const pattern of passwordPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        // 排除環境變數（ProcessInfo.processInfo.environment）
        for (const match of matches) {
          if (!match.includes('ProcessInfo') && !match.includes('environment')) {
            count++;
          }
        }
      }
    }

    return count;
  }

  /**
   * 檢測 UserDefaults 儲存敏感資料
   */
  private checkUserDefaultsSecrets(content: string): number {
    let count = 0;

    // UserDefaults 儲存敏感資料模式
    const userDefaultsPatterns = [
      /UserDefaults\..*\.set\([^)]*password[^)]*\)/gi,
      /UserDefaults\..*\.set\([^)]*token[^)]*\)/gi,
      /UserDefaults\..*\.set\([^)]*apiKey[^)]*\)/gi,
      /UserDefaults\..*\.set\([^)]*secret[^)]*\)/gi
    ];

    for (const pattern of userDefaultsPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * 檢測不安全的 HTTP 請求（非 HTTPS）
   */
  private checkInsecureHTTP(content: string): number {
    let count = 0;

    // HTTP URL 模式（不是 HTTPS）
    const httpPattern = /["']http:\/\/[^"']+["']/g;
    const matches = content.match(httpPattern);

    if (matches) {
      // 排除 localhost 和常見測試 URL
      for (const match of matches) {
        if (!match.includes('localhost') && !match.includes('127.0.0.1')) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 檢測 print 包含敏感資訊
   */
  private checkPrintSecrets(content: string): number {
    let count = 0;

    // print 包含敏感關鍵字
    const sensitivePatterns = [
      /print\([^)]*password[^)]*\)/gi,
      /print\([^)]*token[^)]*\)/gi,
      /print\([^)]*apiKey[^)]*\)/gi,
      /print\([^)]*secret[^)]*\)/gi
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
   * 判斷是否為 Swift 檔案
   */
  private isSwiftFile(file: string): boolean {
    return file.endsWith('.swift');
  }
}

/**
 * 預設導出檢查函式
 */
export default async function checkSecurity(
  files: string[],
  fileContents: Map<string, string>
): Promise<number> {
  const checker = new SecurityChecker();
  return checker.check(files, fileContents);
}
