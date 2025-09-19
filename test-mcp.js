#!/usr/bin/env node

/**
 * 測試 MCP 介面功能
 */

console.log('Testing MCP interface...');

try {
  // 測試導入 MCP 模組
  import('./dist/interfaces/mcp/index.js').then(mcpModule => {
    console.log('✓ MCP module loaded');
    
    // 測試創建 MCP 實例
    const { AgentIdeMCP } = mcpModule;
    const mcp = new AgentIdeMCP();
    console.log('✓ AgentIdeMCP created');
    
    // 測試取得可用工具
    const tools = mcp.getTools();
    console.log('✓ MCP tools retrieved:', tools.length, 'tools');
    
    // 列出工具名稱
    tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description}`);
    });
    
    console.log('\n✅ MCP interface test completed successfully');
  }).catch(error => {
    console.error('❌ MCP module import failed:', error.message);
  });

} catch (error) {
  console.error('❌ MCP test failed:', error.message);
}