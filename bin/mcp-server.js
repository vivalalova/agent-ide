#!/usr/bin/env node

/**
 * Agent IDE MCP Server 入口點
 * 提供 stdio-based MCP Server 供 Claude Code 等 AI 工具使用
 */

import { MCPServer } from '../dist/interfaces/mcp/mcp-server.js';

async function main() {
  try {
    const server = new MCPServer();
    await server.start();
  } catch (error) {
    console.error('MCP Server 啟動失敗:', error.message);
    process.exit(1);
  }
}

main();
