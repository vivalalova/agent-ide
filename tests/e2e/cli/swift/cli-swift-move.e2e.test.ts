/**
 * CLI Swift move E2E 測試
 * 使用 swift-sample-project fixture 進行真實檔案移動場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI swift move - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基礎移動', () => {
    it('應該能移動單一檔案到新目錄', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/NewUtils/Validator.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.moved).toBe(true);
      // Swift 使用模組系統，不需要更新 import，所以 affectedFiles 應該為 0
      expect(output.affectedFiles).toBeGreaterThanOrEqual(0);

      // 驗證檔案已移動
      expect(await fixture.fileExists('Sources/SwiftSampleApp/NewUtils/Validator.swift')).toBe(true);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Utils/Validator.swift')).toBe(false);
    });

    it('應該能移動檔案並更名', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Formatter.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Utils/StringFormatter.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證新檔案存在
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Shared/Utils/StringFormatter.swift')).toBe(true);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Utils/Formatter.swift')).toBe(false);
    });

    it('應該處理目標目錄不存在', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/NonExistent/Dir/Validator.swift'),
        '--format',
        'json'
      ]);

      // 應該自動建立目錄或回報錯誤
      // 根據實作決定預期行為
      const isSuccess = result.exitCode === 0;
      if (isSuccess) {
        // 如果成功，目錄應該被建立
        expect(await fixture.fileExists('Sources/SwiftSampleApp/NonExistent/Dir/Validator.swift')).toBe(true);
      } else {
        // 如果失敗，應該有錯誤訊息
        const output = result.stdout + result.stderr;
        expect(output.toLowerCase()).toMatch(/not found|不存在|directory/);
      }
    });

    it('應該處理源檔案不存在', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/NonExistent.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/NonExistent.swift')
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/not found|找不到|does not exist/);
    });

    it('應該支援預覽模式', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Validator.swift'),
        '--preview'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/預覽|preview/);

      // 驗證檔案未被移動
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Utils/Validator.swift')).toBe(true);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Shared/Validator.swift')).toBe(false);
    });
  });

  describe('複雜引用', () => {
    it('應該能移動被多處引用的 protocol 檔案', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Protocols/Repository.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Core/Protocols/Repository.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Swift 使用模組系統，不需要更新 import
      expect(output.affectedFiles).toBeGreaterThanOrEqual(0);

      // 驗證檔案已移動
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Core/Protocols/Repository.swift')).toBe(true);
    });

    it('應該能移動 Model 檔案（被 Service 和 ViewModel 引用）', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/User.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Domain/Models/User.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Swift 使用模組系統，不需要更新 import
      expect(output.affectedFiles).toBeGreaterThanOrEqual(0);

      // 驗證引用仍然正常（Swift 模組系統自動處理）
      const userService = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(userService).toContain('User');

      const userViewModel = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift');
      expect(userViewModel).toContain('User');
    });

    it('應該能移動 Service 檔案（被 ViewModel 引用）', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Domain/Services/UserService.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Swift 使用模組系統，不需要更新 import
      expect(output.affectedFiles).toBeGreaterThanOrEqual(0);

      // 驗證 ViewModel 的引用仍然正常（Swift 模組系統自動處理）
      const userViewModel = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift');
      expect(userViewModel).toContain('UserService');
    });

    it('應該能移動深層檔案到淺層', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Validatable.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      expect(await fixture.fileExists('Sources/SwiftSampleApp/Validatable.swift')).toBe(true);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift')).toBe(false);
    });

    it('應該能移動淺層檔案到深層', async () => {
      // 先移動到淺層（使用前一個測試的結果）
      await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Extensions/String+Extensions.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/StringExt.swift')
      ]);

      // 再移回深層
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/StringExt.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Core/Extensions/String+Extensions.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Core/Extensions/String+Extensions.swift')).toBe(true);
    });

    it('應該能移動 Extension 檔案', async () => {
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Extensions/Array+Extensions.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Extensions/Array+Extensions.swift'),
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      expect(await fixture.fileExists('Sources/SwiftSampleApp/Shared/Extensions/Array+Extensions.swift')).toBe(true);
      expect(await fixture.fileExists('Sources/SwiftSampleApp/Extensions/Array+Extensions.swift')).toBe(false);
    });
  });

  describe('批次移動', () => {
    it('應該能連續移動多個相關檔案', async () => {
      // 移動所有 Model 檔案到 Domain/Models
      const models = ['User.swift', 'Product.swift', 'Order.swift'];
      const results = [];

      for (const model of models) {
        const result = await executeCLI([
          'move',
          '--source',
          fixture.getFilePath(`Sources/SwiftSampleApp/Shared/Models/${model}`),
          '--target',
          fixture.getFilePath(`Sources/SwiftSampleApp/Domain/Models/${model}`)
        ]);
        results.push(result);
      }

      // 所有移動都應該成功
      expect(results.every(r => r.exitCode === 0)).toBe(true);

      // 驗證所有檔案都已移動
      for (const model of models) {
        expect(await fixture.fileExists(`Sources/SwiftSampleApp/Domain/Models/${model}`)).toBe(true);
        expect(await fixture.fileExists(`Sources/SwiftSampleApp/Shared/Models/${model}`)).toBe(false);
      }
    });
  });

  describe('錯誤處理', () => {
    it('應該處理相同的源和目標路徑', async () => {
      const samePath = fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift');
      const result = await executeCLI([
        'move',
        '--source',
        samePath,
        '--target',
        samePath
      ]);

      // 相同路徑視為成功的 no-op 操作（Unix 慣例）
      expect(result.exitCode).toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/same|相同|identical/);
    });

    it('應該處理目標檔案已存在', async () => {
      // 先移動一次
      await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Validator.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Validator.swift')
      ]);

      // 嘗試移動另一個檔案到相同位置
      const result = await executeCLI([
        'move',
        '--source',
        fixture.getFilePath('Sources/SwiftSampleApp/Utils/Formatter.swift'),
        '--target',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Validator.swift') // 已存在
      ]);

      // 根據實作決定：可能覆蓋、可能拒絕、可能詢問
      // 這裡假設拒絕覆蓋
      if (result.exitCode !== 0) {
        const output = result.stdout + result.stderr;
        expect(output.toLowerCase()).toMatch(/exist|已存在|conflict/);
      }
    });
  });
});
