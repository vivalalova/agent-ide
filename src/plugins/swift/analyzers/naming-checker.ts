/**
 * Swift 命名規範檢查器
 * 檢測命名規範：Types 用 PascalCase、variables/functions 用 camelCase、Constants 用 camelCase 或 UPPER_CASE
 * 禁止底線開頭（除了 private）
 */

/**
 * Swift 命名規範檢查器
 */
export class NamingChecker {
  /**
   * 檢查檔案的命名規範問題
   */
  async check(files: string[], fileContents: Map<string, string>): Promise<number> {
    let totalIssues = 0;

    for (const file of files) {
      if (!this.isSwiftFile(file)) {
        continue;
      }

      // 檢查檔案命名
      totalIssues += this.checkFileName(file);

      const content = fileContents.get(file);
      if (!content) {
        continue;
      }

      // 檢查程式碼命名
      totalIssues += this.checkCodeNaming(content);
    }

    return totalIssues;
  }

  /**
   * 檢查檔案命名（Swift 檔案應該是 PascalCase）
   */
  private checkFileName(file: string): number {
    const basename = file.split('/').pop() || '';
    const nameWithoutExt = basename.replace('.swift', '');

    // 排除特殊檔案
    if (this.isSpecialFile(basename)) {
      return 0;
    }

    // Swift 檔案名應該是 PascalCase
    const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(nameWithoutExt);
    if (!isPascalCase) {
      return 1.5; // 權重 1.5
    }

    return 0;
  }

  /**
   * 檢查程式碼命名規範
   */
  private checkCodeNaming(content: string): number {
    let count = 0;

    // 檢查 Type 命名（class, struct, protocol, enum）
    count += this.checkTypeNaming(content);

    // 檢查變數和函式命名
    count += this.checkVariableAndFunctionNaming(content);

    // 檢查底線開頭（非 private）
    count += this.checkUnderscorePrefix(content);

    return count;
  }

  /**
   * 檢查 Type 命名（應該是 PascalCase）
   */
  private checkTypeNaming(content: string): number {
    let count = 0;

    const typePatterns = [
      /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /protocol\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /enum\s+([a-zA-Z_][a-zA-Z0-9_]*)/g
    ];

    for (const pattern of typePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const typeName = match[1];

        // 檢查是否為 PascalCase
        if (!/^[A-Z][a-zA-Z0-9]*$/.test(typeName)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * 檢查變數和函式命名（應該是 camelCase）
   */
  private checkVariableAndFunctionNaming(content: string): number {
    let count = 0;

    // 函式命名
    const funcRegex = /func\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let match: RegExpExecArray | null;

    while ((match = funcRegex.exec(content)) !== null) {
      const funcName = match[1];

      // 檢查是否為 camelCase（首字母小寫）
      if (!/^[a-z][a-zA-Z0-9]*$/.test(funcName)) {
        count++;
      }
    }

    // 變數命名（let、var）
    const varRegex = /(let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
    while ((match = varRegex.exec(content)) !== null) {
      const varName = match[2];

      // 允許 UPPER_CASE 常數
      const isUpperCase = /^[A-Z][A-Z0-9_]*$/.test(varName);
      const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(varName);

      if (!isUpperCase && !isCamelCase) {
        count++;
      }
    }

    return count;
  }

  /**
   * 檢查底線開頭（非 private 不應該底線開頭）
   */
  private checkUnderscorePrefix(content: string): number {
    let count = 0;
    const lines = content.split('\n');

    for (const line of lines) {
      // 跳過 private 宣告（允許底線開頭）
      if (/\bprivate\b/.test(line)) {
        continue;
      }

      // 檢測底線開頭的變數或函式
      const underscorePatterns = [
        /(let|var)\s+_[a-zA-Z]/g,
        /func\s+_[a-zA-Z]/g
      ];

      for (const pattern of underscorePatterns) {
        const matches = line.match(pattern);
        if (matches) {
          count += matches.length * 2; // 權重 x2
        }
      }
    }

    return count;
  }

  /**
   * 判斷是否為特殊檔案
   */
  private isSpecialFile(filename: string): boolean {
    const specialFiles = [
      'Package.swift',
      'README.md',
      'LICENSE'
    ];

    return specialFiles.includes(filename);
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
export default async function checkNaming(
  files: string[],
  fileContents: Map<string, string>
): Promise<number> {
  const checker = new NamingChecker();
  return checker.check(files, fileContents);
}
