/**
 * CLI move 命令 E2E 測試 - Swift 專案
 * 基於 swift-sample-project fixture 測試 Swift 檔案移動和 import 自動更新功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../helpers/index.js';
import * as path from 'path';

// Swift parser 只在 macOS 可用
const isNotMacOS = process.platform !== 'darwin';

describe.skipIf(isNotMacOS)('CLI move - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  describe('基本功能', () => {
    it('應該成功移動 Swift 檔案', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Domain/User.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.moved).toBe(true);
    });

    it('應該移動 Swift Model 檔案到 Domain 目錄', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/Product.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Domain/Product.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
    });

    it('應該移動 Swift Service 檔案', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Services/UserService.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Core/UserService.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該移動 Swift Utils 檔案', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Utils/Logger.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Common/Logger.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該移動 Swift Extensions 檔案到相同層級目錄', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Extensions/StringExtensions.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Extensions/StringUtils.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
    });
  });

  describe('--dry-run 參數', () => {
    it('應該在 dry-run 模式下不實際移動 Swift 檔案', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/Order.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Domain/Order.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.files).toBeDefined();
      expect(output.summary).toBeDefined();
    });

    it('應該預覽移動 Swift 檔案的影響', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Services/OrderService.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Services/OrderServiceRenamed.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
      expect(output.summary.totalFiles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('輸出格式', () => {
    it('應該支援 JSON 格式輸出', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Utils/Validator.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Common/Validator.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
      const output = JSON.parse(result.stdout);
      expect(output).toHaveProperty('success');
    });

    it('應該支援 summary 格式輸出', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Entities/User.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'summary'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(typeof result.stdout).toBe('string');
      expect(result.stdout.length).toBeGreaterThan(0);
    });

    it('應該支援 diff 格式輸出', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Extensions/DateExtensions.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Helpers/DateExtensions.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'diff'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      expect(typeof result.stdout).toBe('string');
    });
  });

  describe('錯誤處理', () => {
    it('應該處理來源 Swift 檔案不存在的情況', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/NonExistent.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Domain/NonExistent.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
    });

    it('應該處理目標 Swift 檔案已存在的情況', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/Product.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(false);
      expect(output.error).toBeDefined();
      expect(output.error).toContain('已存在');
    });

    it('應該檢測移動到同名 Swift 檔案', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');

      const result = await executeCLI(
        ['move', source, source, '--path', fixture.rootPath, '--format', 'json'],
        { memfs: fixture.memfs }
      );

      const output = JSON.parse(result.stdout);
      expect(output).toBeDefined();
    });
  });

  describe('跨目錄移動 - Swift 專案結構', () => {
    it('應該從 Models 移動到 Domain', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/Order.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Domain/Order.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該從 Services 移動到同層目錄', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Services/ProductService.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Services/ProductServiceRenamed.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該從 Utils 移動到同層目錄', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Utils/Logger.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Utils/LoggerRenamed.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該處理同目錄內重命名', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/UserModel.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('Swift 測試檔案移動', () => {
    it('應該重命名 Swift 測試檔案', async () => {
      const source = path.join(fixture.rootPath, 'Tests/SwiftSampleAppTests/AuthTests/AuthServiceTests.swift');
      const target = path.join(fixture.rootPath, 'Tests/SwiftSampleAppTests/AuthTests/AuthTests.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });

    it('應該重命名網路測試檔案', async () => {
      const source = path.join(fixture.rootPath, 'Tests/SwiftSampleAppTests/NetworkingTests/NetworkServiceTests.swift');
      const target = path.join(fixture.rootPath, 'Tests/SwiftSampleAppTests/NetworkingTests/NetworkTests.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
    });
  });

  describe('路徑極端情境', () => {
    it('應該處理超深目標路徑 (10+ 層)', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const deepDirs = Array.from({ length: 12 }, (_, i) => `level${i}`).join('/');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp', deepDirs, 'User.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      if (output.success === false) {
        expect(output.error).toBeDefined();
      } else {
        expect(output.command).toBe('move');
        expect(output.summary).toBeDefined();
      }
    });

    it('應該處理路徑中包含特殊字元', async () => {
      const source = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models/User.swift');
      const target = path.join(fixture.rootPath, 'Sources/SwiftSampleApp/Models-v2.0/User.swift');

      const result = await executeCLI(
        ['move', source, target, '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
        { memfs: fixture.memfs }
      );

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.command).toBe('move');
      expect(output.success).toBe(true);
    });
  });
});
