/**
 * CLI rename 命令 E2E 測試 - --at 參數功能
 * 測試同名符號的精確定位與重命名
 *
 * 使用 sample-project fixture 中已存在的同名符號（如 userId）來測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename --at 參數 - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('多符號偵測', () => {
    it('找到多個同名符號時應該報錯並列出所有位置', async () => {
      // userId 在 fixture 中有多個定義
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 應該失敗
      expect(result.exitCode).toBe(1);

      // 錯誤訊息應該包含提示用 --at
      const output = result.stderr || result.stdout;
      expect(output).toContain('找到');
      expect(output).toContain('同名符號');
      expect(output).toContain('--at');
    });

    it('錯誤訊息應該列出所有符號的位置', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = result.stderr || result.stdout;
      // 應該顯示多個檔案的位置
      expect(output).toContain('.ts:');
    });
  });

  describe('使用 --at 指定檔案', () => {
    it('同一檔案有多個同名符號時需要指定行號', async () => {
      // user-handler.ts 有多個 userId（:16, :20, :24），只指定檔案無法區分
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 仍應失敗，因為該檔案中有多個 userId
      expect(result.exitCode).toBe(1);
      const output = result.stderr || result.stdout;
      expect(output).toContain('找到');
    });

    it('使用 --at file:line 精確定位符號', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts:16', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.affectedFiles).toBeGreaterThanOrEqual(1);
      }
    });

    it('應該 rename 指定位置的符號及其引用', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts:16', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.totalFiles).toBe(1);
        expect(output.files).toHaveLength(1);
        expect(output.files[0].filePath).toContain('src/api/handlers/user-handler.ts');

        const changedContent = JSON.stringify(output.files[0].hunks);
        expect(changedContent).toContain('handleGetUser(uid: string)');
        expect(changedContent).toContain('getUser(uid)');
        expect(changedContent).not.toContain('handleUpdateUser(uid');
        expect(changedContent).not.toContain('handleDeleteUser(uid');
      }
    });
  });

  describe('--at 位置不存在', () => {
    it('指定的檔案不存在應該報錯', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/nonexistent.ts', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = result.stderr || result.stdout;
      expect(output).toContain('找不到');
    });

    it('指定的行號沒有該符號應該報錯', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts:999', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(1);
      const output = result.stderr || result.stdout;
      expect(output).toContain('找不到');
    });
  });

  describe('單一符號不需要 --at', () => {
    it('只有一個符號時應該直接 rename 成功', async () => {
      // UserRole 在 fixture 中應該是唯一的
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('--at 格式解析', () => {
    it('應該支援 file:line 格式（相對路徑）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts:16', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 file:line:column 格式', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts:16:23', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('只指定檔案（該檔案有多個同名符號）應該報錯', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'uid', '--at', 'src/api/handlers/user-handler.ts', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 該檔案有多個 userId，需要更精確的定位
      expect(result.exitCode).toBe(1);
    });
  });
});
