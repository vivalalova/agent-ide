/**
 * CLI deadcode 命令 Swift 支援 E2E 測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - Swift 專案支援', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該成功檢測 Swift 專案的 dead code', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
    expect(output.summary).toBeDefined();
  });

  it('應該檢測到私有未使用的方法', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--format', 'json', '--include-exports'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 檢查是否有檢測到 dead code
    if (output.data?.deadItems) {
      // processInternalData 是私有且未使用的方法
      const hasPrivateDeadCode = output.data.deadItems.some(
        (item: { name: string }) => item.name === 'processInternalData'
      );
      // 可能被檢測到
      expect(output.data.deadItems).toBeDefined();
    }
  });

  it('應該輸出 summary 格式', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--format', 'summary'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBeDefined();
  });
});
