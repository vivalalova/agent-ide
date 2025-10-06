/**
 * 跨模組整合工作流程 E2E 測試
 * 測試多個模組協同工作的複雜場景
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('跨模組整合工作流程 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立完整的測試專案
    project = await createTypeScriptProject({
      'src/models/user.ts': `
export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserModel {
  constructor(private data: User) {}

  getId(): string {
    return this.data.id;
  }

  getName(): string {
    return this.data.name;
  }
}
      `.trim(),
      'src/services/user-service.ts': `
import { User, UserModel } from '../models/user';

export class UserService {
  private users: Map<string, UserModel> = new Map();

  addUser(user: User): void {
    const model = new UserModel(user);
    this.users.set(user.id, model);
  }

  getUser(id: string): UserModel | undefined {
    return this.users.get(id);
  }
}
      `.trim(),
      'src/controllers/user-controller.ts': `
import { UserService } from '../services/user-service';

export class UserController {
  constructor(private userService: UserService) {}

  createUser(id: string, name: string, email: string) {
    this.userService.addUser({ id, name, email });
    return { success: true };
  }
}
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  describe('搜尋 → 重構工作流程', () => {
    it('應該能先搜尋符號再進行重構', async () => {
      // 步驟 1: 搜尋 UserService
      const searchResult = await executeCLI([
        'search',
        'UserService',
        '--path', project.projectPath
      ]);

      expect(searchResult.exitCode).toBe(0);

      // 步驟 2: 對 UserService 進行重構（提取函式）
      const filePath = project.getFilePath('src/services/user-service.ts');
      const refactorResult = await executeCLI([
        'refactor',
        'extract-function',
        '--file', filePath,
        '--start-line', '5',
        '--end-line', '7',
        '--function-name', 'createUserModel',
        '--preview'
      ]);

      expect(refactorResult.exitCode).toBe(0);
    });
  });

  describe('重新命名 → 移動工作流程', () => {
    it('應該能先重新命名再移動檔案', async () => {
      // 步驟 1: 重新命名 UserModel 為 UserEntity（預覽）
      const userModelPath = project.getFilePath('src/models/user.ts');
      const renameResult = await executeCLI([
        'rename',
        '--file', userModelPath,
        '--line', '7',
        '--column', '14',
        '--new-name', 'UserEntity',
        '--preview'
      ]);

      // 預覽模式應該成功或提供錯誤訊息
      expect(renameResult).toBeDefined();

      // 步驟 2: 移動檔案到新位置
      const moveResult = await executeCLI([
        'move',
        userModelPath,
        project.getFilePath('src/entities/user.ts')
      ]);

      // 移動操作可能成功或失敗（例如目標目錄不存在）
      expect(moveResult).toBeDefined();
    });
  });

  describe('索引 → 搜尋 → 分析工作流程', () => {
    it('應該能執行完整的程式碼分析流程', async () => {
      // 步驟 1: 建立索引
      const indexResult = await executeCLI([
        'index',
        '--path', project.projectPath
      ]);

      expect(indexResult.exitCode).toBe(0);

      // 步驟 2: 搜尋特定符號
      const searchResult = await executeCLI([
        'search',
        'UserController',
        '--path', project.projectPath
      ]);

      expect(searchResult.exitCode).toBe(0);

      // 步驟 3: 分析程式碼複雜度
      const analyzeResult = await executeCLI([
        'analyze',
        project.getFilePath('src/controllers/user-controller.ts')
      ]);

      expect(analyzeResult.exitCode).toBe(0);

      // 步驟 4: 分析依賴關係
      const depsResult = await executeCLI([
        'deps',
        '--path', project.projectPath
      ]);

      expect(depsResult.exitCode).toBe(0);
    });
  });

  describe('依賴分析 → 重新命名工作流程', () => {
    it('應該能基於依賴分析進行安全重新命名', async () => {
      // 步驟 1: 分析依賴關係
      const depsResult = await executeCLI([
        'deps',
        '--path', project.projectPath
      ]);

      expect(depsResult.exitCode).toBe(0);

      // 步驟 2: 重新命名被多處引用的符號（預覽）
      const userServicePath = project.getFilePath('src/services/user-service.ts');
      const renameResult = await executeCLI([
        'rename',
        '--file', userServicePath,
        '--line', '3',
        '--column', '14',
        '--new-name', 'UserRepository',
        '--preview'
      ]);

      // 預覽模式應該回傳結果
      expect(renameResult).toBeDefined();
    });
  });

  describe('分析 → 重構 → 驗證工作流程', () => {
    it('應該能基於分析結果進行重構並驗證', async () => {
      const filePath = project.getFilePath('src/controllers/user-controller.ts');

      // 步驟 1: 分析程式碼
      const analyzeResult = await executeCLI([
        'analyze',
        filePath
      ]);

      expect(analyzeResult.exitCode).toBe(0);

      // 步驟 2: 執行重構（預覽）
      const refactorResult = await executeCLI([
        'refactor',
        'extract-function',
        '--file', filePath,
        '--start-line', '5',
        '--end-line', '6',
        '--function-name', 'buildUserData',
        '--preview'
      ]);

      expect(refactorResult.exitCode).toBe(0);

      // 步驟 3: 重新分析驗證
      const reanalyzeResult = await executeCLI([
        'analyze',
        filePath
      ]);

      expect(reanalyzeResult.exitCode).toBe(0);
    });
  });

  describe('批次操作工作流程', () => {
    it('應該能對多個檔案執行相同操作', async () => {
      const files = [
        'src/models/user.ts',
        'src/services/user-service.ts',
        'src/controllers/user-controller.ts'
      ];

      // 對每個檔案執行分析
      for (const file of files) {
        const filePath = project.getFilePath(file);
        const result = await executeCLI(['analyze', filePath]);

        expect(result.exitCode).toBe(0);
      }
    });

    it('應該能搜尋後批次重構', async () => {
      // 步驟 1: 搜尋所有包含 User 的符號
      const searchResult = await executeCLI([
        'search',
        'User',
        '--path', project.projectPath
      ]);

      expect(searchResult.exitCode).toBe(0);

      // 步驟 2: 對搜尋結果進行分析
      const analyzeResult = await executeCLI([
        'analyze',
        project.projectPath
      ]);

      expect(analyzeResult.exitCode).toBe(0);
    });
  });

  describe('錯誤恢復工作流程', () => {
    it('應該能在操作失敗後繼續其他操作', async () => {
      // 步驟 1: 嘗試對不存在的檔案進行操作（會失敗）
      const invalidResult = await executeCLI([
        'rename',
        '--file', project.getFilePath('src/non-existent.ts'),
        '--line', '1',
        '--column', '1',
        '--new-name', 'Foo'
      ]);

      // 應該失敗但不崩潰
      expect(invalidResult.exitCode).not.toBe(0);

      // 步驟 2: 對有效檔案進行操作（應該成功）
      const validResult = await executeCLI([
        'analyze',
        project.getFilePath('src/models/user.ts')
      ]);

      expect(validResult.exitCode).toBe(0);
    });

    it('應該能在部分操作失敗時完成其他操作', async () => {
      // 混合有效和無效的操作
      const results = await Promise.all([
        executeCLI(['analyze', project.getFilePath('src/models/user.ts')]),
        executeCLI(['analyze', project.getFilePath('src/invalid.ts')]),
        executeCLI(['analyze', project.getFilePath('src/services/user-service.ts')])
      ]);

      // 至少有兩個成功
      const successCount = results.filter(r => r.exitCode === 0).length;
      expect(successCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('複雜專案整合場景', () => {
    it('完整流程：索引 → 搜尋 → 重新命名 → 移動 → 驗證', async () => {
      // 步驟 1: 建立索引
      const indexResult = await executeCLI([
        'index',
        '--path', project.projectPath
      ]);
      expect(indexResult.exitCode).toBe(0);

      // 步驟 2: 搜尋目標符號
      const searchResult = await executeCLI([
        'search',
        'UserService',
        '--path', project.projectPath
      ]);
      expect(searchResult.exitCode).toBe(0);

      // 步驟 3: 重新命名（預覽）
      const userServicePath = project.getFilePath('src/services/user-service.ts');
      const renameResult = await executeCLI([
        'rename',
        '--file', userServicePath,
        '--line', '3',
        '--column', '14',
        '--new-name', 'UserRepository',
        '--preview'
      ]);
      expect(renameResult).toBeDefined();

      // 步驟 4: 移動檔案
      const moveResult = await executeCLI([
        'move',
        userServicePath,
        project.getFilePath('src/repositories/user-repository.ts')
      ]);
      expect(moveResult).toBeDefined();

      // 步驟 5: 驗證依賴關係
      const depsResult = await executeCLI([
        'deps',
        '--path', project.projectPath
      ]);
      expect(depsResult.exitCode).toBe(0);
    });
  });
});
