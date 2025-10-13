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
});
