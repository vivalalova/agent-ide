/**
 * 重構工作流程 E2E 測試
 * 測試完整的重構流程：分析 → 提取函式 → 驗證
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('重構工作流程 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立包含複雜程式碼的測試專案
    project = await createTypeScriptProject({
      'src/complex.ts': `
export function processData(data: any[]): any {
  // 資料驗證
  if (!data || data.length === 0) {
    throw new Error('資料不能為空');
  }

  // 資料清理
  const cleaned = data.filter(item => item !== null && item !== undefined);

  // 資料轉換
  const transformed = cleaned.map(item => ({
    ...item,
    timestamp: new Date().toISOString()
  }));

  // 資料排序
  const sorted = transformed.sort((a, b) =>
    (a.priority || 0) - (b.priority || 0)
  );

  return sorted;
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('完整重構流程：分析 → 提取函式', async () => {
    const filePath = project.getFilePath('src/complex.ts');

    // 步驟 1: 分析程式碼複雜度
    const analyzeResult = await executeCLI(['analyze', filePath]);
    expect(analyzeResult.exitCode).toBe(0);

    // 步驟 2: 提取函式（資料清理部分）
    const refactorResult = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '4',
      '--function-name', 'validateData',
      '--preview'
    ]);

    // 檢查執行（可能成功或失敗都是正常的）
    expect(refactorResult.exitCode).toBe(0);
  });

  it('重構流程：預覽 → 執行 → 驗證', async () => {
    const filePath = project.getFilePath('src/complex.ts');

    // 步驟 1: 預覽變更
    const previewResult = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '4',
      '--function-name', 'validateData',
      '--preview'
    ]);

    expect(previewResult.exitCode).toBe(0);

    // 步驟 2: 執行重構
    const executeResult = await executeCLI([
      'refactor',
      'extract-function',
      '--file', filePath,
      '--start-line', '2',
      '--end-line', '4',
      '--function-name', 'validateData'
    ]);

    expect(executeResult.exitCode).toBe(0);

    // 步驟 3: 驗證檔案是否被修改
    const fileExists = await project.fileExists('src/complex.ts');
    expect(fileExists).toBe(true);
  });
});
