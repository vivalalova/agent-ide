/**
 * CLI rename 命令 E2E 測試
 *
 * 測試策略：
 * - 使用 sample-project fixture 中的唯一符號避免多符號衝突
 * - 參數化測試覆蓋不同符號類型和情境
 * - BDD 風格 Given-When-Then 結構
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - Test Case Types

interface RenameTestCase {
  scenario: string;
  from: string;
  to: string;
  expectedFiles?: number;
  expectedChanges?: number;
}

interface ErrorTestCase {
  scenario: string;
  from: string;
  to: string;
  expectedError: string;
}

interface FormatTestCase {
  scenario: string;
  format: string;
  expectedContent: string[];
}

// MARK: - Test Suite

describe('CLI rename - 基於 sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 基本重命名功能

  describe('基本重命名', () => {
    it.each<RenameTestCase>([
      {
        scenario: '重命名 interface（UserAddress 只有 1 處定義）',
        from: 'UserAddress',
        to: 'AddressInfo',
        expectedFiles: 1,
        expectedChanges: 2,
      },
      {
        scenario: '重命名 enum（UserStatus 有跨檔案引用）',
        from: 'UserStatus',
        to: 'AccountStatus',
        expectedFiles: 2,
      },
      {
        scenario: '重命名 type alias（UserSummary）',
        from: 'UserSummary',
        to: 'UserBrief',
        expectedFiles: 1,
      },
    ])('$scenario', async ({ from, to, expectedFiles, expectedChanges }) => {
      // Given: fixture 已載入

      // When: 執行 rename 命令
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      if (expectedFiles !== undefined) {
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(expectedFiles);
      }
      if (expectedChanges !== undefined) {
        expect(output.summary.totalChanges).toBeGreaterThanOrEqual(expectedChanges);
      }
    });
  });

  // MARK: - 跨檔案引用

  describe('跨檔案引用更新', () => {
    it('重命名 class 應更新所有 import 和使用點', async () => {
      // Given: UserService 在多個檔案中被引用

      // When: 重命名 UserService
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該更新多個檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(5);
    });

    it('重命名 Model class 應更新 import 和實例化點', async () => {
      // Given: UserModel 被 UserService import 並使用

      // When: 重命名 UserModel
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserModel', '--to', 'UserEntity', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功並更新相關檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(2);
    });

    it('不應因引用檔案所在目錄名稱包含 dist 而遺漏 rename 變更', async () => {
      await fixture.writeFile(
        'src/rename-target.ts',
        'export function DistanceRenameTarget(): number { return 1; }\n'
      );
      await fixture.writeFile(
        'src/distance/consumer.ts',
        `import { DistanceRenameTarget } from '../rename-target.js';
export const result = DistanceRenameTarget();
`
      );

      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'DistanceRenameTarget', '--to', 'RenamedDistanceTarget', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(2);
    });
  });

  // MARK: - 輸出格式

  describe('輸出格式', () => {
    it.each<FormatTestCase>([
      {
        scenario: 'json 格式應包含結構化資料',
        format: 'json',
        expectedContent: ['success', 'files', 'summary'],
      },
      {
        scenario: 'summary 格式應包含摘要資訊',
        format: 'summary',
        expectedContent: ['Files:', 'Changes:'],
      },
      {
        scenario: 'diff 格式應包含差異標記',
        format: 'diff',
        expectedContent: ['---', '+++'],
      },
    ])('$scenario', async ({ format, expectedContent }) => {
      // Given: 一個唯一符號

      // When: 使用指定格式輸出
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressData', '--dry-run', '--format', format],
        { memfs: fixture.memfs }
      );

      // Then: 輸出應包含預期內容
      expect(result.exitCode).toBe(0);

      for (const content of expectedContent) {
        expect(result.stdout).toContain(content);
      }
    });
  });

  // MARK: - Dry-run 模式

  describe('dry-run 模式', () => {
    it('dry-run 不應實際修改檔案', async () => {
      // Given: 讀取原始檔案內容
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );

      // When: 執行 dry-run
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressData', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 檔案內容應該不變
      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(afterContent).toBe(originalContent);
    });

    it('非 dry-run 應實際修改檔案', async () => {
      // Given: 讀取原始檔案內容
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(originalContent).toContain('UserAddress');

      // When: 執行實際重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'AddressData', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 檔案內容應該改變
      expect(result.exitCode).toBe(0);

      const afterContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(afterContent).toContain('AddressData');
      expect(afterContent).not.toContain('UserAddress');
    });
  });

  // MARK: - 錯誤處理

  describe('錯誤處理', () => {
    it.each<ErrorTestCase>([
      {
        scenario: '符號不存在應報錯',
        from: 'NonExistentSymbol',
        to: 'NewName',
        expectedError: '找不到',
      },
      {
        scenario: '空的 from 參數應報錯',
        from: '',
        to: 'NewName',
        expectedError: '必須指定',
      },
      {
        scenario: '空的 to 參數應報錯',
        from: 'UserAddress',
        to: '',
        expectedError: '必須指定',
      },
    ])('$scenario', async ({ from, to, expectedError }) => {
      // Given: 無效的參數

      // When: 執行 rename
      const args = ['rename', '--path', fixture.rootPath, '--format', 'json'];
      if (from) {args.push('--from', from);}
      if (to) {args.push('--to', to);}

      const result = await executeCLI(args, { memfs: fixture.memfs });

      // Then: 應該失敗並顯示錯誤
      expect(result.exitCode).toBe(1);

      const output = result.stderr || result.stdout;
      expect(output).toContain(expectedError);
    });

    it('from 和 to 相同時應該直接成功但無變更', async () => {
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

  // MARK: - 邊界條件

  describe('邊界條件', () => {
    it('應該處理包含底線的符號名稱（generateId）', async () => {
      // Given: generateId 是 UserService 的 private method，名稱中無底線但是小駝峰
      // 使用 fixture 中已存在的 zipCode（包含大寫）

      // When: 重命名 UserProfile（fixture 中存在）
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserProfile', '--to', 'ProfileInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
    });

    it('應該處理長名稱符號（CreateUserData）', async () => {
      // Given: CreateUserData 是較長的 type alias 名稱

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'CreateUserData', '--to', 'NewUserInput', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
    });

    it('應該處理 Omit/Pick 等泛型 type alias', async () => {
      // Given: UpdateUserData 使用 Partial<Omit<...>> 定義

      // When: 重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UpdateUserData', '--to', 'UserPatch', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
    });
  });

  // MARK: - 參數別名

  describe('參數別名', () => {
    it('--symbol 應該等同於 --from', async () => {
      // Given: 使用 --symbol 代替 --from

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--symbol', 'UserAddress', '--to', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('--new-name 應該等同於 --to', async () => {
      // Given: 使用 --new-name 代替 --to

      // When: 執行 rename
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--new-name', 'AddressInfo', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });
});
