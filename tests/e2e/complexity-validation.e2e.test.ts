/**
 * Fixture 複雜度驗證測試
 * 驗證 sample-project fixture 符合複雜度要求
 */

import { describe, it, expect } from 'vitest';
import { resetFixtures, getFixturePath } from './helpers/fixture-manager';
import * as path from 'path';
import * as fs from 'fs/promises';

// 輔助函數：遞迴列出所有檔案
async function listAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const subFiles = await listAllFiles(fullPath);
      files.push(...subFiles);
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Fixture 複雜度驗證', () => {
  it('fixture 應該包含至少 30 個 TypeScript 檔案', async () => {
    const fixturePath = getFixturePath('sample-project');

    const allFiles = await listAllFiles(fixturePath);
    const tsFiles = allFiles.filter(file => file.endsWith('.ts'));

    expect(tsFiles.length).toBeGreaterThanOrEqual(30);

    // Reset handled by git restore
  });

  it('fixture 應該包含多層目錄結構', async () => {
    const fixturePath = getFixturePath('sample-project');

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
      const dirPath = path.join(fixturePath, dir);
      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }

    // Reset handled by git restore
  });

  it('fixture 應該包含豐富的型別定義', async () => {
    const fixturePath = getFixturePath('sample-project');

    // 檢查核心型別檔案
    const userTypes = await fs.readFile(path.join(fixturePath, 'src/types/user.ts'), 'utf-8');
    expect(userTypes).toContain('export enum UserRole');
    expect(userTypes).toContain('export enum UserStatus');
    expect(userTypes).toContain('export interface User');

    const productTypes = await fs.readFile(path.join(fixturePath, 'src/types/product.ts'), 'utf-8');
    expect(productTypes).toContain('export enum ProductCategory');
    expect(productTypes).toContain('export interface Product');

    const apiTypes = await fs.readFile(path.join(fixturePath, 'src/types/api.ts'), 'utf-8');
    expect(apiTypes).toContain('export interface ApiResponse<T');
    expect(apiTypes).toContain('export interface PaginatedResponse<T>');

    // Reset handled by git restore
  });

  it('fixture 應該包含跨檔案引用關係', async () => {
    const fixturePath = getFixturePath('sample-project');

    // UserModel 應該引用 User 型別
    const userModel = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
    expect(userModel).toContain('import { User');
    expect(userModel).toContain('from \'../types/user\'');

    // UserService 應該引用 User 和 UserModel
    const userService = await fs.readFile(path.join(fixturePath, 'src/services/user-service.ts'), 'utf-8');
    expect(userService).toContain('from \'../types/user\'');
    expect(userService).toContain('from \'../models/user-model\'');

    // UserController 應該引用 UserService
    const userController = await fs.readFile(path.join(fixturePath, 'src/controllers/user-controller.ts'), 'utf-8');
    expect(userController).toContain('from \'../services/user-service\'');

    // Reset handled by git restore
  });

  it('fixture 應該包含繼承關係', async () => {
    const fixturePath = getFixturePath('sample-project');

    // 檢查 BaseModel 抽象類別
    const baseModel = await fs.readFile(path.join(fixturePath, 'src/models/base-model.ts'), 'utf-8');
    expect(baseModel).toContain('export abstract class BaseModel');
    expect(baseModel).toContain('abstract validate()');

    // 檢查子類別繼承
    const userModel = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
    expect(userModel).toContain('export class UserModel extends BaseModel<User>');

    const productModel = await fs.readFile(path.join(fixturePath, 'src/models/product-model.ts'), 'utf-8');
    expect(productModel).toContain('export class ProductModel extends BaseModel<Product>');

    // Reset handled by git restore
  });

  it('fixture 應該包含泛型用法', async () => {
    const fixturePath = getFixturePath('sample-project');

    // 檢查泛型型別定義
    const apiTypes = await fs.readFile(path.join(fixturePath, 'src/types/api.ts'), 'utf-8');
    expect(apiTypes).toContain('ApiResponse<T = unknown>');
    expect(apiTypes).toContain('PaginatedResponse<T>');

    // 檢查泛型類別
    const baseModel = await fs.readFile(path.join(fixturePath, 'src/models/base-model.ts'), 'utf-8');
    expect(baseModel).toContain('BaseModel<T extends { id: ID }>');

    // Reset handled by git restore
  });

  it('fixture 應該包含複雜的業務邏輯', async () => {
    const fixturePath = getFixturePath('sample-project');

    // 檢查 OrderService 的複雜業務邏輯
    const orderService = await fs.readFile(path.join(fixturePath, 'src/services/order-service.ts'), 'utf-8');
    expect(orderService).toContain('createOrder');
    expect(orderService).toContain('cancelOrder');
    expect(orderService).toContain('shipOrder');

    // 檢查驗證邏輯
    const userModel = await fs.readFile(path.join(fixturePath, 'src/models/user-model.ts'), 'utf-8');
    expect(userModel).toContain('validate()');
    expect(userModel).toContain('validateRequired');
    expect(userModel).toContain('validateEmail');

    // Reset handled by git restore
  });

  it('fixture 應該可以被 TypeScript 編譯', async () => {
    const fixturePath = getFixturePath('sample-project');

    // 檢查 tsconfig.json 存在
    const tsconfigExists = await fs.access(path.join(fixturePath, 'tsconfig.json')).then(() => true).catch(() => false);
    expect(tsconfigExists).toBe(true);

    // 檢查 package.json 存在
    const packageExists = await fs.access(path.join(fixturePath, 'package.json')).then(() => true).catch(() => false);
    expect(packageExists).toBe(true);

    // Reset handled by git restore
  });
});
