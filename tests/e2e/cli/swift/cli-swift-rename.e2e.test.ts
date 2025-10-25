/**
 * CLI Swift rename E2E 測試
 * 使用 swift-sample-project fixture 進行真實複雜場景測試
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from '../../helpers/fixture-manager';
import { executeCLI } from '../../helpers/cli-executor';

describe('CLI swift rename - 基於 swift-sample-project fixture', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('swift-sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基礎重命名', () => {
    it('應該能重命名 struct（跨多檔案引用）', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/User.swift'),
        '--symbol',
        'User',
        '--new-name',
        'UserProfile',
        '--type',
        'struct',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // 驗證有多個檔案被修改
      expect(output.affectedFiles).toBeGreaterThan(1);

      // 驗證新名稱存在
      const userFile = await fixture.readFile('Sources/SwiftSampleApp/Shared/Models/User.swift');
      expect(userFile).toContain('struct UserProfile');
      expect(userFile).not.toContain('struct User {');

      // 驗證引用檔案（UserService 引用 User）
      const userService = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(userService).toContain('UserProfile');
    });

    it('應該能重命名 class', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--symbol',
        'UserService',
        '--new-name',
        'PersonService',
        '--type',
        'class',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      expect(output.affectedFiles).toBeGreaterThan(0);

      // 驗證定義
      const serviceFile = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(serviceFile).toContain('class PersonService');
      expect(serviceFile).not.toContain('class UserService');

      // 驗證 ViewModel 引用
      const viewModel = await fixture.readFile('Sources/SwiftSampleApp/ViewModels/UserViewModel.swift');
      expect(viewModel).toContain('PersonService');
    });

    it('應該能重命名 protocol', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Protocols/Repository.swift'),
        '--symbol',
        'Repository',
        '--new-name',
        'DataRepository',
        '--type',
        'protocol',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const protocolFile = await fixture.readFile('Sources/SwiftSampleApp/Shared/Protocols/Repository.swift');
      expect(protocolFile).toContain('protocol DataRepository');
      expect(protocolFile).not.toContain('protocol Repository {');
    });

    it('應該處理找不到符號的錯誤', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.tempPath,
        '--symbol',
        'NonExistentSymbol',
        '--new-name',
        'NewName',
        '--type',
        'class'
      ]);

      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/找不到|not found|cannot find/);
    });
  });

  describe('複雜場景', () => {
    it('應該能重命名跨多層目錄的 protocol', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift'),
        '--symbol',
        'Validatable',
        '--new-name',
        'Checkable',
        '--type',
        'protocol',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const protocolFile = await fixture.readFile('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift');
      expect(protocolFile).toContain('protocol Checkable');
    });

    it('應該能重命名影響所有子類別的 class', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/NetworkService.swift'),
        '--symbol',
        'NetworkService',
        '--new-name',
        'APIService',
        '--type',
        'class',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      // 驗證定義
      const networkFile = await fixture.readFile('Sources/SwiftSampleApp/Services/NetworkService.swift');
      expect(networkFile).toContain('class APIService');

      // 驗證所有引用 NetworkService 的服務
      const userService = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(userService).toContain('APIService');

      const productService = await fixture.readFile('Sources/SwiftSampleApp/Services/ProductService.swift');
      expect(productService).toContain('APIService');
    });

    it('應該能重命名 enum 及其 cases', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/User.swift'),
        '--symbol',
        'UserRole',
        '--new-name',
        'AccountRole',
        '--type',
        'enum',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const userFile = await fixture.readFile('Sources/SwiftSampleApp/Shared/Models/User.swift');
      expect(userFile).toContain('enum AccountRole');
      expect(userFile).not.toContain('enum UserRole');

      // 驗證引用
      const userService = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(userService).toContain('AccountRole');
    });

    it('應該能重命名泛型型別', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/NetworkService.swift'),
        '--symbol',
        'ApiResponse',
        '--new-name',
        'NetworkResponse',
        '--type',
        'struct',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const networkFile = await fixture.readFile('Sources/SwiftSampleApp/Services/NetworkService.swift');
      expect(networkFile).toContain('struct NetworkResponse');

      // 驗證泛型使用
      expect(networkFile).toMatch(/NetworkResponse<.*>/);
    });

    it('應該能重命名被 protocol extension 的符號', async () => {
      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift'),
        '--symbol',
        'ValidationError',
        '--new-name',
        'CheckError',
        '--type',
        'enum',
        '--format',
        'json'
      ]);

      expect(result.exitCode).toBe(0);

      const validatableFile = await fixture.readFile('Sources/SwiftSampleApp/Shared/Protocols/Validatable.swift');
      expect(validatableFile).toContain('enum CheckError');
      expect(validatableFile).not.toContain('enum ValidationError');
    });
  });

  describe('驗證機制', () => {
    it('應該驗證所有修改的檔案', async () => {
      await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/Product.swift'),
        '--symbol',
        'Product',
        '--new-name',
        'Item',
        '--type',
        'struct'
      ]);

      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles.length).toBeGreaterThan(0);

      // 至少應該修改定義檔案
      expect(modifiedFiles.some(f => f.includes('Product.swift'))).toBe(true);
    });

    it('應該保持檔案完整性（無語法錯誤）', async () => {
      await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Shared/Models/Order.swift'),
        '--symbol',
        'Order',
        '--new-name',
        'Purchase',
        '--type',
        'struct'
      ]);

      // 讀取修改後的檔案，確保仍然是有效的 Swift
      const content = await fixture.readFile('Sources/SwiftSampleApp/Shared/Models/Order.swift');
      expect(content).toBeTruthy();
      expect(content).toContain('struct Purchase');

      // 確保沒有語法錯誤的標記（如孤立的 struct 關鍵字）
      expect(content.match(/^struct\s+$/m)).toBeNull();
    });

    it('應該支援 preview 模式（不實際修改檔案）', async () => {
      const originalContent = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');

      const result = await executeCLI([
        'rename',
        '--path',
        fixture.getFilePath('Sources/SwiftSampleApp/Services/UserService.swift'),
        '--symbol',
        'UserService',
        '--new-name',
        'UserManager',
        '--preview'
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toLowerCase()).toMatch(/預覽|preview/);

      // 驗證檔案未被修改
      const currentContent = await fixture.readFile('Sources/SwiftSampleApp/Services/UserService.swift');
      expect(currentContent).toBe(originalContent);
    });
  });
});
