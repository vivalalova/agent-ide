/**
 * Fixture Reset E2E 測試
 * 驗證 fixture 專案在被測試更動後能夠正確還原
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, FixtureProject } from './helpers/fixture-manager.js';

describe('Fixture Reset 功能', () => {
  let fixture: FixtureProject;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  describe('基本還原功能', () => {
    it('修改檔案後呼叫 reset() 應該還原到初始狀態', async () => {
      // 讀取原始內容
      const originalContent = await fixture.readFile('src/types/user.ts');
      expect(originalContent).toContain('interface User');

      // 修改檔案
      await fixture.writeFile('src/types/user.ts', 'export interface Person {}');
      const modifiedContent = await fixture.readFile('src/types/user.ts');
      expect(modifiedContent).toContain('interface Person');
      expect(modifiedContent).not.toContain('interface User');

      // 重置
      await fixture.reset();

      // 驗證還原
      const restoredContent = await fixture.readFile('src/types/user.ts');
      expect(restoredContent).toBe(originalContent);
      expect(restoredContent).toContain('interface User');
      expect(restoredContent).not.toContain('interface Person');
    });

    it('新增檔案後呼叫 reset() 應該移除新增的檔案', async () => {
      // 新增檔案
      await fixture.writeFile('src/types/new-file.ts', 'export const test = 123;');
      expect(await fixture.fileExists('src/types/new-file.ts')).toBe(true);

      // 重置
      await fixture.reset();

      // 驗證新檔案不存在
      expect(await fixture.fileExists('src/types/new-file.ts')).toBe(false);
    });

    it('修改多個檔案後呼叫 reset() 應該全部還原', async () => {
      // 讀取原始內容
      const originalUser = await fixture.readFile('src/types/user.ts');
      const originalProduct = await fixture.readFile('src/types/product.ts');
      const originalOrder = await fixture.readFile('src/types/order.ts');

      // 修改多個檔案
      await fixture.writeFile('src/types/user.ts', '// modified user');
      await fixture.writeFile('src/types/product.ts', '// modified product');
      await fixture.writeFile('src/types/order.ts', '// modified order');

      // 驗證修改
      expect(await fixture.readFile('src/types/user.ts')).toBe('// modified user');
      expect(await fixture.readFile('src/types/product.ts')).toBe('// modified product');
      expect(await fixture.readFile('src/types/order.ts')).toBe('// modified order');

      // 重置
      await fixture.reset();

      // 驗證全部還原
      expect(await fixture.readFile('src/types/user.ts')).toBe(originalUser);
      expect(await fixture.readFile('src/types/product.ts')).toBe(originalProduct);
      expect(await fixture.readFile('src/types/order.ts')).toBe(originalOrder);
    });
  });

  describe('getModifiedFiles() 追蹤功能', () => {
    it('未修改時應該回傳空陣列', async () => {
      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles).toEqual([]);
    });

    it('修改單一檔案後應該正確追蹤', async () => {
      await fixture.writeFile('src/types/user.ts', '// modified');
      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles).toEqual(['src/types/user.ts']);
    });

    it('修改多個檔案後應該全部追蹤', async () => {
      await fixture.writeFile('src/types/user.ts', '// modified');
      await fixture.writeFile('src/models/user-model.ts', '// modified');
      await fixture.writeFile('src/services/user-service.ts', '// modified');

      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles).toContain('src/types/user.ts');
      expect(modifiedFiles).toContain('src/models/user-model.ts');
      expect(modifiedFiles).toContain('src/services/user-service.ts');
      expect(modifiedFiles.length).toBe(3);
    });

    it('reset() 後 getModifiedFiles() 應該回傳空陣列', async () => {
      // 修改檔案
      await fixture.writeFile('src/types/user.ts', '// modified');
      expect((await fixture.getModifiedFiles()).length).toBeGreaterThan(0);

      // 重置
      await fixture.reset();

      // 驗證沒有修改的檔案
      const modifiedFiles = await fixture.getModifiedFiles();
      expect(modifiedFiles).toEqual([]);
    });
  });

  describe('多次重置', () => {
    it('可以重複執行 reset() 多次', async () => {
      const originalContent = await fixture.readFile('src/types/user.ts');

      // 第一次修改和重置
      await fixture.writeFile('src/types/user.ts', '// first');
      await fixture.reset();
      expect(await fixture.readFile('src/types/user.ts')).toBe(originalContent);

      // 第二次修改和重置
      await fixture.writeFile('src/types/user.ts', '// second');
      await fixture.reset();
      expect(await fixture.readFile('src/types/user.ts')).toBe(originalContent);

      // 第三次修改和重置
      await fixture.writeFile('src/types/user.ts', '// third');
      await fixture.reset();
      expect(await fixture.readFile('src/types/user.ts')).toBe(originalContent);
    });

    it('每次 reset() 後檔案內容都一致', async () => {
      const originalContent = await fixture.readFile('src/types/user.ts');

      const contents: string[] = [];
      for (let i = 0; i < 5; i++) {
        await fixture.writeFile('src/types/user.ts', `// iteration ${i}`);
        await fixture.reset();
        contents.push(await fixture.readFile('src/types/user.ts'));
      }

      // 所有重置後的內容都應該相同
      contents.forEach(content => {
        expect(content).toBe(originalContent);
      });
    });
  });

  describe('檔案結構完整性', () => {
    it('reset() 後所有原始檔案都應該存在', async () => {
      const expectedFiles = [
        'src/types/user.ts',
        'src/types/product.ts',
        'src/types/order.ts',
        'src/types/api.ts',
        'src/types/common.ts',
        'src/models/base-model.ts',
        'src/models/user-model.ts',
        'src/models/product-model.ts',
        'src/models/order-model.ts',
        'src/services/user-service.ts',
        'src/services/auth-service.ts',
        'src/services/product-service.ts',
        'src/services/order-service.ts',
        'src/controllers/user-controller.ts',
        'src/controllers/product-controller.ts',
        'src/utils/formatter.ts',
        'src/utils/validator.ts',
      ];

      // 刪除一些檔案
      await fixture.writeFile('src/types/user.ts', '');
      await fixture.writeFile('src/models/user-model.ts', '');

      // 重置
      await fixture.reset();

      // 驗證所有檔案都存在
      for (const file of expectedFiles) {
        expect(await fixture.fileExists(file)).toBe(true);
      }
    });

    it('reset() 後檔案數量應該與原始 fixture 相同', async () => {
      // 取得初始檔案列表
      const initialFiles = await fixture.listFiles();
      const initialCount = initialFiles.length;

      // 新增一些檔案
      await fixture.writeFile('src/types/extra1.ts', 'export const x = 1;');
      await fixture.writeFile('src/types/extra2.ts', 'export const y = 2;');
      await fixture.writeFile('src/models/extra3.ts', 'export const z = 3;');

      // 驗證檔案數量增加
      const modifiedFiles = await fixture.listFiles();
      expect(modifiedFiles.length).toBeGreaterThan(initialCount);

      // 重置
      await fixture.reset();

      // 驗證檔案數量恢復
      const restoredFiles = await fixture.listFiles();
      expect(restoredFiles.length).toBe(initialCount);
    });
  });

  describe('assertFileContains 和 assertFileNotContains', () => {
    it('assertFileContains() 應該正確驗證內容', async () => {
      expect(await fixture.assertFileContains('src/types/user.ts', 'interface User')).toBe(true);
      expect(await fixture.assertFileContains('src/types/user.ts', 'NonExistentText')).toBe(false);
    });

    it('assertFileNotContains() 應該正確驗證不存在的內容', async () => {
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'NonExistentText')).toBe(true);
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'interface User')).toBe(false);
    });

    it('修改後驗證功能應該反映變更', async () => {
      await fixture.writeFile('src/types/user.ts', 'export const modified = true;');
      expect(await fixture.assertFileContains('src/types/user.ts', 'modified')).toBe(true);
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'interface User')).toBe(true);
    });

    it('reset() 後驗證功能應該反映還原', async () => {
      await fixture.writeFile('src/types/user.ts', 'export const modified = true;');
      await fixture.reset();
      expect(await fixture.assertFileContains('src/types/user.ts', 'interface User')).toBe(true);
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'modified')).toBe(true);
    });
  });

  describe('真實測試情境模擬', () => {
    it('模擬 rename 測試：修改多個檔案後能正確還原', async () => {
      // 讀取原始內容
      const originalFiles = {
        user: await fixture.readFile('src/types/user.ts'),
        userModel: await fixture.readFile('src/models/user-model.ts'),
        userService: await fixture.readFile('src/services/user-service.ts'),
        userController: await fixture.readFile('src/controllers/user-controller.ts'),
      };

      // 模擬 rename 操作：User -> Person
      await fixture.writeFile('src/types/user.ts', originalFiles.user.replace(/User/g, 'Person'));
      await fixture.writeFile('src/models/user-model.ts', originalFiles.userModel.replace(/User/g, 'Person'));
      await fixture.writeFile('src/services/user-service.ts', originalFiles.userService.replace(/User/g, 'Person'));
      await fixture.writeFile('src/controllers/user-controller.ts', originalFiles.userController.replace(/User/g, 'Person'));

      // 驗證修改
      expect(await fixture.assertFileContains('src/types/user.ts', 'Person')).toBe(true);
      expect(await fixture.assertFileNotContains('src/types/user.ts', 'interface User')).toBe(true);

      // 重置
      await fixture.reset();

      // 驗證還原
      expect(await fixture.readFile('src/types/user.ts')).toBe(originalFiles.user);
      expect(await fixture.readFile('src/models/user-model.ts')).toBe(originalFiles.userModel);
      expect(await fixture.readFile('src/services/user-service.ts')).toBe(originalFiles.userService);
      expect(await fixture.readFile('src/controllers/user-controller.ts')).toBe(originalFiles.userController);
    });

    it('模擬 refactor 測試：提取函式後能正確還原', async () => {
      const originalService = await fixture.readFile('src/services/user-service.ts');

      // 模擬提取函式
      const modifiedService = originalService + '\n\nexport function extractedFunction() {\n  return true;\n}\n';
      await fixture.writeFile('src/services/user-service.ts', modifiedService);

      // 驗證修改
      expect(await fixture.assertFileContains('src/services/user-service.ts', 'extractedFunction')).toBe(true);

      // 重置
      await fixture.reset();

      // 驗證還原
      expect(await fixture.readFile('src/services/user-service.ts')).toBe(originalService);
      expect(await fixture.assertFileNotContains('src/services/user-service.ts', 'extractedFunction')).toBe(true);
    });

    it('模擬 move 測試：移動檔案後能正確還原', async () => {
      const originalUser = await fixture.readFile('src/types/user.ts');

      // 模擬移動檔案（複製到新位置）
      await fixture.writeFile('src/types/entities/user.ts', originalUser);
      expect(await fixture.fileExists('src/types/entities/user.ts')).toBe(true);

      // 重置
      await fixture.reset();

      // 驗證還原（新檔案應該消失）
      expect(await fixture.fileExists('src/types/entities/user.ts')).toBe(false);
      expect(await fixture.fileExists('src/types/user.ts')).toBe(true);
    });
  });

  describe('錯誤處理', () => {
    it('cleanup() 應該能安全執行多次', async () => {
      await fixture.cleanup();
      await fixture.cleanup();
      await fixture.cleanup();
      // 不應該拋出錯誤
    });

    it('cleanup() 後 reset() 應該能重新初始化', async () => {
      const originalContent = await fixture.readFile('src/types/user.ts');

      await fixture.cleanup();
      await fixture.reset();

      // 應該能正常讀取
      const restoredContent = await fixture.readFile('src/types/user.ts');
      expect(restoredContent).toBe(originalContent);
    });
  });
});
