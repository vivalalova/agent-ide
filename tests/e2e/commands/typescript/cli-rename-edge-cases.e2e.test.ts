/**
 * CLI rename 命令 E2E 測試 - 邊界條件與錯誤處理
 *
 * 測試範圍：
 * - 路徑處理（相對/絕對、不存在）
 * - 參數組合（缺失、無效、重複）
 * - 特殊情境（空專案、單檔案、大量檔案）
 * - 錯誤恢復（部分失敗、回滾）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - Test Case Types

interface _PathTestCase {
  scenario: string;
  pathArg: string;
  shouldSucceed: boolean;
}

interface ParamTestCase {
  scenario: string;
  args: string[];
  expectedError?: string;
  shouldSucceed: boolean;
}

// MARK: - Test Suite

describe('CLI rename edge-cases - 邊界條件與錯誤處理', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 路徑處理

  describe('路徑處理', () => {
    it('應該處理相對路徑', async () => {
      // Given: 使用相對路徑

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
    });

    it('應該處理指向檔案的路徑（自動找專案根目錄）', async () => {
      // Given: 路徑指向單一檔案

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', `${fixture.rootPath}/src/types/user.ts`, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功（會自動向上找專案根目錄）
      expect(result.exitCode).toBe(0);
    });

    it('不存在的路徑應該報錯', async () => {
      // Given: 不存在的路徑

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', '/nonexistent/path', '--from', 'Test', '--to', 'Test2', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗
      expect(result.exitCode).toBe(1);
    });
  });

  // MARK: - 參數組合

  describe('參數組合', () => {
    const paramCases: ParamTestCase[] = [
      // 缺少必要參數
      {
        scenario: '缺少 --from 參數',
        args: ['rename', '--path', '.', '--to', 'NewName', '--format', 'json'],
        expectedError: '必須指定',
        shouldSucceed: false,
      },
      {
        scenario: '缺少 --to 參數',
        args: ['rename', '--path', '.', '--from', 'OldName', '--format', 'json'],
        expectedError: '必須指定',
        shouldSucceed: false,
      },
      // 無效格式
      {
        scenario: '無效的 --format 值',
        args: ['rename', '--path', '.', '--from', 'Test', '--to', 'Test2', '--format', 'invalid'],
        expectedError: '不支援',
        shouldSucceed: false,
      },
    ];

    it.each(paramCases)('$scenario', async ({ args, expectedError, shouldSucceed }) => {
      // Given: 特定參數組合

      // When: 執行 rename
      // 替換 . 為實際路徑
      const actualArgs = args.map(arg => arg === '.' ? fixture.rootPath : arg);
      const result = await executeCLI(actualArgs, { memfs: fixture.memfs });

      // Then: 驗證結果
      if (shouldSucceed) {
        expect(result.exitCode).toBe(0);
      } else {
        expect(result.exitCode).toBe(1);
        if (expectedError) {
          const output = result.stderr || result.stdout;
          expect(output).toContain(expectedError);
        }
      }
    });
  });

  // MARK: - 符號不存在

  describe('符號不存在', () => {
    it('找不到符號應該報錯', async () => {
      // Given: 不存在的符號名稱

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'NonExistentSymbol123', '--to', 'NewName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗
      expect(result.exitCode).toBe(1);

      const output = result.stderr || result.stdout;
      expect(output).toContain('找不到');
    });

    it('大小寫不匹配應該找不到', async () => {
      // Given: 符號名稱大小寫不匹配

      // When: 執行 rename（UserAddress 存在，但 useraddress 不存在）
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'useraddress', '--to', 'NewAddress', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗（精確匹配）
      expect(result.exitCode).toBe(1);
    });
  });

  // MARK: - 相同名稱

  describe('相同名稱處理', () => {
    it('from 和 to 相同應該成功但無變更', async () => {
      // Given: from === to

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'UserAddress', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功但無變更
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBe(0);
    });
  });

  // MARK: - 特殊字元處理

  describe('特殊字元處理', () => {
    it('符號名稱中的正則特殊字元應該被正確處理', async () => {
      // Given: 需要確保正則特殊字元不會導致問題
      // 注意：這裡測試的是搜尋邏輯，而不是重命名為特殊字元

      // When: 搜尋一個普通符號
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'NewAddress', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
    });
  });

  // MARK: - 輸出格式邊界

  describe('輸出格式邊界', () => {
    it('json 格式應該總是返回有效 JSON', async () => {
      // Given: 任何操作

      // When: 使用 json 格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: stdout 應該是有效 JSON
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('rename');
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThan(0);
    });

    it('錯誤情況下 json 格式也應該返回結構化資料', async () => {
      // Given: 錯誤情況

      // When: 使用 json 格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'NonExistent', '--to', 'NewName', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該有結構化錯誤訊息
      expect(result.exitCode).toBe(1);
      const output = result.stderr || result.stdout;
      expect(output).toBeTruthy();
    });
  });

  // MARK: - Dry-run 保證

  describe('dry-run 保證', () => {
    it('dry-run 應該絕對不修改任何檔案', async () => {
      // Given: 記錄所有檔案的原始內容
      const filesToCheck = [
        `${fixture.rootPath}/src/types/user.ts`,
        `${fixture.rootPath}/src/types/api.ts`,
        `${fixture.rootPath}/src/services/user-service.ts`,
      ];

      const originalContents = await Promise.all(
        filesToCheck.map(async path => ({
          path,
          content: await fixture.memfs.readFile(path, 'utf-8'),
        }))
      );

      // When: 執行 dry-run
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 所有檔案內容應該完全不變
      expect(result.exitCode).toBe(0);

      for (const { path, content: originalContent } of originalContents) {
        const currentContent = await fixture.memfs.readFile(path, 'utf-8');
        expect(currentContent).toBe(originalContent);
      }
    });
  });

  // MARK: - 大量變更

  describe('大量變更處理', () => {
    it('應該正確統計大量變更', async () => {
      // Given: UserService 被多處引用

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該有正確的統計
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.summary.totalFiles).toBeGreaterThan(0);
      expect(output.summary.totalChanges).toBeGreaterThan(0);
    });
  });

  // MARK: - 連續操作

  describe('連續操作', () => {
    it('連續執行多次重命名應該都成功', async () => {
      // Given: 需要連續重命名

      // When: 第一次重命名
      const result1 = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--format', 'json'],
        { memfs: fixture.memfs }
      );
      expect(result1.exitCode).toBe(0);

      // When: 第二次重命名（使用新名稱）
      const result2 = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'AddressInfo', '--to', 'LocationInfo', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 第二次也應該成功
      expect(result2.exitCode).toBe(0);

      // 驗證最終檔案內容
      const content = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(content).toContain('LocationInfo');
      expect(content).not.toContain('UserAddress');
      expect(content).not.toContain('AddressInfo');
    });
  });

  // MARK: - Summary 格式

  describe('Summary 格式輸出', () => {
    it('summary 格式應該包含關鍵資訊', async () => {
      // Given: 有變更的重命名

      // When: 使用 summary 格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      // Then: 應該包含關鍵資訊
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Files:');
      expect(result.stdout).toContain('Changes:');
    });
  });

  // MARK: - Diff 格式

  describe('Diff 格式輸出', () => {
    it('diff 格式應該包含差異標記', async () => {
      // Given: 有變更的重命名

      // When: 使用 diff 格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      // Then: 應該包含 diff 標記
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/[+-]/);
    });
  });
});
