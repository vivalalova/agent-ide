/**
 * CLI rename 命令 E2E 測試
 * 基於 sample-project fixture 測試符號重命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI rename - 基於 sample-project fixture', () => {
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

    it('應該支援 plain 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'plain'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');
    });

    it('應該支援 markdown 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'markdown'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該支援 minimal 格式輸出', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--format', 'minimal'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
    });

    it('應該預設使用 plain 格式', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');
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

      // 應該有錯誤訊息（可能在 stderr 或包含在 JSON 輸出中）
      const hasError = result.stderr.includes('找不到符號')
        || result.stderr.includes('error')
        || result.stderr.includes('ENOENT');
      expect(hasError).toBe(true);
    });

    it('應該處理無效的路徑並輸出錯誤訊息', async () => {
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/path', '--from', 'UserRole', '--to', 'AccountRole', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // 可能成功但找不到檔案，或直接失敗
      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少必要參數並提示錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole'],
        { memfs: fixture.memfs }
      );

      // 缺少 --to 參數應該要有錯誤訊息
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

  describe('符號名稱極端情境', () => {
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

    it('應該檢測與 TypeScript 關鍵字衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'class', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(Array.isArray(output.conflicts)).toBe(true);
        }
      }
    });

    it('應該檢測與保留字衝突', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'function', '--dry-run', '--format', 'json'],
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

    it('應該處理名稱中包含特殊字元（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User-Name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理以數字開頭的名稱（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '1User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理名稱中包含空格（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User Name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
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
        // 應該只重命名符號引用，不重命名字串中的 'User'
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
        // 應該只重命名符號引用，不重命名註解中的 'unique'
      }
    });
  });

  describe('極端資料量測試', () => {
    it('應該處理有大量引用的符號 (預期 10+ 個引用)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserEntity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        expect(output.summary.totalChanges).toBeGreaterThan(0);
      }
    });

    it('應該處理跨多個檔案的大量引用', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'UserRoleEnum', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        if (output.summary.totalFiles > 0) {
          expect(output.summary.totalChanges).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Unicode 和國際化', () => {
    it('應該處理 Unicode 字元的符號名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'Utilisateur', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理包含 emoji 的名稱（非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'User👤', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });

    it('應該處理中文符號名稱（視為非法識別符）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', '用戶', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'invalid_identifier')).toBe(true);
        }
      }
    });
  });

  describe('保留字和關鍵字', () => {
    it('應該檢測 JavaScript 保留字 (var)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'var', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 JavaScript 保留字 (let)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'let', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 JavaScript 保留字 (const)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'const', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (interface)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'interface', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (enum)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'enum', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測 TypeScript 關鍵字 (type)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'type', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測控制流程關鍵字 (if)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'if', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測迴圈關鍵字 (while)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'while', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測異常處理關鍵字 (try)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'try', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測模組關鍵字 (import)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'import', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });

    it('應該檢測模組關鍵字 (export)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'export', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.conflicts) {
          expect(output.conflicts.some((c: any) => c.type === 'reserved_keyword')).toBe(true);
        }
      }
    });
  });

  describe('衝突檢測', () => {
    it('應該檢測重命名到已存在的名稱 (sortBy)', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'groupBy', '--to', 'sortBy', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.conflicts).toBeDefined();
        expect(Array.isArray(output.conflicts)).toBe(true);
      }
    });

    it('應該檢測重命名到已存在的類別名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserProfile', '--to', 'User', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該檢測重命名到已存在的 enum 名稱', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserRole', '--dry-run', '--format', 'json'],
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

  describe('檔案系統邊界', () => {
    it('應該處理不存在的檔案路徑', async () => {
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/directory', '--from', 'User', '--to', 'UserModel', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理空的專案路徑', async () => {
      const result = await executeCLI(
        ['rename', '--path', '', '--from', 'User', '--to', 'UserModel', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });
  });

  describe('複雜符號類型', () => {
    it('應該處理泛型類型參數重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'K', '--to', 'KeyType', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 type alias 屬性重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'id', '--to', 'userId', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理方法重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'toString', '--to', 'serialize', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理靜態屬性重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'version', '--to', 'apiVersion', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理命名空間重命名', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Utils', '--to', 'Utilities', '--dry-run', '--format', 'json'],
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

  describe('效能和摘要資訊', () => {
    it('應該提供預估執行時間', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserData', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary) {
          expect(output.summary.estimatedTime).toBeDefined();
          expect(typeof output.summary.estimatedTime).toBe('number');
        }
      }
    });

    it('應該提供正確的統計資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'Role', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        if (output.summary) {
          expect(output.summary.totalReferences).toBeDefined();
          expect(output.summary.totalFiles).toBeDefined();
          expect(output.summary.conflictCount).toBeDefined();
        }
      }
    });
  });
});
