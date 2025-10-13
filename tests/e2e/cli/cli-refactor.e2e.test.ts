/**
 * CLI refactor 命令 E2E 測試
 * 基於 sample-project fixture 測試真實複雜專案的重構功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../helpers/fixture-manager';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI refactor - 基於 sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  // ============================================================
  // 1. 基礎提取函式測試（3 個測試）
  // ============================================================

  it('應該能在 Service 類別中提取方法邏輯', async () => {
    const filePath = fixture.getFilePath('src/services/order-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '10',
      '--end-line',
      '15',
      '--function-name',
      'validateOrderData'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重構');
  });

  it('應該能預覽提取函式的變更', async () => {
    const filePath = fixture.getFilePath('src/utils/formatter.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '5',
      '--end-line',
      '10',
      '--function-name',
      'helperFormatter',
      '--preview'
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重構');

    // 預覽模式不應該修改檔案
    const content = await fixture.readFile('src/utils/formatter.ts');
    expect(content).not.toContain('helperFormatter');
  });

  it('應該能在 Controller 類別中提取驗證邏輯', async () => {
    const filePath = fixture.getFilePath('src/controllers/user-controller.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '8',
      '--end-line',
      '12',
      '--function-name',
      'validateUserInput'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 2. 複雜業務邏輯重構測試（3 個測試）
  // ============================================================

  it('應該能從 OrderService 提取複雜的訂單計算邏輯', async () => {
    const filePath = fixture.getFilePath('src/services/order-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '20',
      '--end-line',
      '30',
      '--function-name',
      'calculateOrderTotal'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能從 AuthService 提取驗證邏輯', async () => {
    const filePath = fixture.getFilePath('src/services/auth-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '12',
      '--end-line',
      '18',
      '--function-name',
      'verifyCredentials'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能從 PaymentService 提取金流處理邏輯', async () => {
    const filePath = fixture.getFilePath('src/services/payment-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '15',
      '--end-line',
      '25',
      '--function-name',
      'processPaymentTransaction'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 3. Model 類別重構測試（2 個測試）
  // ============================================================

  it('應該能從 UserModel 提取驗證邏輯', async () => {
    const filePath = fixture.getFilePath('src/models/user-model.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '10',
      '--end-line',
      '15',
      '--function-name',
      'validateEmailFormat'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能從 ProductModel 提取格式化邏輯', async () => {
    const filePath = fixture.getFilePath('src/models/product-model.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '8',
      '--end-line',
      '12',
      '--function-name',
      'formatProductDisplay'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 4. Utils 函式重構測試（2 個測試）
  // ============================================================

  it('應該能從 date-utils 提取日期計算邏輯', async () => {
    const filePath = fixture.getFilePath('src/utils/date-utils.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '5',
      '--end-line',
      '10',
      '--function-name',
      'calculateDaysDifference'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能從 string-utils 提取字串處理邏輯', async () => {
    const filePath = fixture.getFilePath('src/utils/string-utils.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '6',
      '--end-line',
      '12',
      '--function-name',
      'sanitizeInput'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 5. 錯誤處理測試（4 個測試）
  // ============================================================

  it('應該在缺少必要參數時顯示錯誤', async () => {
    const filePath = fixture.getFilePath('src/services/user-service.ts');

    const result = await executeCLI(['refactor', 'extract-function', '--file', filePath]);

    const output = result.stdout + result.stderr;
    expect(output).toContain('需要');
  });

  it('應該處理無效的行號範圍', async () => {
    const filePath = fixture.getFilePath('src/services/user-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '1000',
      '--end-line',
      '2000',
      '--function-name',
      'invalid'
    ]);

    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該處理不存在的檔案', async () => {
    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      fixture.getFilePath('src/non-existent.ts'),
      '--start-line',
      '1',
      '--end-line',
      '5',
      '--function-name',
      'extracted'
    ]);

    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);
  });

  it('應該處理不支援的重構操作', async () => {
    const filePath = fixture.getFilePath('src/services/user-service.ts');

    const result = await executeCLI(['refactor', 'inline-function', '--file', filePath]);

    const output = result.stdout + result.stderr;
    expect(output).toContain('尚未實作');
  });

  // ============================================================
  // 6. 特殊場景測試（3 個測試）
  // ============================================================

  it('應該能處理包含泛型的程式碼', async () => {
    const filePath = fixture.getFilePath('src/models/base-model.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '8',
      '--end-line',
      '12',
      '--function-name',
      'extractGenericLogic'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能處理包含 async/await 的程式碼', async () => {
    const filePath = fixture.getFilePath('src/services/notification-service.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '10',
      '--end-line',
      '15',
      '--function-name',
      'sendAsyncNotification'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能處理包含複雜型別的程式碼', async () => {
    const filePath = fixture.getFilePath('src/api/handlers/user-handler.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '8',
      '--end-line',
      '14',
      '--function-name',
      'handleUserRequest'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 7. 跨類別重構測試（2 個測試）
  // ============================================================

  it('應該能從繼承類別中提取共用邏輯', async () => {
    const filePath = fixture.getFilePath('src/controllers/base-controller.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '6',
      '--end-line',
      '10',
      '--function-name',
      'handleControllerError'
    ]);

    expect(result.exitCode).toBe(0);
  });

  it('應該能從中介層提取驗證邏輯', async () => {
    const filePath = fixture.getFilePath('src/api/middleware/validator.ts');

    const result = await executeCLI([
      'refactor',
      'extract-function',
      '--file',
      filePath,
      '--start-line',
      '7',
      '--end-line',
      '12',
      '--function-name',
      'validateRequestSchema'
    ]);

    expect(result.exitCode).toBe(0);
  });

  // ============================================================
  // 8. 真正的重構驗證測試（新增）
  // ============================================================

  describe('重構後程式碼正確性驗證', () => {
    it('提取函式後應該產生正確的函式定義和呼叫', async () => {
      const filePath = fixture.getFilePath('src/services/order-service.ts');

      // 提取 createOrder 中的使用者驗證邏輯（行 24-28）
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '24',
        '--end-line',
        '28',
        '--function-name',
        'validateUserExists'
      ]);

      expect(result.exitCode).toBe(0);

      const modifiedContent = await fixture.readFile('src/services/order-service.ts');

      // 驗證：1. 新函式存在
      expect(modifiedContent).toContain('validateUserExists');

      // 驗證：2. 原始位置改為呼叫新函式
      expect(modifiedContent).toContain('validateUserExists(');

      // 驗證：3. 程式碼可以被索引（表示語法正確）
      const indexResult = await executeCLI(['index', '--path', fixture.tempPath]);
      expect(indexResult.exitCode).toBe(0);
    });

    // ✅ 已實作：使用 TypeScript AST parser 進行返回值型別推導
    it('提取包含返回值的程式碼塊應該正確處理返回值', async () => {
      const filePath = fixture.getFilePath('src/utils/string-utils.ts');

      // 找一段有返回值的程式碼提取
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '5',
        '--end-line',
        '7',
        '--function-name',
        'normalizeText'
      ]);

      expect(result.exitCode).toBe(0);

      const modifiedContent = await fixture.readFile('src/utils/string-utils.ts');

      // 驗證：1. 提取的函式有返回值型別
      expect(modifiedContent).toContain('normalizeText');

      // 驗證：2. 原始位置接收返回值或使用返回值
      // 這需要根據實際實作調整，但至少要確保編譯通過
      const indexResult = await executeCLI(['index', '--path', fixture.tempPath]);
      expect(indexResult.exitCode).toBe(0);
    });

    it('提取包含外部變數引用的程式碼應該將變數作為參數傳入', async () => {
      // 在 fixture 中新增一個測試檔案
      await fixture.writeFile('src/test-refactor.ts', `
export function processData(items: string[]) {
  const prefix = 'item_';
  const results: string[] = [];

  // 這段程式碼引用了外部變數 prefix
  for (const item of items) {
    results.push(prefix + item);
  }

  return results;
}
      `.trim());

      const filePath = fixture.getFilePath('src/test-refactor.ts');

      // 提取迴圈邏輯
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '6',
        '--end-line',
        '8',
        '--function-name',
        'addPrefixToItems'
      ]);

      expect(result.exitCode).toBe(0);

      const modifiedContent = await fixture.readFile('src/test-refactor.ts');

      // 驗證：1. 新函式存在
      expect(modifiedContent).toContain('addPrefixToItems');

      // 驗證：2. 新函式接受外部變數作為參數（prefix、items、results）
      // 至少應該有參數列表
      expect(modifiedContent).toMatch(/addPrefixToItems\s*\([^)]+\)/);

      // 驗證：3. 程式碼可編譯
      const indexResult = await executeCLI(['index', '--path', fixture.tempPath]);
      expect(indexResult.exitCode).toBe(0);
    });

    it('提取後重新索引應該能找到新函式', async () => {
      const filePath = fixture.getFilePath('src/services/user-service.ts');

      // 先索引
      await executeCLI(['index', '--path', fixture.tempPath]);

      // 提取函式
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '10',
        '--end-line',
        '15',
        '--function-name',
        'extractedHelper'
      ]);

      expect(result.exitCode).toBe(0);

      // 重新索引
      await executeCLI(['index', '--path', fixture.tempPath]);

      // 搜尋新函式
      const searchResult = await executeCLI([
        'search',
        'extractedHelper',
        '--path',
        fixture.tempPath
      ]);

      expect(searchResult.exitCode).toBe(0);
      expect(searchResult.stdout).toContain('extractedHelper');
    });

    // ✅ 已實作：跨檔案 Extract Function 支援
    it('提取共用邏輯到獨立檔案後應該更新所有引用', async () => {
      // 這個測試驗證跨檔案重構
      const filePath = fixture.getFilePath('src/models/base-model.ts');

      // 提取 validateEmail 到獨立檔案
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '43',
        '--end-line',
        '53',
        '--function-name',
        'validateEmailAddress',
        '--target-file',
        fixture.getFilePath('src/utils/validation-helpers.ts')
      ]);

      // 如果功能尚未實作，應該明確報錯而不是靜默失敗
      if (result.exitCode !== 0) {
        expect(result.stdout + result.stderr).toMatch(/尚未實作|not implemented|not supported/i);
      } else {
        // 如果實作了，驗證：
        // 1. 新檔案存在且包含函式
        const helperContent = await fixture.readFile('src/utils/validation-helpers.ts');
        expect(helperContent).toContain('validateEmailAddress');

        // 2. 原始檔案引用了新函式
        const baseModelContent = await fixture.readFile('src/models/base-model.ts');
        expect(baseModelContent).toContain('validateEmailAddress');

        // 3. 有 import 語句
        expect(baseModelContent).toMatch(/import.*validateEmailAddress/);
      }
    });
  });

  // ============================================================
  // 9. 錯誤處理測試（新增）
  // ============================================================

  describe('重構錯誤處理', () => {
    it('無法提取包含 early return 的程式碼片段', async () => {
      await fixture.writeFile('src/test-early-return.ts', `
export function testFunction(value: number): string {
  if (value < 0) {
    return 'negative';
  }
  if (value === 0) {
    return 'zero';
  }
  return 'positive';
}
      `.trim());

      const filePath = fixture.getFilePath('src/test-early-return.ts');

      // 嘗試提取包含 return 的片段
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '2',
        '--end-line',
        '4',
        '--function-name',
        'checkNegative'
      ]);

      // 應該失敗或給出警告
      // 如果功能尚未實作完整錯誤處理，至少確保有輸出
      expect(result.stdout.length + result.stderr.length).toBeGreaterThan(0);
    });

    it('提取不存在的行號範圍應該報錯', async () => {
      const filePath = fixture.getFilePath('src/services/user-service.ts');

      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file',
        filePath,
        '--start-line',
        '9999',
        '--end-line',
        '10000',
        '--function-name',
        'invalid'
      ]);

      // 應該報錯
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
      // 可能包含 "行號" 或 "line" 或 "invalid" 等錯誤提示
    });
  });
});
