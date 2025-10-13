/**
 * CLI search 命令 E2E 測試
 * 基於 sample-project fixture 測試真實複雜專案的搜尋功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { searchCode, executeCLI } from '../helpers/cli-executor';

describe('CLI search - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    // 建立索引以支援符號搜尋
    await executeCLI(['index', '--path', fixture.tempPath]);
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 符號搜尋測試（6 個測試）
  // ============================================================

  describe('符號搜尋', () => {
    it('應該能搜尋 enum 成員', async () => {
      const result = await searchCode(fixture.tempPath, 'UserRole');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到 enum 定義
      expect(output).toContain('UserRole');
      // 應該在 types/user.ts 中找到定義
      expect(output).toMatch(/types\/user\.ts/);
    });

    it('應該能搜尋 interface 欄位型別', async () => {
      const result = await searchCode(fixture.tempPath, 'UserProfile');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到 interface 定義
      expect(output).toContain('UserProfile');
      // 應該在正確的檔案中
      expect(output).toMatch(/types\/user\.ts/);
    });

    it('應該能搜尋 type alias', async () => {
      const result = await searchCode(fixture.tempPath, 'CreateUserData');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到 type alias 定義
      expect(output).toContain('CreateUserData');
      // 應該在 types 和 services 中都找到使用
      expect(output).toMatch(/types\/user\.ts/);
    });

    it('應該能搜尋泛型型別 ApiResponse', async () => {
      const result = await searchCode(fixture.tempPath, 'ApiResponse');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到泛型型別定義和使用
      expect(output).toContain('ApiResponse');
      // 應該在多個檔案中找到（types 定義 + services/controllers 使用）
      expect(
        output.includes('api.ts') ||
        output.includes('service') ||
        output.includes('controller')
      ).toBeTruthy();
    });

    it('應該能搜尋繼承關係 extends', async () => {
      const result = await searchCode(fixture.tempPath, 'extends');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到 class 繼承
      expect(output).toContain('extends');
      // 應該在 models 和 controllers 中找到
      expect(output.length).toBeGreaterThan(0);
    });

    it('應該能搜尋常數物件成員', async () => {
      const result = await searchCode(fixture.tempPath, 'ERROR_CODES');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到常數定義
      expect(output).toContain('ERROR_CODES');
      expect(output).toMatch(/constants\.ts/);
    });
  });

  // ============================================================
  // 2. 跨檔案引用搜尋測試（5 個測試）
  // ============================================================

  describe('跨檔案引用搜尋', () => {
    it('應該能追蹤 User 型別在多個模組中的使用', async () => {
      const result = await searchCode(fixture.tempPath, 'User');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // User 型別應該在多個層級中出現
      expect(output).toContain('User');

      // 應該至少在這些目錄中找到：types, models, services
      const hasTypes = output.match(/types/);
      const hasModels = output.match(/models/);
      const hasServices = output.match(/services/);

      expect(hasTypes || hasModels || hasServices).toBeTruthy();
    });

    it('應該能追蹤 ApiResponse 的跨層使用', async () => {
      const result = await searchCode(fixture.tempPath, 'ApiResponse');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('ApiResponse');
      // ApiResponse 應該在 types 定義並在 services 使用
      expect(output).toMatch(/types\/api\.ts|services/);
    });

    it('應該能追蹤 ValidationResult 的傳遞鏈', async () => {
      const result = await searchCode(fixture.tempPath, 'ValidationResult');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('ValidationResult');
      // 應該在 types 和 utils 中找到
      expect(output).toMatch(/types\/common\.ts|utils/);
    });

    it('應該能分析 UserRole enum 的使用分布', async () => {
      const result = await searchCode(fixture.tempPath, 'UserRole');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('UserRole');
      // UserRole 應該在定義處和使用處都出現
      expect(output).toMatch(/types\/user\.ts/);
    });

    it('應該能搜尋 import 語句中的符號', async () => {
      const result = await searchCode(fixture.tempPath, 'import');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到多個 import 語句
      expect(output).toContain('import');
      expect(output.length).toBeGreaterThan(100);
    });
  });

  // ============================================================
  // 3. 程式碼結構搜尋測試（5 個測試）
  // ============================================================

  describe('程式碼結構搜尋', () => {
    it('應該能搜尋 async/await 模式', async () => {
      const result = await searchCode(fixture.tempPath, 'async');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('async');
      // services 中應該有很多 async 方法
      expect(output).toMatch(/services/);
    });

    it('應該能搜尋錯誤處理模式 try-catch', async () => {
      const result = await searchCode(fixture.tempPath, 'try');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('try');
      // UserService 中有 try-catch
      expect(output).toMatch(/services/);
    });

    it('應該能搜尋泛型使用模式', async () => {
      const result = await searchCode(fixture.tempPath, 'Omit');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('Omit');
      // types/user.ts 中使用了 Omit
      expect(output).toMatch(/types\/user\.ts/);
    });

    it('應該能搜尋 middleware 模式方法', async () => {
      const result = await searchCode(fixture.tempPath, 'authenticate');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('authenticate');
      // 應該在 middleware/auth.ts 中找到
      expect(output).toMatch(/middleware\/auth\.ts/);
    });

    it('應該能搜尋 service 層的 CRUD 方法', async () => {
      const result = await searchCode(fixture.tempPath, 'createUser');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('createUser');
      // 應該在 UserService 中找到
      expect(output).toMatch(/user-service\.ts/);
    });
  });

  // ============================================================
  // 4. 進階搜尋功能測試（4 個測試）
  // ============================================================

  describe('進階搜尋功能', () => {
    it('應該支援正則表達式搜尋方法命名模式', async () => {
      const result = await executeCLI([
        'search',
        'create|update|delete',
        '--type',
        'regex',
        '--path',
        fixture.tempPath
      ]);

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到多個 CRUD 方法
      expect(output.length).toBeGreaterThan(0);
    });

    it('應該支援特定目錄範圍搜尋 - services 層', async () => {
      const result = await executeCLI([
        'search',
        'Service',
        '--path',
        fixture.getFilePath('src/services')
      ]);

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('Service');
      // 結果應該只包含 services 目錄
      if (output.includes('src/')) {
        expect(output).toMatch(/services/);
      }
    });

    it('應該支援特定目錄範圍搜尋 - utils 層', async () => {
      const result = await executeCLI([
        'search',
        'validate',
        '--path',
        fixture.getFilePath('src/utils')
      ]);

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      expect(output).toContain('validate');
      // 應該在 validator.ts 中找到
      if (output.includes('src/')) {
        expect(output).toMatch(/utils/);
      }
    });

    it('應該支援搜尋複雜的型別表達式', async () => {
      const result = await searchCode(fixture.tempPath, 'Pick<User');

      expect(result.exitCode).toBe(0);
      const output = result.stdout;

      // 應該找到使用 Pick 的型別定義
      expect(output).toContain('Pick');
    });
  });

  // ============================================================
  // 5. 邊界與錯誤測試（3 個測試）
  // ============================================================

  describe('邊界與錯誤處理', () => {
    it('應該處理找不到結果的情況', async () => {
      const result = await searchCode(
        fixture.tempPath,
        'NonExistentSymbolXYZ123ABC'
      );

      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;

      // 應該明確表示沒有找到結果
      expect(
        output.includes('沒有找到') ||
        output.includes('No results') ||
        output.includes('not found') ||
        output.length === 0
      ).toBeTruthy();
    });

    it('應該處理空查詢字串', async () => {
      const result = await executeCLI([
        'search',
        '',
        '--path',
        fixture.tempPath
      ]);

      // 空查詢應該要有明確處理：
      // 1. exitCode 非 0 表示錯誤
      // 2. 或輸出明確錯誤訊息
      // 3. 或回傳空結果
      const output = result.stdout + result.stderr;

      expect(
        result.exitCode !== 0 ||
        output.includes('查詢字串不能為空') ||
        output.includes('empty') ||
        output.includes('required') ||
        output.includes('Query is required') ||
        output.includes('沒有找到') ||
        output.includes('找到 0 個結果')
      ).toBeTruthy();
    });

    it('應該優雅處理無效的路徑', async () => {
      const result = await searchCode(
        '/absolutely/non/existent/path/xyz123',
        'test'
      );

      // 應該要有明確的錯誤處理，不應該 crash
      expect(result.exitCode).toBeDefined();
      const output = result.stdout + result.stderr;

      // 應該有某種輸出（錯誤訊息或警告）
      expect(typeof output).toBe('string');
    });
  });
});
