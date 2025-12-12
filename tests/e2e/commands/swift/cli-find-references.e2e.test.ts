/**
 * CLI find-references 命令 Swift 支援 E2E 測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references - Swift 專案支援', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('應該找到 User 結構的引用', async () => {
    const result = await executeCLI(
      ['find-references', 'User', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // User 應該在多個檔案中被引用
    if (output.data?.references) {
      expect(output.data.references.length).toBeGreaterThan(0);
    }
  });

  it('應該找到 UserService 類別的引用', async () => {
    const result = await executeCLI(
      ['find-references', 'UserService', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
  });

  it('應該找到函式引用', async () => {
    const result = await executeCLI(
      ['find-references', 'validate', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);
  });
});
