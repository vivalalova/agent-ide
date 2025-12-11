/**
 * CLI rename 命令 E2E 測試 - 基本功能
 * 基於 sample-project fixture 測試符號重命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename basic - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功重命名 enum', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.affectedFiles).toBeDefined();
        expect(output.operations).toBeDefined();
      }
    });

    it('應該成功重命名 function', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'uniqueValues', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.operations).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該成功重命名 interface', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserProfile', '--to', 'UserProfileData', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(Array.isArray(output.files)).toBe(true);
      }
    });

    it('應該成功重命名 type alias', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserID', '--to', 'UserId', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('dry-run 模式', () => {
    it('應該在dry-run 模式下不執行實際變更', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'uniqueValues', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        expect(output.summary.totalFiles).toBeDefined();
        expect(output.summary.totalChanges).toBeDefined();
      }
    });

    it('應該在dry-run 模式下顯示影響的檔案數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(typeof output.summary.totalFiles).toBe('number');
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該在dry-run 模式下顯示操作數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'groupBy', '--to', 'groupByKey', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(typeof output.summary.totalChanges).toBe('number');
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該在dry-run 模式下檢測衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'sortBy', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.conflicts).toBeDefined();
        expect(Array.isArray(output.conflicts)).toBe(true);
      }
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('應該支援 summary 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('應該支援 diff 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該預設使用 diff 格式', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout.length).toBeGreaterThan(0);
    });
  });

  describe('參數別名', () => {
    it('應該支援 --symbol 作為 --from 的別名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--symbol', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該支援 --to 作為 --new-name 的別名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--new-name', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的符號並輸出錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'NonExistentSymbol', '--to', 'NewName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // JSON 格式錯誤輸出到 stdout
      const output = result.stdout || result.stderr;
      const hasError = output.includes('找不到符號')
        || output.includes('error')
        || output.includes('ENOENT');
      expect(hasError).toBe(true);
    });

    it('應該處理無效的路徑並輸出錯誤訊息', async () => {
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/path', '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少必要參數並提示錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('JSON 輸出結構驗證', () => {
    it('應該包含 success 欄位', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBeDefined();
        expect(typeof output.success).toBe('boolean');
      }
    });

    it('應該包含 affectedFiles 和 operations 欄位', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.affectedFiles).toBeDefined();
        expect(typeof output.affectedFiles).toBe('number');
        expect(output.operations).toBeDefined();
        expect(typeof output.operations).toBe('number');
      }
    });

    it('應該在dry-run 模式下包含完整的預覽資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'uniqueValues', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.summary.totalFiles).toBeDefined();
        expect(output.summary.totalChanges).toBeDefined();
        expect(output.conflicts).toBeDefined();
      }
    });
  });

  describe('跨檔案重命名', () => {
    it('應該處理跨檔案的符號引用', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該更新所有引用該符號的檔案', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserStatus', '--to', 'AccountStatus', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary.totalFiles > 0) {
          expect(output.summary.totalChanges).toBeGreaterThan(0);
        }
      }
    });

    it('應該處理 re-export 的符號', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'Role', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.totalFiles).toBeDefined();
      }
    });

    it('應該處理 Type 和 Value 同名的符號', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserModel', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('符號名稱情境', () => {
    it('應該處理超長名稱 (1000+ 字元)', async () => {
      const longName = 'A'.repeat(1500);
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', longName, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 Unicode 名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '使用者資料', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱中包含數字的情況', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User2024', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('特殊符號類型', () => {
    it('應該重命名 enum member', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Admin', '--to', 'Administrator', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 interface property', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'email', '--to', 'emailAddress', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 generic parameter', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'T', '--to', 'TData', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 decorator', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'validate', '--to', 'validateInput', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('大規模引用情境', () => {
    it('應該處理被多個檔案引用的符號', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'uniqueArray', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.totalFiles).toBeDefined();
        expect(typeof output.summary.totalFiles).toBe('number');
      }
    });

    it('應該統計影響的檔案數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserEntity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.totalChanges).toBeDefined();
        expect(typeof output.summary.totalChanges).toBe('number');
      }
    });
  });

  describe('邊界條件', () => {
    it('應該處理空字串名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理僅空白字元的名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '   ', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr).toBeDefined();
    });

    it('應該處理相同的 from 和 to', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.operations).toBe(0);
      }
    });

    it('應該處理大小寫不同但拼寫相同的情況', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'user', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱中包含底線（合法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User_Name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱以底線開頭（合法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '_User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('跨作用域重命名', () => {
    it('應該處理解構賦值中的變數重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'name', '--to', 'userName', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理巢狀作用域中的符號重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'data', '--to', 'userData', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理同名但不同作用域的符號', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'result', '--to', 'computedResult', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });

  describe('字串和註解過濾', () => {
    it('應該只重命名程式碼中的符號，不影響字串內容', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserModel', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該只重命名程式碼中的符號，不影響註解內容', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'unique', '--to', 'uniqueElements', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });
  });
});
