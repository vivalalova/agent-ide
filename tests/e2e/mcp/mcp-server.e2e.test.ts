/**
 * MCP Server E2E 測試
 * 測試 MCP 介面的工具註冊和查詢功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentIdeMCP } from '../../../src/interfaces/mcp/mcp';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';

describe('MCP Server E2E 測試', () => {
  let mcp: AgentIdeMCP;

  beforeEach(() => {
    ParserRegistry.resetInstance();
    mcp = new AgentIdeMCP();
  });

  afterEach(() => {
    ParserRegistry.resetInstance();
  });

  it('應該能建立 MCP Server 實例', () => {
    expect(mcp).toBeDefined();
  });

  it('應該能取得所有可用工具列表', () => {
    const tools = mcp.getTools();

    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('應該包含 code_index 工具', () => {
    const tools = mcp.getTools();

    const indexTool = tools.find(t => t.name === 'code_index');
    expect(indexTool).toBeDefined();
    expect(indexTool?.description).toContain('索引');
  });

  it('應該包含 code_rename 工具', () => {
    const tools = mcp.getTools();

    const renameTool = tools.find(t => t.name === 'code_rename');
    expect(renameTool).toBeDefined();
    expect(renameTool?.description).toContain('重新命名');
  });

  it('應該包含 code_move 工具', () => {
    const tools = mcp.getTools();

    const moveTool = tools.find(t => t.name === 'code_move');
    expect(moveTool).toBeDefined();
    expect(moveTool?.description).toContain('移動');
  });

  it('應該包含 code_search 工具', () => {
    const tools = mcp.getTools();

    const searchTool = tools.find(t => t.name === 'code_search');
    expect(searchTool).toBeDefined();
    expect(searchTool?.description).toContain('搜尋');
  });

  it('所有工具應該有正確的參數結構', () => {
    const tools = mcp.getTools();

    tools.forEach(tool => {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.parameters).toBeDefined();
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toBeDefined();
    });
  });
});
