/**
 * CLI Swift refactor E2E 測試
 * 使用 swift-sample-project fixture 進行真實重構場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI swift refactor - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('提取函式', () => {
    it('應該能從 ViewModel 提取方法邏輯', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift'),
        '--start-line',
        '30',
        '--end-line',
        '35',
        '--new-name',
        'handleUserLoadError',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.extractedFunction).toBeDefined();
      expect(output.extractedFunction.name).toBe('handleUserLoadError');

      const content = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift');
      expect(content).toContain('func handleUserLoadError');
    });

    it('應該能從 Service 提取驗證邏輯', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '44',
        '--end-line',
        '52',
        '--new-name',
        'performUserValidation',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(content).toContain('func performUserValidation');
    });

    it('應該能從 OrderViewModel 提取訂單計算邏輯', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/OrderViewModel.swift'),
        '--start-line',
        '51',
        '--end-line',
        '54',
        '--new-name',
        'computeTotal',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/OrderViewModel.swift');
      expect(content).toContain('func computeTotal');
    });

    it('應該能從 NetworkService 提取請求處理', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/NetworkService.swift'),
        '--start-line',
        '24',
        '--end-line',
        '28',
        '--new-name',
        'buildRequest',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/NetworkService.swift');
      expect(content).toContain('func buildRequest');
    });

    it('應該支援預覽提取變更', async () => {
      const originalContent = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');

      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '20',
        '--end-line',
        '25',
        '--new-name',
        'handleFetchResponse',
        '--preview'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/預覽|preview/);

      // 驗證檔案未被修改
      const currentContent = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(currentContent).toBe(originalContent);
    });

    it('應該能提取包含 guard 語句的邏輯', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/OrderViewModel.swift'),
        '--start-line',
        '44',
        '--end-line',
        '50',
        '--new-name',
        'processCheckout',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/OrderViewModel.swift');
      expect(content).toContain('func processCheckout');
      // 確保 guard 語句被保留
      expect(content).toContain('guard');
    });
  });

  describe('提取閉包', () => {
    it('應該能提取 Combine map 閉包', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-closure',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/ProductViewModel.swift'),
        '--start-line',
        '26',
        '--end-line',
        '29',
        '--new-name',
        'filterProductsByCategory',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/ProductViewModel.swift');
      expect(content).toContain('filterProductsByCategory');
    });

    it('應該能提取 SwiftUI ViewBuilder 閉包', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-closure',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift'),
        '--start-line',
        '36',
        '--end-line',
        '42',
        '--new-name',
        'createUserHandler',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('應該能提取 completion handler 閉包', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-closure',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/ProductService.swift'),
        '--start-line',
        '18',
        '--end-line',
        '22',
        '--new-name',
        'handleFetchComplete',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('各層級提取', () => {
    it('應該能從 ViewModel 提取', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift'),
        '--start-line',
        '45',
        '--end-line',
        '52',
        '--new-name',
        'checkFormValidity',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift');
      expect(content).toContain('func checkFormValidity');
    });

    it('應該能從 Service 提取', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/OrderService.swift'),
        '--start-line',
        '36',
        '--end-line',
        '40',
        '--new-name',
        'sumItemPrices',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/OrderService.swift');
      expect(content).toContain('func sumItemPrices');
    });

    it('應該能從 Model 提取（computed property）', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/Product.swift'),
        '--start-line',
        '21',
        '--end-line',
        '23',
        '--new-name',
        'checkAvailability',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('應該能從 Extension 提取', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Extensions/String+Extensions.swift'),
        '--start-line',
        '7',
        '--end-line',
        '9',
        '--new-name',
        'isEmpty',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('應該能從 Utils 提取', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Formatter.swift'),
        '--start-line',
        '8',
        '--end-line',
        '12',
        '--new-name',
        'createCurrencyFormatter',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理缺少必要參數', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '20'
        // 缺少 end-line 和 new-name
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/required|missing|缺少/);
    });

    it('應該處理無效行號範圍', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '100',
        '--end-line',
        '50', // end 小於 start
        '--new-name',
        'invalidRange'
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/invalid|range|範圍/);
    });

    it('應該處理檔案不存在', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('NonExistent.swift'),
        '--start-line',
        '1',
        '--end-line',
        '5',
        '--new-name',
        'test'
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/not found|找不到|does not exist/);
    });

    it('應該處理不支援的重構操作', async () => {
      const result = await executeCLI([
        'refactor',
        'unsupported-operation',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift')
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/unknown|unsupported|不支援/);
    });
  });

  describe('進階場景', () => {
    it('應該處理包含泛型的程式碼', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/NetworkService.swift'),
        '--start-line',
        '18',
        '--end-line',
        '22',
        '--new-name',
        'createGenericRequest',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/NetworkService.swift');
      expect(content).toContain('createGenericRequest');
    });

    it('應該處理包含 async/await 的程式碼', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '15',
        '--end-line',
        '27',
        '--new-name',
        'fetchUsersAsync',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(content).toContain('async');
    });

    it('應該處理包含 @Published 的程式碼', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift'),
        '--start-line',
        '28',
        '--end-line',
        '32',
        '--new-name',
        'loadUsersWithPublished',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('應該能從 SwiftUI View 提取 ViewBuilder', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/ProductViewModel.swift'),
        '--start-line',
        '25',
        '--end-line',
        '30',
        '--new-name',
        'buildFilteredList',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('正確性驗證', () => {
    it('應該提取後產生正確函式定義', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/OrderService.swift'),
        '--start-line',
        '20',
        '--end-line',
        '28',
        '--new-name',
        'buildOrder',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.extractedFunction).toBeDefined();
      expect(output.extractedFunction.name).toBe('buildOrder');
      expect(output.extractedFunction.parameters).toBeDefined();

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/OrderService.swift');
      expect(content).toContain('func buildOrder');
      expect(content).toMatch(/func buildOrder\([^)]*\)/);
    });

    it('應該正確處理返回值（Result type）', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--start-line',
        '44',
        '--end-line',
        '52',
        '--new-name',
        'validateUserData',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const content = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(content).toContain('func validateUserData');
      // 應該有 throws 關鍵字
      expect(content).toMatch(/func validateUserData.*throws/);
    });

    it('應該正確處理外部變數引用', async () => {
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/ViewModels/OrderViewModel.swift'),
        '--start-line',
        '38',
        '--end-line',
        '42',
        '--new-name',
        'addCartItem',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 應該檢測到外部變數並加入參數
      expect(output.extractedFunction.parameters).toBeDefined();
      expect(output.extractedFunction.parameters.length).toBeGreaterThan(0);
    });

    it('應該重新索引後能找到新函式', async () => {
      await executeCLI([
        'refactor',
        'extract-function',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/ProductService.swift'),
        '--start-line',
        '28',
        '--end-line',
        '34',
        '--new-name',
        'getStockInfo'
      ]);

      // 重新建立索引
      await executeCLI([
        'index',
        'create',
        '--path',
        fixture.tempPath
      ]);

      // 搜尋新函式
      const searchResult = await executeCLI([
        'search',
        'symbol',
        '--query',
        'getStockInfo',
        '--path',
        fixture.tempPath,
        '--format',
        'json'
      ]);

      expect(searchResult.exitCode).toBe(0);
      const output = JSON.parse(searchResult.stdout);
      expect(output.results).toBeDefined();
      expect(output.results.length).toBeGreaterThan(0);
      expect(output.results.some((r: any) => r.name === 'getStockInfo')).toBe(true);
    });
  });
});
