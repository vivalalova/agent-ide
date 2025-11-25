#!/bin/bash
# 清理殭屍 vitest worker process

echo "🔍 檢查 vitest worker process..."
vitest_pids=$(pgrep -f "vitest.*forks.js" || true)

if [ -z "$vitest_pids" ]; then
  echo "✅ 沒有殭屍 vitest process"
  exit 0
fi

echo "🧹 發現 vitest worker process，正在清理..."
pkill -f "vitest.*forks.js"
sleep 1

# 確認清理完成
remaining=$(pgrep -f "vitest.*forks.js" || true)
if [ -z "$remaining" ]; then
  echo "✅ 清理完成"
  exit 0
else
  echo "⚠️  強制終止殘留 process..."
  pkill -9 -f "vitest.*forks.js"
  echo "✅ 強制清理完成"
fi
