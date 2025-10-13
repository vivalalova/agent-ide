/**
 * Fixture 複雜度驗證測試
 * 驗證 sample-project fixture 符合複雜度要求
 */

import { describe, it, expect } from 'vitest';
import { loadFixture } from './helpers/fixture-manager';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('Fixture 複雜度驗證', () => {
  it('fixture 應該包含至少 30 個 TypeScript 檔案', async () => {
    const fixture = await loadFixture('sample-project');

    const allFiles = await fixture.listFiles();
    const tsFiles = allFiles.filter(file => file.endsWith('.ts'));

    expect(tsFiles.length).toBeGreaterThanOrEqual(30);

    await fixture.cleanup();
  });

  it('fixture 應該包含多層目錄結構', async () => {
    const fixture = await loadFixture('sample-project');

    // 驗證關鍵目錄存在
    const dirs = [
      'src/types',
      'src/models',
      'src/services',
      'src/controllers',
      'src/api/handlers',
      'src/api/middleware',
      'src/utils',
      'src/core/config'
    ];

    for (const dir of dirs) {
      const dirPath = path.join(fixture.tempPath, dir);
      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    await fixture.cleanup();
  });

  it('fixture 應該包含豐富的型別定義', async () => {
    const fixture = await loadFixture('sample-project');

    // 檢查核心型別檔案
    const userTypes = await fixture.readFile('src/types/user.ts');
    expect(userTypes).toContain('export enum UserRole');
    expect(userTypes).toContain('export enum UserStatus');
    expect(userTypes).toContain('export interface User');

    const productTypes = await fixture.readFile('src/types/product.ts');
    expect(productTypes).toContain('export enum ProductCategory');
    expect(productTypes).toContain('export interface Product');

    const apiTypes = await fixture.readFile('src/types/api.ts');
    expect(apiTypes).toContain('export interface ApiResponse<T');
    expect(apiTypes).toContain('export interface PaginatedResponse<T>');

    await fixture.cleanup();
  });

  it('fixture 應該包含跨檔案引用關係', async () => {
    const fixture = await loadFixture('sample-project');

    // UserModel 應該引用 User 型別
    const userModel = await fixture.readFile('src/models/user-model.ts');
    expect(userModel).toContain('import { User');
    expect(userModel).toContain('from \'../types/user\'');

    // UserService 應該引用 User 和 UserModel
    const userService = await fixture.readFile('src/services/user-service.ts');
    expect(userService).toContain('from \'../types/user\'');
    expect(userService).toContain('from \'../models/user-model\'');

    // UserController 應該引用 UserService
    const userController = await fixture.readFile('src/controllers/user-controller.ts');
    expect(userController).toContain('from \'../services/user-service\'');

    await fixture.cleanup();
  });

  it('fixture 應該包含繼承關係', async () => {
    const fixture = await loadFixture('sample-project');

    // 檢查 BaseModel 抽象類別
    const baseModel = await fixture.readFile('src/models/base-model.ts');
    expect(baseModel).toContain('export abstract class BaseModel');
    expect(baseModel).toContain('abstract validate()');

    // 檢查子類別繼承
    const userModel = await fixture.readFile('src/models/user-model.ts');
    expect(userModel).toContain('export class UserModel extends BaseModel<User>');

    const productModel = await fixture.readFile('src/models/product-model.ts');
    expect(productModel).toContain('export class ProductModel extends BaseModel<Product>');

    await fixture.cleanup();
  });

  it('fixture 應該包含泛型用法', async () => {
    const fixture = await loadFixture('sample-project');

    // 檢查泛型型別定義
    const apiTypes = await fixture.readFile('src/types/api.ts');
    expect(apiTypes).toContain('ApiResponse<T = unknown>');
    expect(apiTypes).toContain('PaginatedResponse<T>');

    // 檢查泛型類別
    const baseModel = await fixture.readFile('src/models/base-model.ts');
    expect(baseModel).toContain('BaseModel<T extends { id: ID }>');

    await fixture.cleanup();
  });

  it('fixture 應該包含複雜的業務邏輯', async () => {
    const fixture = await loadFixture('sample-project');

    // 檢查 OrderService 的複雜業務邏輯
    const orderService = await fixture.readFile('src/services/order-service.ts');
    expect(orderService).toContain('createOrder');
    expect(orderService).toContain('cancelOrder');
    expect(orderService).toContain('shipOrder');

    // 檢查驗證邏輯
    const userModel = await fixture.readFile('src/models/user-model.ts');
    expect(userModel).toContain('validate()');
    expect(userModel).toContain('validateRequired');
    expect(userModel).toContain('validateEmail');

    await fixture.cleanup();
  });

  it('fixture 應該可以被 TypeScript 編譯', async () => {
    const fixture = await loadFixture('sample-project');

    // 檢查 tsconfig.json 存在
    const tsconfigExists = await fixture.fileExists('tsconfig.json');
    expect(tsconfigExists).toBe(true);

    // 檢查 package.json 存在
    const packageExists = await fixture.fileExists('package.json');
    expect(packageExists).toBe(true);

    await fixture.cleanup();
  });
});
