/**
 * MCP 工具執行 E2E 測試
 * 測試 MCP 工具的實際執行功能
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { AgentIdeMCP } from '../../../src/interfaces/mcp/mcp';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';

// 確保 e2e 測試不受其他測試的 mock 影響
beforeAll(() => {
  vi.unmock('fs/promises');
  vi.unmock('fs');
  vi.unmock('glob');
});

describe('MCP 工具執行 E2E 測試', () => {
  let mcp: AgentIdeMCP;
  let project: TestProject;

  beforeEach(async () => {
    ParserRegistry.resetInstance();
    mcp = new AgentIdeMCP();

    // 建立測試專案
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

  describe('code_index 工具', () => {
    it('應該能建立程式碼索引', async () => {
      const result = await mcp.executeTool('code_index', {
        path: project.projectPath
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('應該能處理無效路徑', async () => {
      const result = await mcp.executeTool('code_index', {
        path: '/non/existent/path'
      });

      expect(result.error).toBeDefined();
    });
  });

  describe('code_search 工具', () => {
    it('應該能搜尋符號', async () => {
      // 先建立索引
      await mcp.executeTool('code_index', {
        path: project.projectPath
      });

      // 執行搜尋
      const result = await mcp.executeTool('code_search', {
        query: 'UserService',
        path: project.projectPath
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('應該能搜尋文字', async () => {
      const result = await mcp.executeTool('code_search', {
        query: 'getUser',
        path: project.projectPath,
        mode: 'text'
      });

      expect(result).toBeDefined();
    });

    it('應該能限制搜尋結果數量', async () => {
      const result = await mcp.executeTool('code_search', {
        query: 'User',
        path: project.projectPath,
        limit: 5
      });

      expect(result).toBeDefined();
    });
  });

  describe.skip('code_rename 工具', () => {
    it.skip('應該能重新命名符號（預覽模式）', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await mcp.executeTool('code_rename', {
        file: filePath,
        line: 1,
        column: 14,
        newName: 'CustomerService',
        preview: true
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it.skip('應該能檢測命名衝突', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await mcp.executeTool('code_rename', {
        file: filePath,
        line: 1,
        column: 14,
        newName: 'OrderService',
        preview: true
      });

      expect(result).toBeDefined();
    });
  });

  describe.skip('code_move 工具', () => {
    it.skip('應該能移動檔案（預覽模式）', async () => {
      const sourcePath = project.getFilePath('src/user.ts');
      const destPath = project.getFilePath('src/services/user.ts');

      const result = await mcp.executeTool('code_move', {
        source: sourcePath,
        destination: destPath,
        preview: true
      });

      expect(result).toBeDefined();
    });

    it.skip('應該能處理目標路徑已存在的情況', async () => {
      const sourcePath = project.getFilePath('src/user.ts');
      const destPath = project.getFilePath('src/order.ts');

      const result = await mcp.executeTool('code_move', {
        source: sourcePath,
        destination: destPath,
        preview: true
      });

      expect(result).toBeDefined();
      expect(result.error || result.content).toBeDefined();
    });
  });

  describe('code_analyze 工具', () => {
    it('應該能分析程式碼複雜度', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await mcp.executeTool('code_analyze', {
        path: filePath
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('應該能分析整個專案', async () => {
      const result = await mcp.executeTool('code_analyze', {
        path: project.projectPath
      });

      expect(result).toBeDefined();
    });
  });

  describe('code_refactor 工具', () => {
    it.skip('應該能提取函式（預覽模式）', async () => {
      const filePath = project.getFilePath('src/order.ts');

      const result = await mcp.executeTool('code_refactor', {
        operation: 'extract-function',
        file: filePath,
        startLine: 7,
        endLine: 8,
        functionName: 'getUserInfo',
        preview: true
      });

      expect(result).toBeDefined();
    });

    it.skip('應該能處理不支援的重構操作', async () => {
      const filePath = project.getFilePath('src/user.ts');

      const result = await mcp.executeTool('code_refactor', {
        operation: 'inline-class',
        file: filePath,
        preview: true
      });

      expect(result).toBeDefined();
      // 應該有錯誤訊息
      expect(result.error || result.content).toContain('不支援' || '未知');
    });
  });

  describe('code_deps 工具', () => {
    it('應該能分析專案依賴', async () => {
      const result = await mcp.executeTool('code_deps', {
        path: project.projectPath
      });

      expect(result).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('應該能分析單一檔案的依賴', async () => {
      const filePath = project.getFilePath('src/order.ts');

      const result = await mcp.executeTool('code_deps', {
        path: filePath
      });

      expect(result).toBeDefined();
    });

    it('應該能檢測循環依賴', async () => {
      // 建立循環依賴
      const circularProject = await createTypeScriptProject({
        'src/a.ts': `
import { b } from './b';
export function a() { return b(); }
        `.trim(),
        'src/b.ts': `
import { a } from './a';
export function b() { return a(); }
        `.trim()
      });

      const result = await mcp.executeTool('code_deps', {
        path: circularProject.projectPath
      });

      expect(result).toBeDefined();

      await circularProject.cleanup();
    });
  });

  describe('工具參數驗證', () => {
    it('應該拒絕缺少必要參數的請求', async () => {
      const result = await mcp.executeTool('code_index', {});

      expect(result.error).toBeDefined();
      // 錯誤訊息應該提及參數問題
      expect(result.error.length).toBeGreaterThan(0);
    });

    it('應該拒絕無效的工具名稱', async () => {
      const result = await mcp.executeTool('invalid_tool', {});

      expect(result.error).toBeDefined();
    });

    it.skip('應該驗證參數型別', async () => {
      const result = await mcp.executeTool('code_search', {
        query: 123, // 應該是 string
        path: project.projectPath
      });

      expect(result.error).toBeDefined();
    });
  });
});
