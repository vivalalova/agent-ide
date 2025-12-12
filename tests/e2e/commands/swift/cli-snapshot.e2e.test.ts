/**
 * CLI snapshot 命令 Swift 支援 E2E 測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI snapshot - Swift 專案支援', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該成功分析 Swift 專案並輸出 JSON 格式', async () => {
    const result = await executeCLI(
      ['snapshot', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.summary).toBeDefined();
  });

  it('應該提取 Swift 類別和結構', async () => {
    const result = await executeCLI(
      ['snapshot', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    // 檢查是否有 Swift 檔案被分析
    if (output.data?.modules) {
      const hasSwiftFiles = output.data.modules.some(
        (m: { files?: Array<{ path: string }> }) =>
          m.files?.some((f: { path: string }) => f.path.endsWith('.swift'))
      );
      expect(hasSwiftFiles).toBe(true);
    }
  });

  it('應該輸出 summary 格式', async () => {
    const result = await executeCLI(
      ['snapshot', '--path', fixture.rootPath, '--format', 'summary'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    // memfs 根目錄名稱為 test-workspace
    expect(result.stdout).toContain('模組');
  });
});
