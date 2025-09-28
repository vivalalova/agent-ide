/**
 * MCP 介面測試
 * 測試 Model Context Protocol 介面的工具執行、參數驗證和結果格式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';
import { AgentIdeMCP, MCPResult, MCPTool } from '../../../src/interfaces/mcp/mcp';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';

// Mock dependencies
const mockIndexEngine = {
  indexProject: vi.fn().mockResolvedValue(undefined),
  getStats: vi.fn(() => Promise.resolve({
    totalFiles: 10,
    totalSymbols: 50,
    lastUpdated: new Date()
  })),
  findSymbol: vi.fn(() => Promise.resolve([
    {
      symbol: {
        name: 'testFunction',
        type: 'function',
        location: {
          filePath: '/test/file.ts',
          range: { start: { line: 1, column: 1 }, end: { line: 1, column: 10 } }
        }
      },
      fileInfo: { filePath: '/test/file.ts' },
      score: 1.0
    }
  ]))
};

vi.mock('../../../src/core/indexing/index-engine', () => ({
  IndexEngine: vi.fn(() => mockIndexEngine)
}));

vi.mock('../../../src/core/indexing/types', () => ({
  createIndexConfig: vi.fn().mockReturnValue({
    rootPath: '/test',
    includeExtensions: ['.ts'],
    excludePatterns: ['node_modules']
  })
}));

// 正確的 ParserRegistry mock 實作
const mockParserRegistry = {
  listParsers: vi.fn(() => [
    {
      name: 'typescript',
      version: '1.0.0',
      supportedExtensions: ['.ts', '.tsx'],
      supportedLanguages: ['typescript'],
      registeredAt: new Date()
    },
    {
      name: 'javascript',
      version: '1.0.0',
      supportedExtensions: ['.js', '.jsx'],
      supportedLanguages: ['javascript'],
      registeredAt: new Date()
    }
  ]),
  getParserByName: vi.fn((name: string) => {
    if (name === 'typescript') return { name, version: '1.0.0' };
    if (name === 'javascript') return { name, version: '1.0.0' };
    return null;
  })
};

vi.mock('../../../src/infrastructure/parser/registry', () => ({
  ParserRegistry: {
    getInstance: vi.fn(() => mockParserRegistry),
    resetInstance: vi.fn()
  }
}));

describe('MCP 介面測試', () => {
  let mcp: AgentIdeMCP;

  beforeEach(() => {
    // 重置所有 mocks
    vi.clearAllMocks();
    mcp = new AgentIdeMCP();
  });

  afterEach(() => {
    // 清理
    vi.clearAllMocks();
  });

  describe('工具定義和註冊', () => {
    it('應該返回所有可用的 MCP 工具', withMemoryOptimization(() => {
      const tools = mcp.getTools();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);

      // 檢查必要的工具
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('code_index');
      expect(toolNames).toContain('code_rename');
      expect(toolNames).toContain('code_move');
      expect(toolNames).toContain('code_search');
      expect(toolNames).toContain('code_analyze');
      expect(toolNames).toContain('code_deps');
      expect(toolNames).toContain('parser_plugins');
    }, { testName: 'mcp-tools-listing' }));

    it('每個工具都應該有正確的結構', withMemoryOptimization(() => {
      const tools = mcp.getTools();

      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');

        expect(typeof tool.name).toBe('string');
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toHaveProperty('type', 'object');
        expect(tool.parameters).toHaveProperty('properties');

        // 檢查 name 是有效的識別符
        expect(tool.name).toMatch(/^[a-zA-Z][a-zA-Z0-9_]*$/);

        // 檢查 description 不為空
        expect(tool.description.trim().length).toBeGreaterThan(0);
      });
    }, { testName: 'mcp-tool-structure-validation' }));

    it('工具參數定義應該完整', withMemoryOptimization(() => {
      const tools = mcp.getTools();
      const codeIndexTool = tools.find(t => t.name === 'code_index');

      expect(codeIndexTool).toBeDefined();
      expect(codeIndexTool!.parameters.properties).toHaveProperty('action');
      expect(codeIndexTool!.parameters.required).toContain('action');

      const actionParam = codeIndexTool!.parameters.properties.action;
      expect(actionParam).toHaveProperty('type', 'string');
      expect(actionParam).toHaveProperty('enum');
      expect(actionParam.enum).toContain('create');
      expect(actionParam.enum).toContain('search');
    }, { testName: 'mcp-parameter-definitions' }));
  });

  describe('程式碼索引工具測試', () => {
    it('應該能執行索引建立', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_index', {
        action: 'create',
        path: '/test/project',
        extensions: ['.ts', '.js'],
        excludePatterns: ['node_modules/**']
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('action', '建立');
      expect(result.data).toHaveProperty('stats');
      expect(result.data.stats).toHaveProperty('totalFiles');
      expect(result.data.stats).toHaveProperty('totalSymbols');
    }, { testName: 'mcp-index-create' }));

    it('應該能執行符號搜尋', withMemoryOptimization(async () => {
      // 先建立索引
      await mcp.executeTool('code_index', {
        action: 'create',
        path: '/test/project'
      });

      // 然後執行搜尋
      const result = await mcp.executeTool('code_index', {
        action: 'search',
        query: 'testFunction'
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('query', 'testFunction');
      expect(result.data).toHaveProperty('results');
      expect(Array.isArray(result.data.results)).toBe(true);

      if (result.data.results.length > 0) {
        const firstResult = result.data.results[0];
        expect(firstResult).toHaveProperty('name');
        expect(firstResult).toHaveProperty('type');
        expect(firstResult).toHaveProperty('file');
        expect(firstResult).toHaveProperty('line');
        expect(firstResult).toHaveProperty('score');
      }
    }, { testName: 'mcp-index-search' }));

    it('應該能獲取索引統計', withMemoryOptimization(async () => {
      // 先建立索引
      await mcp.executeTool('code_index', {
        action: 'create',
        path: '/test/project'
      });

      const result = await mcp.executeTool('code_index', {
        action: 'stats'
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('totalFiles');
      expect(result.data).toHaveProperty('totalSymbols');
      expect(typeof result.data.totalFiles).toBe('number');
      expect(typeof result.data.totalSymbols).toBe('number');
    }, { testName: 'mcp-index-stats' }));

    it('應該在缺少必要參數時返回錯誤', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_index', {
        action: 'create'
        // 缺少 path 參數
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('需要指定專案路徑');
    }, { testName: 'mcp-index-missing-params' }));

    it('應該在索引未建立時搜尋失敗', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_index', {
        action: 'search',
        query: 'test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('索引尚未建立');
    }, { testName: 'mcp-search-without-index' }));
  });

  describe('插件管理工具測試', () => {
    it('應該能列出已註冊的插件', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('parser_plugins', {
        action: 'list'
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('plugins');
      expect(result.data).toHaveProperty('total');
      expect(Array.isArray(result.data.plugins)).toBe(true);
      expect(typeof result.data.total).toBe('number');

      if (result.data.plugins.length > 0) {
        const plugin = result.data.plugins[0];
        expect(plugin).toHaveProperty('name');
        expect(plugin).toHaveProperty('version');
        expect(plugin).toHaveProperty('supportedExtensions');
        expect(plugin).toHaveProperty('supportedLanguages');
        expect(plugin).toHaveProperty('registeredAt');
      }
    }, { testName: 'mcp-plugins-list' }));

    it('應該能獲取特定插件的資訊', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('parser_plugins', {
        action: 'info',
        plugin: 'typescript'
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('name', 'typescript');
    }, { testName: 'mcp-plugin-info' }));

    it('應該在插件不存在時返回錯誤', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('parser_plugins', {
        action: 'info',
        plugin: 'nonexistent-plugin'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('找不到插件');
    }, { testName: 'mcp-plugin-not-found' }));
  });

  describe('其他工具的佔位符實作測試', () => {
    it('重新命名工具應該返回開發中消息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_rename', {
        type: 'function',
        from: 'oldName',
        to: 'newName'
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('開發中');
    }, { testName: 'mcp-rename-placeholder' }));

    it('移動工具應該返回開發中消息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_move', {
        source: '/src/old.ts',
        target: '/src/new.ts'
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('開發中');
    }, { testName: 'mcp-move-placeholder' }));

    it('搜尋工具應該返回開發中消息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_search', {
        query: 'function test'
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('開發中');
    }, { testName: 'mcp-search-placeholder' }));

    it('分析工具應該返回開發中消息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_analyze', {
        path: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('開發中');
    }, { testName: 'mcp-analyze-placeholder' }));

    it('依賴工具應該返回開發中消息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_deps', {
        path: '/test/project'
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('開發中');
    }, { testName: 'mcp-deps-placeholder' }));
  });

  describe('錯誤處理測試', () => {
    it('應該處理未知工具', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('未知的工具');
    }, { testName: 'mcp-unknown-tool' }));

    it('應該捕獲和處理異常', withMemoryOptimization(async () => {
      // Mock 一個會拋出異常的方法
      const originalHandleCodeIndex = (mcp as any).handleCodeIndex;
      (mcp as any).handleCodeIndex = vi.fn().mockRejectedValue(new Error('測試錯誤'));

      const result = await mcp.executeTool('code_index', {
        action: 'create',
        path: '/test'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('測試錯誤');

      // 恢復原始方法
      (mcp as any).handleCodeIndex = originalHandleCodeIndex;
    }, { testName: 'mcp-exception-handling' }));
  });

  describe('資料格式驗證', () => {
    it('所有成功回應都應該符合 MCPResult 介面', withMemoryOptimization(async () => {
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
    }, { testName: 'mcp-result-format' }));

    it('錯誤回應應該包含錯誤信息', withMemoryOptimization(async () => {
      const result = await mcp.executeTool('code_index', {
        action: 'invalid_action'
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    }, { testName: 'mcp-error-format' }));
  });

  describe('整合測試', () => {
    it('應該能執行完整的索引-搜尋工作流程', withMemoryOptimization(async () => {
      // 1. 建立索引
      const indexResult = await mcp.executeTool('code_index', {
        action: 'create',
        path: '/test/project'
      });
      expect(indexResult.success).toBe(true);

      // 2. 獲取統計
      const statsResult = await mcp.executeTool('code_index', {
        action: 'stats'
      });
      expect(statsResult.success).toBe(true);

      // 3. 執行搜尋
      const searchResult = await mcp.executeTool('code_index', {
        action: 'search',
        query: 'test'
      });
      expect(searchResult.success).toBe(true);
    }, { testName: 'mcp-workflow-integration' }));
  });
});