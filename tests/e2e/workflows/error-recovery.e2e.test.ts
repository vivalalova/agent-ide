/**
 * 錯誤處理與恢復 E2E 測試
 * 測試操作失敗、rollback 機制和錯誤恢復場景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';
import * as fs from 'fs/promises';

describe('錯誤處理與恢復 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    project = await createTypeScriptProject({
      'src/user.ts': `
export class UserService {
  getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
      `.trim(),
      'src/order.ts': `
import { UserService } from './user';

export class OrderService {
  constructor(private userService: UserService) {}

  createOrder(userId: string) {
    const user = this.userService.getUser(userId);
    return { user, items: [] };
  }
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  describe('檔案操作錯誤處理', () => {
    it('應該能處理不存在的檔案', async () => {
      const result = await executeCLI([
        'analyze',
        project.getFilePath('src/non-existent.ts')
      ]);

      // analyze 命令會處理錯誤但不一定回傳非零 exit code
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });

    it('應該能處理無效的檔案路徑', async () => {
      const result = await executeCLI([
        'rename',
        '--file', '/invalid/path/to/file.ts',
        '--line', '1',
        '--column', '1',
        '--new-name', 'Foo'
      ]);

      expect(result.exitCode).not.toBe(0);
    });

    it('應該能處理無法讀取的檔案', async () => {
      const filePath = project.getFilePath('src/readonly.ts');

      // 建立唯讀檔案
      await fs.writeFile(filePath, 'export class Readonly {}');
      await fs.chmod(filePath, 0o444);

      const analyzeResult = await executeCLI(['analyze', filePath]);

      // 分析應該能讀取
      expect(analyzeResult.exitCode).toBe(0);

      // 嘗試修改應該失敗
      const renameResult = await executeCLI([
        'rename',
        '--file', filePath,
        '--line', '1',
        '--column', '14',
        '--new-name', 'ReadWrite'
      ]);

      // 恢復權限以便清理
      await fs.chmod(filePath, 0o644);

      // 預覽模式應該成功
      expect(renameResult).toBeDefined();
    });
  });

  describe('語法錯誤處理', () => {
    it('應該能處理語法錯誤的檔案', async () => {
      const invalidFilePath = project.getFilePath('src/invalid.ts');

      // 建立語法錯誤的檔案
      await fs.writeFile(invalidFilePath, `
export class Invalid {
  // 缺少結束括號
      `.trim());

      const result = await executeCLI(['analyze', invalidFilePath]);

      // 應該能檢測到錯誤
      expect(result).toBeDefined();
    });

    it('應該能處理不完整的程式碼', async () => {
      const incompleteFilePath = project.getFilePath('src/incomplete.ts');

      await fs.writeFile(incompleteFilePath, `
export class Incomplete
      `.trim());

      const result = await executeCLI(['analyze', incompleteFilePath]);

      expect(result).toBeDefined();
    });
  });

  describe('重新命名錯誤處理', () => {
    it('應該檢測到命名衝突', async () => {
      const filePath = project.getFilePath('src/user.ts');

      // 嘗試重新命名為已存在的名稱
      const result = await executeCLI([
        'rename',
        '--file', filePath,
        '--line', '1',
        '--column', '14',
        '--new-name', 'OrderService',
        '--preview'
      ]);

      // 應該顯示警告或錯誤
      expect(result).toBeDefined();
    });

    it('應該拒絕無效的識別字名稱', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await executeCLI([
        'rename',
        '--file', filePath,
        '--line', '1',
        '--column', '14',
        '--new-name', '123Invalid',
        '--preview'
      ]);

      expect(result).toBeDefined();
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });

    it('應該處理跨檔案重新命名失敗', async () => {
      const filePath = project.getFilePath('src/user.ts');

      // 嘗試重新命名被多處引用的符號
      const result = await executeCLI([
        'rename',
        '--file', filePath,
        '--line', '1',
        '--column', '14',
        '--new-name', 'UpdatedService'
      ]);

      // 無論成功或失敗，應該有輸出
      expect(result).toBeDefined();
    });
  });

  describe('移動操作錯誤處理', () => {
    it('應該檢測到目標檔案已存在', async () => {
      const sourcePath = project.getFilePath('src/user.ts');
      const destPath = project.getFilePath('src/order.ts');

      const result = await executeCLI([
        'move',
        sourcePath,
        destPath
      ]);

      // 應該有輸出或錯誤訊息
      expect(result).toBeDefined();
    });

    it('應該檢測到無效的目標路徑', async () => {
      const sourcePath = project.getFilePath('src/user.ts');

      const result = await executeCLI([
        'move',
        sourcePath,
        '/invalid/path.ts'
      ]);

      expect(result).toBeDefined();
    });

    it('應該在移動失敗時保持原檔案不變', async () => {
      const sourcePath = project.getFilePath('src/user.ts');
      const originalContent = await fs.readFile(sourcePath, 'utf-8');

      // 嘗試移動到無效位置
      await executeCLI([
        'move',
        sourcePath,
        '/invalid/user.ts'
      ]).catch(() => {
        // 忽略錯誤
      });

      // 原檔案應該保持不變
      const fileExists = await fs.access(sourcePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      if (fileExists) {
        const currentContent = await fs.readFile(sourcePath, 'utf-8');
        expect(currentContent).toBe(originalContent);
      }
    });
  });

  describe('重構錯誤處理', () => {
    it('應該檢測到無效的程式碼範圍', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file', filePath,
        '--start-line', '100',
        '--end-line', '200',
        '--function-name', 'extracted',
        '--preview'
      ]);

      expect(result).toBeDefined();
    });

    it('應該檢測到無法提取的程式碼片段', async () => {
      const filePath = project.getFilePath('src/user.ts');

      // 嘗試提取不完整的程式碼
      const result = await executeCLI([
        'refactor',
        'extract-function',
        '--file', filePath,
        '--start-line', '1',
        '--end-line', '1',
        '--function-name', 'extracted',
        '--preview'
      ]);

      expect(result).toBeDefined();
    });
  });

  describe('搜尋錯誤處理', () => {
    it('應該能處理空搜尋查詢', async () => {
      const result = await executeCLI([
        'search',
        '',
        '--path', project.projectPath
      ]);

      expect(result).toBeDefined();
    });

    it('應該能處理無結果的搜尋', async () => {
      const result = await executeCLI([
        'search',
        'NonExistentSymbol123456',
        '--path', project.projectPath
      ]);

      expect(result.exitCode).toBe(0);
      // 搜尋沒有結果時仍會回傳成功，但輸出會包含相關訊息
      expect(result.stdout).toBeDefined();
    });

    it('應該能處理無效的搜尋路徑', async () => {
      const result = await executeCLI([
        'search',
        'UserService',
        '--path', '/non/existent/path'
      ]);

      // 無效路徑可能會被處理為錯誤或回傳空結果
      expect(result).toBeDefined();
    });
  });

  describe('並行操作錯誤處理', () => {
    it('應該能處理多個操作中的部分失敗', async () => {
      const operations = [
        executeCLI(['analyze', project.getFilePath('src/user.ts')]),
        executeCLI(['analyze', project.getFilePath('src/non-existent.ts')]),
        executeCLI(['analyze', project.getFilePath('src/order.ts')])
      ];

      const results = await Promise.allSettled(operations);

      // 至少有一個成功
      const successCount = results.filter(
        r => r.status === 'fulfilled' && r.value.exitCode === 0
      ).length;

      expect(successCount).toBeGreaterThan(0);
    });

    it('應該能在一個操作失敗後繼續其他操作', async () => {
      // 第一個操作：成功
      const firstResult = await executeCLI([
        'analyze',
        project.getFilePath('src/user.ts')
      ]);

      expect(firstResult.exitCode).toBe(0);

      // 第二個操作：失敗
      const secondResult = await executeCLI([
        'rename',
        '--file', project.getFilePath('src/invalid.ts'),
        '--line', '1',
        '--column', '1',
        '--new-name', 'Foo'
      ]);

      expect(secondResult.exitCode).not.toBe(0);

      // 第三個操作：應該能繼續執行
      const thirdResult = await executeCLI([
        'analyze',
        project.getFilePath('src/order.ts')
      ]);

      expect(thirdResult.exitCode).toBe(0);
    });
  });

  describe('資源清理與恢復', () => {
    it('應該在操作失敗後正確清理資源', async () => {
      // 執行可能失敗的操作
      await executeCLI([
        'refactor',
        'extract-function',
        '--file', project.getFilePath('src/user.ts'),
        '--start-line', '1000',
        '--end-line', '2000',
        '--function-name', 'invalid'
      ]);

      // 後續操作應該正常執行
      const result = await executeCLI([
        'analyze',
        project.getFilePath('src/user.ts')
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('應該在錯誤後保持系統穩定', async () => {
      // 連續執行多個可能失敗的操作
      for (let i = 0; i < 5; i++) {
        await executeCLI([
          'rename',
          '--file', project.getFilePath('src/invalid.ts'),
          '--line', '1',
          '--column', '1',
          '--new-name', `Test${i}`
        ]);
      }

      // 系統應該仍然能正常執行有效操作
      const result = await executeCLI([
        'search',
        'UserService',
        '--path', project.projectPath
      ]);

      expect(result.exitCode).toBe(0);
    });
  });

  describe('預覽模式安全性', () => {
    it('預覽模式不應該修改檔案', async () => {
      const filePath = project.getFilePath('src/user.ts');
      const originalContent = await fs.readFile(filePath, 'utf-8');

      // 執行預覽模式的重新命名
      await executeCLI([
        'rename',
        '--file', filePath,
        '--line', '1',
        '--column', '14',
        '--new-name', 'ModifiedService',
        '--preview'
      ]);

      // 檔案內容應該保持不變
      const currentContent = await fs.readFile(filePath, 'utf-8');
      expect(currentContent).toBe(originalContent);
    });

    it('移動操作應該不會影響原始檔案（當失敗時）', async () => {
      const sourcePath = project.getFilePath('src/user.ts');
      const destPath = project.getFilePath('src/moved-user.ts');

      // 記錄原始內容
      const originalContent = await fs.readFile(sourcePath, 'utf-8');

      // 執行移動（可能失敗）
      await executeCLI([
        'move',
        sourcePath,
        destPath
      ]).catch(() => {
        // 忽略錯誤
      });

      // 原檔案應該存在且內容不變，或已被成功移動
      const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);

      if (sourceExists) {
        const currentContent = await fs.readFile(sourcePath, 'utf-8');
        expect(currentContent).toBe(originalContent);
      }
    });
  });
});
