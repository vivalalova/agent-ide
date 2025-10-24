/**
 * 命名規範檢查器
 * 檢測檔案命名和底線開頭變數
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * 命名規範檢查器
 */
export class NamingChecker {
  /**
   * 檢查檔案的命名規範問題
   */
  async check(files: string[]): Promise<number> {
    let totalIssues = 0;

    for (const file of files) {
      // 檢查檔案命名
      totalIssues += this.checkFileName(file);

      // 檢查檔案內容的變數命名
      if (this.isJavaScriptOrTypeScript(file)) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          totalIssues += this.checkVariableNaming(content);
        } catch {
          // 忽略無法讀取的檔案
        }
      }
    }

    return totalIssues;
  }

  /**
   * 檢查檔案命名是否符合 kebab-case
   */
  private checkFileName(file: string): number {
    const basename = path.basename(file, path.extname(file));

    // 排除特殊檔案（如 README、package.json 等）
    if (this.isSpecialFile(file)) {
      return 0;
    }

    // 只檢查 TypeScript/JavaScript 檔案
    if (!this.isJavaScriptOrTypeScript(file)) {
      return 0;
    }

    // 檢查是否符合 kebab-case 或 camelCase（兩者都可以接受）
    // 不符合的情況：包含大寫字母且不是 PascalCase，或包含底線
    const hasUpperCase = /[A-Z]/.test(basename);
    const hasUnderscore = basename.includes('_');

    // PascalCase 是允許的（用於類別檔案）
    const isPascalCase = /^[A-Z][a-zA-Z0-9]*$/.test(basename);
    if (isPascalCase) {
      return 0;
    }

    // kebab-case 是允許的
    const isKebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(basename);
    if (isKebabCase) {
      return 0;
    }

    // camelCase 是允許的
    const isCamelCase = /^[a-z][a-zA-Z0-9]*$/.test(basename);
    if (isCamelCase) {
      return 0;
    }

    // 其他情況視為問題（權重 1.5）
    if (hasUpperCase || hasUnderscore) {
      return 1.5;
    }

    return 0;
  }

  /**
   * 檢查變數命名（底線開頭）
   */
  private checkVariableNaming(content: string): number {
    let count = 0;

    // 檢測底線開頭的變數：const _foo、let _bar、var _baz
    const underscorePrefixPatterns = [
      /(const|let|var)\s+_[a-zA-Z]/g,
      // 類別欄位：private _field 或 _field =
      /_[a-zA-Z][a-zA-Z0-9]*\s*[:=]/g,
    ];

    for (const pattern of underscorePrefixPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }

    // 底線開頭變數權重 x2（嚴重違反規範）
    return count * 2;
  }

  /**
   * 判斷是否為特殊檔案（不檢查命名）
   */
  private isSpecialFile(file: string): boolean {
    const basename = path.basename(file);
    const specialFiles = [
      'README.md',
      'LICENSE',
      'CHANGELOG.md',
      'package.json',
      'tsconfig.json',
      '.gitignore',
      '.eslintrc',
    ];

    return specialFiles.includes(basename) || basename.startsWith('.');
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
