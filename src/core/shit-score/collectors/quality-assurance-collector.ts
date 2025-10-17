/**
 * 品質保證資料收集器
 * 整合 5 個 Checker 並行執行
 */

import type { QualityAssuranceData } from '../types.js';
import { TypeSafetyChecker } from './type-safety-checker.js';
import { TestCoverageChecker } from './test-coverage-checker.js';
import { ErrorHandlingChecker } from './error-handling-checker.js';
import { NamingChecker } from './naming-checker.js';
import { SecurityChecker } from './security-checker.js';

/**
 * 品質保證資料收集器
 */
export class QualityAssuranceCollector {
  constructor(
    private readonly typeSafetyChecker: TypeSafetyChecker,
    private readonly testCoverageChecker: TestCoverageChecker,
    private readonly errorHandlingChecker: ErrorHandlingChecker,
    private readonly namingChecker: NamingChecker,
    private readonly securityChecker: SecurityChecker
  ) {}

  /**
   * 收集品質保證資料
   */
  async collect(files: string[], projectRoot: string): Promise<QualityAssuranceData> {
    // 並行執行所有 Checker
    const [typeSafetyResult, testCoverageRatio, errorHandlingIssues, namingIssues, securityIssues] =
      await Promise.all([
        this.typeSafetyChecker.check(files, projectRoot),
        this.testCoverageChecker.calculate(files, projectRoot),
        this.errorHandlingChecker.check(files),
        this.namingChecker.check(files),
        this.securityChecker.check(files),
      ]);

    // 計算型別安全問題總數
    const typeSafetyIssues =
      typeSafetyResult.anyTypeCount +
      typeSafetyResult.tsIgnoreCount * 2 + // @ts-ignore 權重 x2
      typeSafetyResult.asAnyCount * 1.5; // as any 權重 x1.5

    return {
      totalFiles: files.length,
      typeSafetyIssues: Math.round(typeSafetyIssues),
      testCoverageRatio,
      errorHandlingIssues,
      namingIssues,
      securityIssues,
      strictModeEnabled: typeSafetyResult.strictModeEnabled,
      strictNullChecksEnabled: typeSafetyResult.strictNullChecksEnabled,
    };
  }
}
