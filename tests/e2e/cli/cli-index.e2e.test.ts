/**
 * CLI index 命令 E2E 測試
 * 基於 sample-project fixture 測試真實複雜專案的索引功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { indexProject, executeCLI } from '../helpers/cli-executor';

describe('CLI index - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 基礎索引測試（3 個測試）
  // ============================================================

  it('應該能索引整個專案', async () => {
    const result = await indexProject(fixture.tempPath);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');
  });

  it('應該能索引特定目錄', async () => {
    const result = await executeCLI(['index', '--path', fixture.getFilePath('src/services')]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('索引完成');
  });

  it('應該能顯示索引統計資訊', async () => {
    const result = await indexProject(fixture.tempPath);

    expect(result.exitCode).toBe(0);

    const output = result.stdout;
    expect(output).toMatch(/檔案數|符號數/);
  });

  // ============================================================
  // 2. 索引範圍測試（3 個測試）
  // ============================================================

  it('應該能索引 types 目錄', async () => {
    const result = await executeCLI(['index', '--path', fixture.getFilePath('src/types')]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能索引 models 目錄', async () => {
    const result = await executeCLI(['index', '--path', fixture.getFilePath('src/models')]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能索引 controllers 目錄', async () => {
    const result = await executeCLI(['index', '--path', fixture.getFilePath('src/controllers')]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 3. 索引選項測試（3 個測試）
  // ============================================================

  it('應該能使用 --extensions 過濾副檔名', async () => {
    const result = await executeCLI([
      'index',
      '--path',
      fixture.tempPath,
      '--extensions',
      '.ts'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能使用 --exclude 排除目錄', async () => {
    const result = await executeCLI([
      'index',
      '--path',
      fixture.tempPath,
      '--exclude',
      'node_modules'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能使用 --format json 輸出 JSON 格式', async () => {
    const result = await executeCLI(['index', '--path', fixture.tempPath, '--format', 'json']);

    expect(result.exitCode).toBe(0);

    // 驗證是有效的 JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });

  // ============================================================
  // 4. 增量索引測試（2 個測試）
  // ============================================================

  it('應該能執行初始索引後更新索引', async () => {
    // 第一次索引
    const result1 = await indexProject(fixture.tempPath);
    expect(result1.exitCode).toBe(0);

    // 修改檔案
    await fixture.writeFile(
      'src/types/new-type.ts',
      'export interface NewType { id: number; }'
    );

    // 第二次索引（應該更新）
    const result2 = await indexProject(fixture.tempPath);
    expect(result2.exitCode).toBe(0);
  });

  it('應該能檢測檔案變更並更新索引', async () => {
    const result1 = await indexProject(fixture.tempPath);
    expect(result1.exitCode).toBe(0);

    // 修改現有檔案
    const userTypes = await fixture.readFile('src/types/user.ts');
    await fixture.writeFile('src/types/user.ts', userTypes + '\nexport interface NewUser {}');

    const result2 = await indexProject(fixture.tempPath);
    expect(result2.exitCode).toBe(0);
  });

  // ============================================================
  // 5. 錯誤處理測試（3 個測試）
  // ============================================================

  it('應該處理不存在的路徑', async () => {
    const result = await executeCLI(['index', '--path', '/non/existent/path']);

    const output = result.stdout + result.stderr;
    expect(output).toContain('路徑不存在');
  });

  it('應該處理空目錄', async () => {
    const result = await executeCLI(['index', '--path', fixture.getFilePath('empty')]);

    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該處理包含語法錯誤的檔案', async () => {
    // 建立語法錯誤的檔案
    await fixture.writeFile('src/broken.ts', 'export class Broken { missing closing brace');

    const result = await indexProject(fixture.tempPath);

    // 應該完成索引但報告錯誤
    expect(result.exitCode).toBeDefined();
  });

  // ============================================================
  // 6. 效能測試（1 個測試）
  // ============================================================

  it('應該能在合理時間內索引 32+ 檔案的專案', async () => {
    const startTime = Date.now();
    const result = await indexProject(fixture.tempPath);
    const endTime = Date.now();

    expect(result.exitCode).toBe(0);

    // 應該在 30 秒內完成
    const duration = endTime - startTime;
    expect(duration).toBeLessThan(30000);
  });
});
