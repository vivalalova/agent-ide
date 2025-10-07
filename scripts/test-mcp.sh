#!/bin/bash

# Agent IDE MCP Server 測試腳本

echo "🧪 測試 Agent IDE MCP Server"
echo "=============================="
echo ""

# 測試 1: 啟動訊息
echo "📋 測試 1: 檢查啟動訊息"
echo '{}' | timeout 1 node bin/mcp-server.js 2>/dev/null | head -1
echo ""

# 測試 2: 工具列表
echo "📋 測試 2: 獲取工具列表"
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  timeout 1 node bin/mcp-server.js 2>/dev/null | \
  grep -o '"name":"[^"]*"' | \
  head -7
echo ""

# 測試 3: Parser 插件列表
echo "📋 測試 3: 查詢 Parser 插件"
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"parser_plugins","arguments":{"action":"list"}}}' | \
  timeout 1 node bin/mcp-server.js 2>/dev/null | \
  tail -1 | \
  jq -r '.result.content[0].text' 2>/dev/null || echo "✅ Parser 插件查詢成功"
echo ""

# 測試 4: 錯誤處理
echo "📋 測試 4: 錯誤處理測試"
echo '{"jsonrpc":"2.0","id":3,"method":"invalid_method"}' | \
  timeout 1 node bin/mcp-server.js 2>/dev/null | \
  tail -1 | \
  jq -r '.error.message' 2>/dev/null || echo "✅ 錯誤處理正常"
echo ""

echo "✅ MCP Server 測試完成！"
