/**
 * CLI rename 命令 E2E 測試 - 衝突檢測與多符號消歧
 *
 * 測試範圍：
 * - 保留字衝突檢測
 * - 無效識別符檢測
 * - 同名符號消歧（--at 參數）
 * - 衝突警告輸出
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

// MARK: - Test Case Types

interface ReservedKeywordConflictCase {
  scenario: string;
  keyword: string;
  expectedConflictType: string;
}

interface InvalidIdentifierCase {
  scenario: string;
  identifier: string;
  expectedBehavior: 'error' | 'conflict' | 'success';
}

interface MultiSymbolCase {
  scenario: string;
  symbolName: string;
  atValue?: string;
  shouldSucceed: boolean;
  expectedError?: string;
}

// MARK: - Test Suite

describe('CLI rename conflict-detection - 衝突檢測與多符號消歧', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  // MARK: - 保留字衝突

  describe('保留字衝突檢測', () => {
    const reservedKeywordConflicts: ReservedKeywordConflictCase[] = [
      // JavaScript 核心保留字
      { scenario: 'function 關鍵字', keyword: 'function', expectedConflictType: 'reserved_keyword' },
      { scenario: 'var 關鍵字', keyword: 'var', expectedConflictType: 'reserved_keyword' },
      { scenario: 'let 關鍵字', keyword: 'let', expectedConflictType: 'reserved_keyword' },
      { scenario: 'const 關鍵字', keyword: 'const', expectedConflictType: 'reserved_keyword' },
      { scenario: 'class 關鍵字', keyword: 'class', expectedConflictType: 'reserved_keyword' },
      // 控制流程
      { scenario: 'if 關鍵字', keyword: 'if', expectedConflictType: 'reserved_keyword' },
      { scenario: 'else 關鍵字', keyword: 'else', expectedConflictType: 'reserved_keyword' },
      { scenario: 'for 關鍵字', keyword: 'for', expectedConflictType: 'reserved_keyword' },
      { scenario: 'while 關鍵字', keyword: 'while', expectedConflictType: 'reserved_keyword' },
      { scenario: 'do 關鍵字', keyword: 'do', expectedConflictType: 'reserved_keyword' },
      { scenario: 'switch 關鍵字', keyword: 'switch', expectedConflictType: 'reserved_keyword' },
      { scenario: 'case 關鍵字', keyword: 'case', expectedConflictType: 'reserved_keyword' },
      { scenario: 'break 關鍵字', keyword: 'break', expectedConflictType: 'reserved_keyword' },
      { scenario: 'continue 關鍵字', keyword: 'continue', expectedConflictType: 'reserved_keyword' },
      { scenario: 'return 關鍵字', keyword: 'return', expectedConflictType: 'reserved_keyword' },
      // 異常處理
      { scenario: 'try 關鍵字', keyword: 'try', expectedConflictType: 'reserved_keyword' },
      { scenario: 'catch 關鍵字', keyword: 'catch', expectedConflictType: 'reserved_keyword' },
      { scenario: 'finally 關鍵字', keyword: 'finally', expectedConflictType: 'reserved_keyword' },
      { scenario: 'throw 關鍵字', keyword: 'throw', expectedConflictType: 'reserved_keyword' },
      // TypeScript 關鍵字
      { scenario: 'interface 關鍵字', keyword: 'interface', expectedConflictType: 'reserved_keyword' },
      { scenario: 'enum 關鍵字', keyword: 'enum', expectedConflictType: 'reserved_keyword' },
      { scenario: 'type 關鍵字', keyword: 'type', expectedConflictType: 'reserved_keyword' },
      // 模組關鍵字
      { scenario: 'import 關鍵字', keyword: 'import', expectedConflictType: 'reserved_keyword' },
      { scenario: 'export 關鍵字', keyword: 'export', expectedConflictType: 'reserved_keyword' },
      { scenario: 'default 關鍵字', keyword: 'default', expectedConflictType: 'reserved_keyword' },
      { scenario: 'from 關鍵字', keyword: 'from', expectedConflictType: 'reserved_keyword' },
      { scenario: 'as 關鍵字', keyword: 'as', expectedConflictType: 'reserved_keyword' },
    ];

    it.each(reservedKeywordConflicts)(
      '重命名為「$keyword」應該產生衝突（$scenario）',
      async ({ keyword, expectedConflictType }) => {
        // Given: 存在有效符號 UserAddress

        // When: 嘗試重命名為保留字
        const result = await executeCLI(
          ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', keyword, '--dry-run', '--format', 'json'],
          { memfs: fixture.memfs }
        );

        // Then: 應該成功但帶有衝突資訊
        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);

        // 檢查衝突陣列
        expect(output.conflicts).toBeDefined();
        expect(Array.isArray(output.conflicts)).toBe(true);
        expect(output.conflicts.length).toBeGreaterThan(0);

        const hasConflict = output.conflicts.some(
          (c: { type: string }) => c.type === expectedConflictType
        );
        expect(hasConflict).toBe(true);

        // summary 也應該有 conflictCount
        expect(output.summary.conflictCount).toBeGreaterThan(0);
      }
    );
  });

  // MARK: - 無效識別符邊界

  describe('無效識別符邊界條件', () => {
    const invalidIdentifiers: InvalidIdentifierCase[] = [
      // 數字相關
      { scenario: '數字開頭', identifier: '1UserAddress', expectedBehavior: 'conflict' },
      { scenario: '純數字', identifier: '12345', expectedBehavior: 'conflict' },
      { scenario: '數字開頭混合', identifier: '123abc', expectedBehavior: 'conflict' },
      // 運算子字元
      { scenario: '包含減號', identifier: 'User-Address', expectedBehavior: 'conflict' },
      { scenario: '包含加號', identifier: 'User+Address', expectedBehavior: 'conflict' },
      { scenario: '包含乘號', identifier: 'User*Address', expectedBehavior: 'conflict' },
      { scenario: '包含除號', identifier: 'User/Address', expectedBehavior: 'conflict' },
      { scenario: '包含等號', identifier: 'User=Address', expectedBehavior: 'conflict' },
      { scenario: '包含百分號', identifier: 'User%Address', expectedBehavior: 'conflict' },
      { scenario: '包含 @ 符號', identifier: 'User@Address', expectedBehavior: 'conflict' },
      { scenario: '包含 # 符號', identifier: 'User#Address', expectedBehavior: 'conflict' },
      { scenario: '包含 ^ 符號', identifier: 'User^Address', expectedBehavior: 'conflict' },
      { scenario: '包含 & 符號', identifier: 'User&Address', expectedBehavior: 'conflict' },
      // 括號類
      { scenario: '包含括號', identifier: 'User(Address)', expectedBehavior: 'conflict' },
      { scenario: '包含方括號', identifier: 'User[Address]', expectedBehavior: 'conflict' },
      { scenario: '包含花括號', identifier: 'User{Address}', expectedBehavior: 'conflict' },
      // 空白字元
      { scenario: '包含空格', identifier: 'User Address', expectedBehavior: 'conflict' },
      { scenario: '包含 Tab', identifier: 'User\tAddress', expectedBehavior: 'conflict' },
      { scenario: '開頭空格', identifier: ' UserAddress', expectedBehavior: 'conflict' },
      { scenario: '結尾空格', identifier: 'UserAddress ', expectedBehavior: 'conflict' },
      // 特殊字元
      { scenario: '包含問號', identifier: 'User?Address', expectedBehavior: 'conflict' },
      { scenario: '包含驚嘆號', identifier: 'User!Address', expectedBehavior: 'conflict' },
      { scenario: '包含冒號', identifier: 'User:Address', expectedBehavior: 'conflict' },
      { scenario: '包含分號', identifier: 'User;Address', expectedBehavior: 'conflict' },
      { scenario: '包含逗號', identifier: 'User,Address', expectedBehavior: 'conflict' },
      { scenario: '包含句號', identifier: 'User.Address', expectedBehavior: 'conflict' },
      // 引號
      { scenario: '包含單引號', identifier: 'User\'Address', expectedBehavior: 'conflict' },
      { scenario: '包含雙引號', identifier: 'User"Address', expectedBehavior: 'conflict' },
      { scenario: '包含反引號', identifier: 'User`Address', expectedBehavior: 'conflict' },
    ];

    it.each(invalidIdentifiers)(
      '$scenario「$identifier」應該 $expectedBehavior',
      async ({ identifier, expectedBehavior }) => {
        // Given: 存在有效符號

        // When: 嘗試重命名為無效識別符
        const result = await executeCLI(
          ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', identifier, '--dry-run', '--format', 'json'],
          { memfs: fixture.memfs }
        );

        // Then: 根據預期行為驗證
        if (expectedBehavior === 'error') {
          expect(result.exitCode).toBe(1);
        } else if (expectedBehavior === 'conflict') {
          // 衝突時仍然成功，但會有衝突資訊
          expect(result.exitCode).toBe(0);
          const output = JSON.parse(result.stdout);
          expect(output.success).toBe(true);
          expect(output.conflicts?.length ?? 0).toBeGreaterThan(0);
          // 應該是 invalid_identifier 類型的衝突
          const hasInvalidConflict = output.conflicts?.some(
            (c: { type: string }) => c.type === 'invalid_identifier'
          );
          expect(hasInvalidConflict).toBe(true);
        } else {
          expect(result.exitCode).toBe(0);
        }
      }
    );
  });

  // MARK: - 有效識別符確認

  describe('有效識別符確認', () => {
    const validIdentifiers = [
      // 標準命名
      { scenario: '駝峰命名', identifier: 'userAddress' },
      { scenario: '帕斯卡命名', identifier: 'UserAddress' },
      { scenario: '蛇形命名', identifier: 'user_address' },
      { scenario: '常數命名', identifier: 'USER_ADDRESS' },
      // 特殊合法字元
      { scenario: '底線開頭', identifier: '_userAddress' },
      { scenario: '雙底線開頭', identifier: '__userAddress' },
      { scenario: '美元符號開頭', identifier: '$userAddress' },
      { scenario: '美元符號結尾', identifier: 'userAddress$' },
      { scenario: '底線結尾', identifier: 'userAddress_' },
      // 數字位置
      { scenario: '數字在中間', identifier: 'user2Address' },
      { scenario: '數字結尾', identifier: 'userAddress2' },
      { scenario: '多個數字', identifier: 'user123Address456' },
      // 混合
      { scenario: '底線和數字混合', identifier: '_user_123' },
      { scenario: '美元符號和數字混合', identifier: '$user123' },
      // 單字元
      { scenario: '單字母', identifier: 'x' },
      { scenario: '單底線', identifier: '_' },
      { scenario: '單美元符號', identifier: '$' },
    ];

    it.each(validIdentifiers)(
      '$scenario「$identifier」應該成功',
      async ({ identifier }) => {
        // Given: 存在有效符號

        // When: 重命名為有效識別符
        const result = await executeCLI(
          ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', identifier, '--dry-run', '--format', 'json'],
          { memfs: fixture.memfs }
        );

        // Then: 應該成功且無警告
        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.success).toBe(true);
        // 有效識別符不應該有 InvalidIdentifier 警告
        const hasInvalidWarning = output.warnings?.some(
          (w: string) => w.includes('InvalidIdentifier')
        );
        expect(hasInvalidWarning ?? false).toBe(false);
      }
    );
  });

  // MARK: - 同名符號消歧

  describe('同名符號消歧（--at 參數）', () => {
    // 注意：sample-project 中 userId 在多個檔案中定義
    const multiSymbolCases: MultiSymbolCase[] = [
      {
        scenario: '不指定 --at 應報錯（多個同名符號）',
        symbolName: 'userId',
        shouldSucceed: false,
        expectedError: '同名符號',
      },
      {
        scenario: '指定有效 --at（file:line:column）應成功',
        symbolName: 'userId',
        atValue: 'src/types/order.ts:61:2',
        shouldSucceed: true,
      },
      {
        scenario: '唯一符號不需要 --at',
        symbolName: 'UserAddress',
        shouldSucceed: true,
      },
    ];

    it.each(multiSymbolCases)(
      '$scenario',
      async ({ symbolName, atValue, shouldSucceed, expectedError }) => {
        // Given: 符號可能有多個定義

        // When: 執行重命名
        const args = [
          'rename',
          '--path', fixture.rootPath,
          '--from', symbolName,
          '--to', `New${symbolName}`,
          '--dry-run',
          '--format', 'json'
        ];

        if (atValue) {
          args.push('--at', atValue);
        }

        const result = await executeCLI(args, { memfs: fixture.memfs });

        // Then: 驗證結果
        if (shouldSucceed) {
          expect(result.exitCode).toBe(0);
          const output = JSON.parse(result.stdout);
          expect(output.success).toBe(true);
        } else {
          expect(result.exitCode).toBe(1);
          if (expectedError) {
            const output = result.stderr || result.stdout;
            expect(output).toContain(expectedError);
          }
        }
      }
    );

    it('--at 指定不存在的位置應報錯', async () => {
      // Given: 多個同名符號

      // When: 使用不存在的位置
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'newUserId', '--at', 'nonexistent.ts:1:1', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗
      expect(result.exitCode).toBe(1);
      const output = result.stderr || result.stdout;
      expect(output).toContain('找不到');
    });

    it('--at 應支援完整路徑格式（file:line:column）', async () => {
      // Given: 多個同名符號

      // When: 使用完整位置格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'userId', '--to', 'newUserId', '--at', 'src/types/order.ts:61:2', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  // MARK: - 衝突警告輸出

  describe('衝突警告輸出格式', () => {
    it('JSON 格式應包含 conflicts 陣列', async () => {
      // Given: 會產生衝突的重命名

      // When: 執行重命名為保留字
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'var', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: JSON 應包含 conflicts
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('conflicts');
      expect(Array.isArray(output.conflicts)).toBe(true);
      expect(output.conflicts.length).toBeGreaterThan(0);

      // 每個衝突應該有 type 和 message
      for (const conflict of output.conflicts) {
        expect(conflict).toHaveProperty('type');
        expect(conflict).toHaveProperty('message');
      }
    });

    it('summary 格式應顯示衝突數量', async () => {
      // Given: 會產生衝突的重命名

      // When: 使用 summary 格式
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'function', '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBeTruthy();
    });

    it('衝突不應阻止 dry-run 預覽', async () => {
      // Given: 會產生衝突的重命名

      // When: 執行 dry-run
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'const', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功並顯示預覽
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThan(0);
      // 仍然應該有衝突資訊
      expect(output.conflicts.length).toBeGreaterThan(0);
    });
  });

  // MARK: - 複合衝突情境

  describe('複合衝突情境', () => {
    it('無效識別符應產生 invalid_identifier 衝突', async () => {
      // Given: 嘗試重命名為數字開頭的識別符

      // When: 使用無效的識別符
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', '1function', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功但有衝突
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.conflicts?.length ?? 0).toBeGreaterThan(0);

      const hasInvalidConflict = output.conflicts?.some(
        (c: { type: string }) => c.type === 'invalid_identifier'
      );
      expect(hasInvalidConflict).toBe(true);
    });

    it('空字串應該報錯', async () => {
      // Given: 空的新名稱

      // When: 嘗試重命名為空字串
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', '', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗
      expect(result.exitCode).toBe(1);
    });

    it('只有空白的字串應該報錯', async () => {
      // Given: 只有空白的新名稱

      // When: 嘗試重命名為空白字串
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', '   ', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該失敗
      expect(result.exitCode).toBe(1);
    });
  });

  // MARK: - 衝突解決行為

  describe('衝突解決行為', () => {
    it('帶衝突的重命名在非 dry-run 時也能執行', async () => {
      // Given: 會產生衝突的重命名（保留字）

      // 先記錄原始內容
      const originalContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      expect(originalContent).toContain('UserAddress');

      // When: 執行實際重命名（帶衝突）
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'type', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功執行（儘管有衝突警告）
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);

      // 檔案應該被修改
      const modifiedContent = await fixture.memfs.readFile(
        `${fixture.rootPath}/src/types/user.ts`,
        'utf-8'
      );
      // 檢查有變更發生（不檢查具體內容，因為 'type' 是常見字串）
      expect(modifiedContent).not.toBe(originalContent);
    });

    it('無效識別符衝突不應阻止預覽', async () => {
      // Given: 無效識別符

      // When: dry-run 預覽
      const result = await executeCLI(
        ['rename', '--path', fixture.rootPath, '--from', 'UserAddress', '--to', 'User-Address', '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      // Then: 應該成功顯示預覽
      expect(result.exitCode).toBe(0);

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.summary.totalChanges).toBeGreaterThan(0);
      expect(output.conflicts?.length ?? 0).toBeGreaterThan(0);
    });
  });
});
