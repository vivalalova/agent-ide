/**
 * 測試覆蓋率檢查器
 * 計算測試檔案比例（靜態分析）
 */

import * as path from 'path';

/**
 * 測試覆蓋率檢查器
 */
export class TestCoverageChecker {
  /**
   * 計算測試覆蓋率（測試檔案比例）
   */
  async calculate(files: string[], _projectRoot: string): Promise<number> {
    // 過濾出源碼檔案和測試檔案
    const sourceFiles = files.filter((file) => this.isSourceFile(file));
    const testFiles = files.filter((file) => this.isTestFile(file));

    if (sourceFiles.length === 0) {
      return 0;
    }

    // 計算測試覆蓋率（測試檔案數 / 源碼檔案數）
    const coverageRatio = testFiles.length / sourceFiles.length;

    // 回傳 0-1 的比例
    return Math.min(coverageRatio, 1);
  }

  /**
   * 判斷是否為源碼檔案
   */
  private isSourceFile(file: string): boolean {
    // TypeScript/JavaScript 檔案
    const ext = path.extname(file);
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      return false;
    }

    // 排除測試檔案
    if (this.isTestFile(file)) {
      return false;
    }

    // 排除測試目錄
    if (file.includes('/tests/') || file.includes('/__tests__/') || file.includes('/test/')) {
      return false;
    }

    return true;
  }

  /**
   * 判斷是否為測試檔案
   */
  private isTestFile(file: string): boolean {
    const basename = path.basename(file);

    // 常見的測試檔案命名模式
    return (
      basename.endsWith('.test.ts') ||
      basename.endsWith('.test.tsx') ||
      basename.endsWith('.test.js') ||
      basename.endsWith('.test.jsx') ||
      basename.endsWith('.spec.ts') ||
      basename.endsWith('.spec.tsx') ||
      basename.endsWith('.spec.js') ||
      basename.endsWith('.spec.jsx') ||
      basename.endsWith('.e2e.test.ts') ||
      basename.endsWith('.e2e.test.js')
    );
  }
}
