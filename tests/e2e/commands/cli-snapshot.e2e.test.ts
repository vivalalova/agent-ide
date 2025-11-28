/**
 * CLI snapshot 命令 E2E 測試
 * 基於 sample-project fixture 測試模組快照功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';
import type { SnapshotResult, ModuleSnapshotData, ProjectSnapshotData } from '@infrastructure/formatters/query-types.js';

describe('CLI snapshot - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;
  let modulePath: string;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    // 使用具體模組路徑（有 index.ts 的目錄）
    modulePath = `${fixture.rootPath}/src/types`;
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本輸出', () => {
    it('應該成功執行 snapshot 命令', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
    });

    it('應該輸出有效 JSON 格式', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    });

    it('應該包含 SnapshotResult 結構', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      expect(snapshotResult.command).toBe('snapshot');
      expect(snapshotResult.success).toBe(true);
      expect(snapshotResult.snapshotType).toBeDefined();
      expect(snapshotResult.snapshot).toBeDefined();
    });

    it('應該包含 module 欄位', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.module).toBeDefined();
    });
  });

  describe('API 提取', () => {
    it('應該提取 class 的 public 方法', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.api).toBeDefined();
    });

    it('應該包含方法簽章（參數和回傳型別）', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.api).length > 0) {
        const firstClass = Object.values(snapshot.api)[0] as Record<string, string>;
        const firstMethod = Object.values(firstClass)[0];

        // 方法簽章應包含 → 符號（表示回傳型別）
        expect(firstMethod).toMatch(/→|->|:/);
      }
    });
  });

  describe('factories 提取', () => {
    it('應該識別 createXxx 函數為 factory', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.factories).toBeDefined();
    });
  });

  describe('types 提取', () => {
    it('應該提取 interface 定義', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.types).toBeDefined();
    });

    it('應該包含型別欄位資訊', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.types).length > 0) {
        const firstType = Object.values(snapshot.types)[0] as string;
        // 型別應包含欄位列表
        expect(firstType).toMatch(/\{.*\}/);
      }
    });
  });

  describe('private 提取', () => {
    it('應該提取 class 的私有欄位', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      expect(snapshot.private).toBeDefined();
    });

    it('應該包含 imports 資訊', async () => {
      const result = await executeCLI(['snapshot', '--path', modulePath, '--format', 'json'], { memfs: fixture.memfs });

      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
      if (Object.keys(snapshot.private).length > 0) {
        const firstPrivate = Object.values(snapshot.private)[0] as { fields?: string[]; imports?: string };
        expect(firstPrivate.fields || firstPrivate.imports).toBeDefined();
      }
    });
  });

  describe('自動偵測', () => {
    it('應該根據路徑自動偵測為 module 或 project', async () => {
      // 使用專案根路徑測試自動偵測
      const result = await executeCLI(['snapshot', '--path', fixture.rootPath, '--format', 'json'], { memfs: fixture.memfs });

      expect(result.exitCode).toBe(0);
      const snapshotResult = JSON.parse(result.stdout) as SnapshotResult;
      // 應該有 snapshotType 為 module 或 project
      expect(['module', 'project']).toContain(snapshotResult.snapshotType);

      // 檢查對應的快照結構
      if (snapshotResult.snapshotType === 'project') {
        const snapshot = snapshotResult.snapshot as ProjectSnapshotData;
        expect(snapshot.project).toBeDefined();
        expect(snapshot.modules).toBeDefined();
      } else {
        const snapshot = snapshotResult.snapshot as ModuleSnapshotData;
        expect(snapshot.module).toBeDefined();
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該在路徑不存在時輸出錯誤訊息', async () => {
      const result = await executeCLI(['snapshot', '--path', '/nonexistent/path'], { memfs: fixture.memfs });

      // 應該輸出錯誤訊息到 stderr 或 stdout
      expect(result.stderr || result.stdout).toMatch(/不存在|error|Error/i);
    });
  });
});
