/**
 * CLI rename 命令 E2E 測試 - 符號類型覆蓋
 *
 * 測試範圍：
 * - Enum 重命名（enum 名稱、enum 成員）
 * - Interface 重命名（interface 名稱、屬性）
 * - Type Alias 重命名（簡單、泛型、組合）
 * - Class 重命名（class 名稱、方法、屬性）
 * - 跨檔案引用更新
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - Test Case Types

interface SymbolTypeTestCase {
  scenario: string;
  from: string;
  to: string;
  symbolType: string;
  minFiles?: number;
  minChanges?: number;
}

// MARK: - Test Suite

describe('CLI rename symbol-types - 符號類型覆蓋', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - Enum 重命名

  describe('Enum 重命名', () => {
    it.each<SymbolTypeTestCase>([
      {
        scenario: 'enum 名稱（ProductCategory）',
        from: 'ProductCategory',
        to: 'ItemCategory',
        symbolType: 'enum',
        minFiles: 1,
      },
      {
        scenario: 'enum 名稱（ProductStatus）',
        from: 'ProductStatus',
        to: 'ItemStatus',
        symbolType: 'enum',
        minFiles: 1,
      },
      {
        scenario: 'enum 名稱（OrderStatus）',
        from: 'OrderStatus',
        to: 'PurchaseStatus',
        symbolType: 'enum',
        minFiles: 1,
      },
      {
        scenario: 'enum 名稱（PaymentMethod）',
        from: 'PaymentMethod',
        to: 'PaymentType',
        symbolType: 'enum',
        minFiles: 1,
      },
    ])('應該重命名 $scenario', async ({ from, to, minFiles }) => {
      // Given: fixture 中存在該 enum

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      if (minFiles) {
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(minFiles);
      }
    });
  });

  // MARK: - Interface 重命名

  describe('Interface 重命名', () => {
    it.each<SymbolTypeTestCase>([
      {
        scenario: 'interface 名稱（ProductDimensions）',
        from: 'ProductDimensions',
        to: 'ItemDimensions',
        symbolType: 'interface',
        minFiles: 1,
      },
      {
        scenario: 'interface 名稱（ProductVariant）',
        from: 'ProductVariant',
        to: 'ItemVariant',
        symbolType: 'interface',
        minFiles: 1,
      },
      {
        scenario: 'interface 名稱（ProductImage）',
        from: 'ProductImage',
        to: 'ItemImage',
        symbolType: 'interface',
        minFiles: 1,
      },
      {
        scenario: 'interface 名稱（ValidationResult）',
        from: 'ValidationResult',
        to: 'ValidateResult',
        symbolType: 'interface',
        minFiles: 1,
      },
      {
        scenario: 'interface 名稱（ApiResponse）',
        from: 'ApiResponse',
        to: 'HttpResponse',
        symbolType: 'interface',
        minFiles: 1,
      },
      {
        scenario: 'interface 名稱（PaginationMeta）',
        from: 'PaginationMeta',
        to: 'PageInfo',
        symbolType: 'interface',
        minFiles: 1,
      },
    ])('應該重命名 $scenario', async ({ from, to, minFiles }) => {
      // Given: fixture 中存在該 interface

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      if (minFiles) {
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(minFiles);
      }
    });
  });

  // MARK: - Type Alias 重命名

  describe('Type Alias 重命名', () => {
    it.each<SymbolTypeTestCase>([
      // 簡單 type alias
      {
        scenario: 'type alias（ProductID）',
        from: 'ProductID',
        to: 'ItemID',
        symbolType: 'type',
        minFiles: 1,
      },
      {
        scenario: 'type alias（OrderID）',
        from: 'OrderID',
        to: 'PurchaseID',
        symbolType: 'type',
        minFiles: 1,
      },
      {
        scenario: 'type alias（ID）',
        from: 'ID',
        to: 'UniqueID',
        symbolType: 'type',
        minFiles: 1,
      },
      {
        scenario: 'type alias（Timestamp）',
        from: 'Timestamp',
        to: 'UnixTime',
        symbolType: 'type',
        minFiles: 1,
      },
      // 泛型 type alias
      {
        scenario: '泛型 type（Nullable）',
        from: 'Nullable',
        to: 'NullableValue',
        symbolType: 'generic type',
        minFiles: 1,
      },
      {
        scenario: '泛型 type（Optional）',
        from: 'Optional',
        to: 'OptionalValue',
        symbolType: 'generic type',
        minFiles: 1,
      },
      {
        scenario: '泛型 type（Maybe）',
        from: 'Maybe',
        to: 'MaybeValue',
        symbolType: 'generic type',
        minFiles: 1,
      },
      // 組合 type alias（Omit/Pick/Partial）
      {
        scenario: '組合 type（CreateProductData - Omit）',
        from: 'CreateProductData',
        to: 'NewProductInput',
        symbolType: 'composed type',
        minFiles: 1,
      },
      {
        scenario: '組合 type（UpdateProductData - Partial）',
        from: 'UpdateProductData',
        to: 'ProductPatch',
        symbolType: 'composed type',
        minFiles: 1,
      },
      {
        scenario: '組合 type（ProductSummary - Pick）',
        from: 'ProductSummary',
        to: 'ProductBrief',
        symbolType: 'composed type',
        minFiles: 1,
      },
    ])('應該重命名 $scenario', async ({ from, to, minFiles }) => {
      // Given: fixture 中存在該 type alias

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      if (minFiles) {
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(minFiles);
      }
    });
  });

  // MARK: - Class 重命名

  describe('Class 重命名', () => {
    it.each<SymbolTypeTestCase>([
      {
        scenario: 'Service class（UserService）',
        from: 'UserService',
        to: 'AccountService',
        symbolType: 'class',
        minFiles: 5,
      },
      {
        scenario: 'Model class（UserModel）',
        from: 'UserModel',
        to: 'UserEntity',
        symbolType: 'class',
        minFiles: 2,
      },
      {
        scenario: 'Model class（BaseModel）',
        from: 'BaseModel',
        to: 'AbstractModel',
        symbolType: 'class',
        minFiles: 1,
      },
    ])('應該重命名 $scenario', async ({ from, to, minFiles }) => {
      // Given: fixture 中存在該 class

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', from, '--to', to, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      if (minFiles) {
        expect(output.summary.totalFiles).toBeGreaterThanOrEqual(minFiles);
      }
    });
  });

  // MARK: - 跨檔案引用驗證

  describe('跨檔案引用更新', () => {
    it('重命名 UserService 應更新所有 import 和使用點', async () => {
      // Given: UserService 被多個檔案引用

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserService', '--to', 'AccountService', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該更新多個檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 驗證影響的檔案數量
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(5);

      // 驗證 files 陣列包含預期的檔案
      const affectedPaths = output.files.map((f: { filePath: string }) => f.filePath);
      expect(affectedPaths.some((p: string) => p.includes('user-service'))).toBe(true);
    });

    it('重命名 ApiResponse 應更新所有使用該 interface 的檔案', async () => {
      // Given: ApiResponse 被多個 service 使用

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ApiResponse', '--to', 'ServiceResponse', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功並更新相關檔案
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(1);
    });

    it('重命名 enum 應更新所有使用該 enum 的檔案', async () => {
      // Given: UserStatus enum 被 user.ts 和其他檔案使用

      // When: 執行重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserStatus', '--to', 'AccountStatus', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  // MARK: - 實際執行驗證

  describe('實際執行（非 dry-run）', () => {
    it('應該實際修改檔案內容', async () => {
      // Given: 讀取原始檔案
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/product.ts`,
        'utf-8'
      );
      expect(originalContent).toContain('ProductDimensions');

      // When: 執行實際重命名
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'ProductDimensions', '--to', 'ItemDimensions', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 檔案應該被修改
      expect(result.exitCode).toBe(0);

      const modifiedContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/product.ts`,
        'utf-8'
      );
      expect(modifiedContent).toContain('ItemDimensions');
      expect(modifiedContent).not.toContain('ProductDimensions');
    });
  });
});
