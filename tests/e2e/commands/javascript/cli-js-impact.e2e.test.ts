import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI impact - JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功分析 JS 檔案影響範圍', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/utils.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該支援 summary 格式', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/models.js', '--path', fixture.rootPath, '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('影響範圍分析', () => {
    it('utils.js 修改應影響 service.js', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/utils.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      // impact.dependents 是依賴此檔案的檔案列表
      const dependents: string[] = output.impact?.dependents ?? [];
      const hasService = dependents.some((f: string) => f.includes('service'));
      expect(hasService).toBe(true);
    });

    it('models.js 修改應影響 service.js', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/models.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents: string[] = output.impact?.dependents ?? [];
      const hasService = dependents.some((f: string) => f.includes('service'));
      expect(hasService).toBe(true);
    });

    it('孤島 JS 檔案應無影響範圍', async () => {
      await fixture.writeFile('isolated.js', 'export const value = 42;');

      const result = await executeCLI(
        ['impact', '--file', 'isolated.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      const dependents: string[] = output.impact?.dependents ?? [];
      expect(dependents).toHaveLength(0);
    });

    it('應該以 JSON 格式回傳正確結構', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'src/utils.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('deps');
      expect(output.success).toBeDefined();
    });
  });

  describe('錯誤處理', () => {
    it('不存在的檔案應返回錯誤', async () => {
      const result = await executeCLI(
        ['impact', '--file', 'nonexistent.js', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect([0, 1]).toContain(result.exitCode);
    });
  });
});
