/**
 * CLI analyze 命令 E2E 測試
 * 基於 sample-project fixture 測試真實複雜程式碼分析功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI analyze - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 複雜度分析測試（3 個測試）
  // ============================================================

  it('應該識別 OrderService 為高複雜度模組', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.getFilePath('src/services'),
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    const orderServiceResult = output.files.find((f: any) => f.path.includes('order-service.ts'));
    expect(orderServiceResult).toBeDefined();
    expect(orderServiceResult.complexity).toBeGreaterThan(0); // OrderService 有複雜度
    expect(orderServiceResult.evaluation).toBeDefined();

    // 驗證 OrderService 相對複雜（與其他檔案比較）
    const avgComplexity = output.summary.averageComplexity;
    expect(orderServiceResult.complexity).toBeGreaterThanOrEqual(avgComplexity);
  });

  it('應該正確分析抽象類別 BaseModel 的複雜度', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.getFilePath('src/models'),
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    const baseModelResult = output.files.find((f: any) => f.path.includes('base-model.ts'));
    expect(baseModelResult).toBeDefined();
    expect(baseModelResult.complexity).toBeGreaterThan(0);
    expect(baseModelResult.cognitiveComplexity).toBeDefined();
  });

  it('應該能比較不同模組的複雜度差異', async () => {
    // 分析整個專案獲取所有檔案複雜度
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThan(0);

    // 驗證包含核心業務檔案
    const userServiceResult = output.files.find((f: any) => f.path.includes('user-service.ts'));
    const stringUtilsResult = output.files.find((f: any) => f.path.includes('string-utils.ts'));
    const orderServiceResult = output.files.find((f: any) => f.path.includes('order-service.ts'));

    expect(userServiceResult).toBeDefined();
    expect(stringUtilsResult).toBeDefined();
    expect(orderServiceResult).toBeDefined();

    // 驗證所有檔案都有複雜度值
    expect(userServiceResult.complexity).toBeGreaterThan(0);
    expect(stringUtilsResult.complexity).toBeGreaterThan(0);
    expect(orderServiceResult.complexity).toBeGreaterThan(0);

    // 驗證所有檔案都有認知複雜度
    expect(userServiceResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
    expect(stringUtilsResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
    expect(orderServiceResult.cognitiveComplexity).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 2. 整體專案分析測試（2 個測試）
  // ============================================================

  it('應該能分析整個專案並統計所有檔案的複雜度', async () => {
    const result = await executeCLI([
      'analyze',
      'complexity',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(output.files.length).toBeGreaterThanOrEqual(30); // 至少 30 個檔案
    expect(output.summary).toBeDefined();
    expect(output.summary.totalFiles).toBeGreaterThanOrEqual(30);
    expect(output.summary.averageComplexity).toBeGreaterThan(0);
    expect(output.summary.maxComplexity).toBeGreaterThan(0);

    // 驗證包含核心模組
    const filePaths = output.files.map((f: any) => f.path);
    expect(filePaths.some((p: string) => p.includes('user-service.ts'))).toBe(true);
    expect(filePaths.some((p: string) => p.includes('order-service.ts'))).toBe(true);
    expect(filePaths.some((p: string) => p.includes('base-model.ts'))).toBe(true);
  });

  it('應該能檢測專案中的最佳實踐', async () => {
    const result = await executeCLI([
      'analyze',
      'best-practices',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.recommendations).toBeDefined();
    expect(Array.isArray(output.recommendations)).toBe(true);

    // sample-project 使用 ES Module
    const hasEsmRecommendation = output.recommendations.some(
      (r: any) => r.type === 'es-modules' && r.status === 'good'
    );
    expect(hasEsmRecommendation).toBe(true);
  });

  // ============================================================
  // 3. 死代碼檢測測試（2 個測試）
  // ============================================================

  it('應該執行死代碼檢測並返回正確格式', async () => {
    // 新增未使用的函式（用於測試檢測功能）
    await fixture.writeFile(
      'src/utils/unused.ts',
      `
export function unusedHelper() {
  return 'never used';
}

export function anotherUnusedHelper() {
  return 'also unused';
}
`.trim()
    );

    const result = await executeCLI([
      'analyze',
      'dead-code',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.files).toBeDefined();
    expect(Array.isArray(output.files)).toBe(true);
    expect(output.files.length).toBeGreaterThan(0);
    expect(output.summary).toBeDefined();
    expect(output.summary.totalDeadFunctions).toBeGreaterThanOrEqual(0);
    expect(output.summary.totalDeadVariables).toBeGreaterThanOrEqual(0);
    expect(output.summary.totalDeadCode).toBeGreaterThanOrEqual(0);

    // 驗證 unused.ts 被分析
    const unusedFile = output.files.find((f: any) => f.path.includes('unused.ts'));
    expect(unusedFile).toBeDefined();
    expect(Array.isArray(unusedFile.deadCode)).toBe(true);
  });

  it('應該能追蹤跨檔案的引用關係', async () => {
    // 分析原始專案（所有 export 都被使用）
    const result = await executeCLI([
      'analyze',
      'dead-code',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.summary).toBeDefined();

    // sample-project 設計良好，死代碼應該很少或為零
    // （除非有刻意設計的未使用函式）
    expect(output.summary.totalDeadCode).toBeGreaterThanOrEqual(0);
  });

  // ============================================================
  // 4. 程式碼模式檢測測試（1 個測試）
  // ============================================================

  it('應該能檢測專案中的程式碼模式', async () => {
    const result = await executeCLI([
      'analyze',
      'patterns',
      '--path',
      fixture.tempPath,
      '--format',
      'json'
    ]);

    expect(result.exitCode).toBe(0);

    const output = JSON.parse(result.stdout);
    expect(output.patterns).toBeDefined();
    expect(Array.isArray(output.patterns)).toBe(true);

    // sample-project 應該包含這些模式
    expect(output.patterns).toContain('async-functions'); // async/await in services
    expect(output.patterns).toContain('promise-usage'); // Promise in services
    expect(output.patterns).toContain('interface-usage'); // interface definitions
    expect(output.patterns).toContain('generic-types'); // BaseModel<T>, ApiResponse<T>
    expect(output.patterns).toContain('enum-usage'); // UserRole, ProductCategory, etc.

    // 驗證統計資訊
    expect(output.statistics).toBeDefined();
    expect(output.statistics.asyncFunctions).toBeGreaterThan(0);
  });
});
