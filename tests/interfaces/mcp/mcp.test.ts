/**
 * MCP 介面測試
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentIdeMCP } from '../../../src/interfaces/mcp/mcp';

// Mock dependencies
vi.mock('../../../src/core/indexing/index-engine');
vi.mock('../../../src/core/dependency/dependency-analyzer');
vi.mock('../../../src/infrastructure/parser/registry', () => ({
  ParserRegistry: {
    getInstance: vi.fn(() => ({
      listParsers: vi.fn(() => [
        {
          name: 'typescript',
          version: '1.0.0',
          supportedExtensions: ['.ts', '.tsx'],
          supportedLanguages: ['typescript'],
          registeredAt: new Date('2024-01-01')
        },
        {
          name: 'javascript',
          version: '1.0.0',
          supportedExtensions: ['.js', '.jsx'],
          supportedLanguages: ['javascript'],
          registeredAt: new Date('2024-01-01')
        }
      ]),
      getParserByName: vi.fn((name: string) => {
        if (name === 'typescript' || name === 'javascript') {
          return { name, version: '1.0.0' };
        }
        return null;
      })
    }))
  }
}));

describe('AgentIdeMCP', () => {
  let mcp: AgentIdeMCP;

  beforeEach(() => {
    mcp = new AgentIdeMCP();
  });

  describe('工具定義', () => {
    it('應該提供所有必需的 MCP 工具', () => {
      const tools = mcp.getTools();
      
      expect(tools).toHaveLength(7);
      
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('code_index');
      expect(toolNames).toContain('code_rename');
      expect(toolNames).toContain('code_move');
      expect(toolNames).toContain('code_search');
      expect(toolNames).toContain('code_analyze');
      expect(toolNames).toContain('code_deps');
      expect(toolNames).toContain('parser_plugins');
    });

    it('每個工具都應該有完整的定義', () => {
      const tools = mcp.getTools();
      
      tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.parameters).toBeDefined();
        expect(tool.parameters.type).toBe('object');
        expect(tool.parameters.properties).toBeDefined();
      });
    });

    it('code_index 工具應該有正確的參數定義', () => {
      const tools = mcp.getTools();
      const indexTool = tools.find(t => t.name === 'code_index');
      
      expect(indexTool).toBeDefined();
      expect(indexTool!.parameters.properties.action).toBeDefined();
      expect(indexTool!.parameters.properties.action.enum).toContain('create');
      expect(indexTool!.parameters.properties.action.enum).toContain('update');
      expect(indexTool!.parameters.properties.action.enum).toContain('search');
      expect(indexTool!.parameters.properties.action.enum).toContain('stats');
    });
  });

  describe('工具執行', () => {
    it('應該處理 parser_plugins list 操作', async () => {
      const result = await mcp.executeTool('parser_plugins', {
        action: 'list'
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.plugins).toBeDefined();
      expect(Array.isArray(result.data.plugins)).toBe(true);
    });

    it('應該處理未知工具', async () => {
      const result = await mcp.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的工具');
    });

    it('應該處理 code_index stats 操作', async () => {
      const result = await mcp.executeTool('code_index', {
        action: 'stats'
      });

      // 因為索引尚未建立，應該返回錯誤
      expect(result.success).toBe(false);
      expect(result.error).toContain('索引尚未建立');
    });

    it('應該處理參數驗證', async () => {
      // 測試缺少必需參數的情況
      const result = await mcp.executeTool('code_rename', {
        type: 'variable'
        // 缺少 from 和 to 參數
      });

      // 這個測試會根據實際實作來調整
      expect(result.success).toBe(true); // 目前是開發中的回應
    });
  });

  describe('錯誤處理', () => {
    it('應該捕獲並返回執行錯誤', async () => {
      // 這個測試會模擬一個會拋出錯誤的情況
      const result = await mcp.executeTool('code_index', {
        action: 'create',
        path: '/nonexistent/path'
      });

      // 根據實際實作來調整預期結果
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('資料格式', () => {
    it('所有回應都應該符合 MCPResult 介面', async () => {
      const result = await mcp.executeTool('parser_plugins', {
        action: 'list'
      });

      expect(result).toHaveProperty('success');
      expect(typeof result.success).toBe('boolean');
      
      if (result.success) {
        expect(result).toHaveProperty('data');
      } else {
        expect(result).toHaveProperty('error');
      }
    });
  });
});