/**
 * CLI undo 命令 E2E 測試
 *
 * 測試範圍：
 * - 基本 undo 功能
 * - --list 列出歷史記錄
 * - --dry-run 預覽還原
 * - --id 指定還原特定版本
 * - 連續多次 undo
 * - 無歷史記錄時的處理
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI undo - 還原變更', () => {
  let fixture: FixtureContext;

  // 清理測試用的歷史記錄
  async function cleanupTestHistory(): Promise<void> {
    const historyDir = path.join(os.homedir(), '.config', 'agent-ide', 'history');
    try {
      const files = await fs.readdir(historyDir);
      for (const file of files) {
        try {
          await fs.rm(path.join(historyDir, file), { recursive: true, force: true });
        } catch {
          // 忽略
        }
      }
    } catch {
      // 目錄可能不存在
    }
  }

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    await cleanupTestHistory();
  });

  afterEach(async () => {
    fixture.cleanup();
    await cleanupTestHistory();
  });

  // MARK: - 基本功能

  describe('基本功能', () => {
    it('應該列出空的歷史記錄', async () => {
      const result = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('沒有可還原的變更');
    });

    it('應該列出空的歷史記錄（JSON 格式）', async () => {
      const result = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.total).toBe(0);
      expect(output.entries).toEqual([]);
    });

    it('無歷史記錄時執行 undo 應該友善提示', async () => {
      const result = await executeCLI(
        ['undo', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      // JSON 或文字輸出應包含錯誤訊息
      expect(result.stdout + result.stderr).toMatch(/沒有可還原的變更|no.*history/i);
    });
  });

  // MARK: - 執行變更後 undo

  describe('執行變更後 undo', () => {
    it('應該能還原 rename 變更', async () => {
      // 1. 執行 rename
      const renameResult = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(renameResult.exitCode).toBe(0);

      // 驗證 rename 成功
      const afterRename = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/models/user-model.ts`,
        'utf-8'
      );
      expect(afterRename).toContain('UserEntity');
      expect(afterRename).not.toContain('class UserModel');

      // 2. 執行 undo
      const undoResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(undoResult.exitCode).toBe(0);

      const undoOutput = JSON.parse(undoResult.stdout);
      expect(undoOutput.success).toBe(true);

      // 3. 驗證已還原
      const afterUndo = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/models/user-model.ts`,
        'utf-8'
      );
      expect(afterUndo).toContain('class UserModel');
      expect(afterUndo).not.toContain('UserEntity');
    });

    it('--list 應該顯示變更歷史', async () => {
      // 1. 執行 rename 產生歷史
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 2. 列出歷史
      const listResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(listResult.exitCode).toBe(0);
      const output = JSON.parse(listResult.stdout);
      expect(output.success).toBe(true);
      expect(output.total).toBe(1);
      expect(output.entries[0].command).toBe('rename');
    });

    it('--dry-run 應該預覽還原但不執行', async () => {
      // 1. 執行 rename
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 2. dry-run undo
      const dryRunResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(dryRunResult.exitCode).toBe(0);

      // 3. 檔案應該仍然是 rename 後的狀態
      const afterDryRun = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/models/user-model.ts`,
        'utf-8'
      );
      expect(afterDryRun).toContain('UserEntity');
      expect(afterDryRun).not.toContain('class UserModel');

      // 4. 歷史記錄應該仍然存在
      const listResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const output = JSON.parse(listResult.stdout);
      expect(output.total).toBe(1);
    });
  });

  // MARK: - 多次 undo

  describe('多次 undo', () => {
    it('應該支援連續多次 undo', async () => {
      // 1. 執行第一次 rename
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 2. 執行第二次 rename
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService'],
        { memfs: fixture.memfs }
      );

      // 3. 檢查歷史有 2 筆
      const listResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const listOutput = JSON.parse(listResult.stdout);
      expect(listOutput.total).toBe(2);

      // 4. 第一次 undo（還原最近的變更）
      await executeCLI(
        ['undo', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      // 5. 驗證第二次 rename 已還原
      const afterFirstUndo = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/services/user-service.ts`,
        'utf-8'
      );
      expect(afterFirstUndo).toContain('UserService');

      // 6. 第二次 undo
      await executeCLI(
        ['undo', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      // 7. 驗證第一次 rename 也已還原
      const afterSecondUndo = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/models/user-model.ts`,
        'utf-8'
      );
      expect(afterSecondUndo).toContain('class UserModel');
    });

    it('undo 後歷史記錄應該減少', async () => {
      // 1. 執行 rename
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 2. 確認有 1 筆歷史
      const beforeUndo = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(JSON.parse(beforeUndo.stdout).total).toBe(1);

      // 3. 執行 undo
      await executeCLI(
        ['undo', '--path', fixture.rootPath],
        { memfs: fixture.memfs }
      );

      // 4. 確認歷史已清空
      const afterUndo = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(JSON.parse(afterUndo.stdout).total).toBe(0);
    });
  });

  // MARK: - --id 指定版本

  describe('--id 指定版本', () => {
    it('應該能透過 ID 還原特定版本', async () => {
      // 1. 執行 rename 產生歷史
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 2. 取得歷史列表並獲得 ID
      const listResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--list', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      const listOutput = JSON.parse(listResult.stdout);
      expect(listOutput.total).toBe(1);

      const entryId = listOutput.entries[0].id;

      // 3. 透過縮短的 ID (前 8 字元) 還原
      const undoResult = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--id', entryId.substring(0, 8), '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(undoResult.exitCode).toBe(0);

      // 4. 驗證變更已還原
      const afterUndo = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/models/user-model.ts`,
        'utf-8'
      );
      expect(afterUndo).toContain('class UserModel');
      expect(afterUndo).not.toContain('UserEntity');
    });
  });

  // MARK: - 邊界情況

  describe('邊界情況', () => {
    it('應該處理不存在的路徑', async () => {
      const result = await executeCLI(
        ['undo', '--path', '/nonexistent/path', '--list'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });

    it('應該處理無效的 ID', async () => {
      // 先產生一筆歷史
      await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity'],
        { memfs: fixture.memfs }
      );

      // 使用無效的 ID
      const result = await executeCLI(
        ['undo', '--path', fixture.rootPath, '--id', 'invalid-id'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
    });
  });
});
