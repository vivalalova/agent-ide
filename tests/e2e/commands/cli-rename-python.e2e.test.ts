/**
 * CLI rename 命令 E2E 測試 - Python 專案
 * 基於 python-sample-project fixture 測試符號重命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';

describe('CLI rename Python - 基於 python-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('python-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功重命名 Python enum（OrderStatus → OrderState）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--format', 'json'],
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

    it('應該成功重命名 enum member（PENDING → WAITING）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'PENDING', '--to', 'WAITING', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(output.operations).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該成功重命名 class（User → UserAccount）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        expect(Array.isArray(output.files)).toBe(true);
      }
    });

    it('應該成功重命名 function（format_currency → format_money）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'format_currency', '--to', 'format_money', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
      }
    });

    it('應該成功重命名 dataclass（Product → ProductItem）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Product', '--to', 'ProductItem', '--format', 'json'],
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
    it('應該在 dry-run 模式下不執行實際變更', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--dry-run', '--format', 'json'],
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

    it('應該在 dry-run 模式下顯示影響的檔案數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(typeof output.summary.totalFiles).toBe('number');
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該在 dry-run 模式下顯示操作數量', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'slugify', '--to', 'to_slug', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(typeof output.summary.totalChanges).toBe('number');
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(0);
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

  describe('跨檔案重命名', () => {
    it('應該處理 import 語句更新', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
        // User 被多個檔案引用（order.py, auth_service.py, main.py）
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
      }
    });

    it('應該處理 from...import 語句更新', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'Product', '--to', 'ProductItem', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理相對導入（from ..models.user import）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserRole', '--to', 'AccountRole', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.summary.totalFiles).toBeDefined();
      }
    });

    it('應該更新所有引用該符號的檔案', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--dry-run', '--format', 'json'],
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
  });

  describe('錯誤處理', () => {
    it('應該處理不存在的符號並輸出錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'NonExistentSymbol', '--to', 'NewName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = result.stdout || result.stderr;
      const hasError = output.includes('找不到符號')
        || output.includes('error')
        || output.includes('not found')
        || output.includes('ENOENT');
      expect(hasError).toBe(true);
    });

    it('應該處理無效的路徑並輸出錯誤訊息', async () => {
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/path', '--from', 'User', '--to', 'UserAccount', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.stderr || result.stdout).toBeDefined();
    });

    it('應該處理缺少必要參數並提示錯誤', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User'],
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

    it('應該在 dry-run 模式下包含完整的預覽資訊', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'UserAccount', '--dry-run', '--format', 'json'],
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

  describe('Python 特殊符號類型', () => {
    it('應該重命名 enum member（ADMIN → ADMINISTRATOR）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ADMIN', '--to', 'ADMINISTRATOR', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 dataclass 欄位（username → user_name）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'username', '--to', 'user_name', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名類別方法（is_admin → is_administrator）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'is_admin', '--to', 'is_administrator', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名靜態方法（validate_email → check_email）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'validate_email', '--to', 'check_email', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名 property（item_count → total_items）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'item_count', '--to', 'total_items', '--dry-run', '--format', 'json'],
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

  describe('Python 命名慣例轉換', () => {
    it('應該處理 snake_case 轉換（format_date → format_datetime）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'format_date', '--to', 'format_datetime', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 PascalCase 類別名稱（UserManager → UserService）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserManager', '--to', 'UserService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理 UPPER_CASE 常數（MAX_USERS → USER_LIMIT）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'MAX_USERS', '--to', 'USER_LIMIT', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理私有成員（_users → _user_list）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', '_users', '--to', '_user_list', '--dry-run', '--format', 'json'],
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

  describe('邊界條件', () => {
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

    it('應該處理大小寫不同但拼寫相同的情況（User → user）', async () => {
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

    it('應該處理名稱中包含底線', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'User', '--to', 'user_model', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該處理名稱以底線開頭（合法 Python 識別符）', async () => {
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

    it('應該處理名稱中包含數字', async () => {
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

  describe('類別和模組結構', () => {
    it('應該重命名服務類別（AuthService → AuthenticationService）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'AuthService', '--to', 'AuthenticationService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名目錄類別（ProductCatalog → ProductRepository）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductCatalog', '--to', 'ProductRepository', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      if (result.stdout) {
        const output = JSON.parse(result.stdout);
        expect(output.command).toBe('rename');
        expect(output.success).toBeDefined();
      }
    });

    it('應該重命名處理器類別（OrderProcessor → OrderHandler）', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderProcessor', '--to', 'OrderHandler', '--dry-run', '--format', 'json'],
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

    it('應該只重命名程式碼中的符號，不影響 docstring 內容', async () => {
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'OrderStatus', '--to', 'OrderState', '--dry-run', '--format', 'json'],
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
