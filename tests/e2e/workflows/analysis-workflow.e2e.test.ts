/**
 * 專案分析工作流程 E2E 測試
 * 測試完整的專案分析流程：索引 → 分析 → 依賴檢查
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('專案分析工作流程 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立具有依賴關係的測試專案
    project = await createTypeScriptProject({
      'src/services/user.ts': `
export class UserService {
  getUser(id: string) {
    return { id, name: 'Test User' };
  }
}
      `.trim(),
      'src/services/order.ts': `
import { UserService } from './user';

export class OrderService {
  constructor(private userService: UserService) {}

  createOrder(userId: string) {
    const user = this.userService.getUser(userId);
    return { user, items: [] };
  }
}
      `.trim(),
      'src/index.ts': `
import { UserService } from './services/user';
import { OrderService } from './services/order';

const userService = new UserService();
const orderService = new OrderService(userService);

console.log(orderService.createOrder('123'));
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('完整分析流程：索引 → 分析 → 依賴檢查', async () => {
    // 步驟 1: 建立索引
    const indexResult = await executeCLI(['index', '--path', project.projectPath]);
    expect(indexResult.exitCode).toBe(0);

    // 步驟 2: 分析程式碼
    const analyzeResult = await executeCLI(['analyze', project.projectPath]);
    expect(analyzeResult.exitCode).toBe(0);

    // 步驟 3: 分析依賴關係
    const depsResult = await executeCLI(['deps', '--path', project.projectPath]);
    expect(depsResult.exitCode).toBe(0);
  });

  it('分析流程：搜尋 → 分析特定檔案', async () => {
    // 步驟 1: 搜尋符號
    const searchResult = await executeCLI(['search', 'UserService', '--path', project.projectPath]);
    expect(searchResult.exitCode).toBe(0);

    // 步驟 2: 分析特定檔案
    const filePath = project.getFilePath('src/services/user.ts');
    const analyzeResult = await executeCLI(['analyze', filePath]);
    expect(analyzeResult.exitCode).toBe(0);
  });

  it('依賴分析：檢測專案結構', async () => {
    // 分析整個專案的依賴關係
    const depsResult = await executeCLI(['deps', '--path', project.projectPath]);

    expect(depsResult.exitCode).toBe(0);
    // 應該成功執行依賴分析
  });
});
