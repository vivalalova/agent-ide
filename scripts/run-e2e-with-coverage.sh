#!/bin/bash

# E2E 測試覆蓋率執行腳本
# 執行完整的 E2E 測試並生成覆蓋率報告

set -e

echo "🚀 開始執行 E2E 測試覆蓋率驗證..."

# 檢查必要的工具
command -v pnpm >/dev/null 2>&1 || { echo "❌ 需要安裝 pnpm"; exit 1; }

# 設定環境變數
export NODE_ENV=test
export NODE_OPTIONS="--max-old-space-size=4096 --expose-gc"
export DEBUG_TESTS=${DEBUG_TESTS:-false}

# 清理舊的覆蓋率報告
echo "🧹 清理舊的覆蓋率報告..."
rm -rf coverage/e2e
mkdir -p coverage/e2e

# 確保依賴安裝完整
echo "📦 檢查依賴..."
pnpm install --frozen-lockfile

# 執行 TypeScript 檢查
echo "🔍 執行 TypeScript 檢查..."
pnpm typecheck

# 執行 ESLint 檢查
echo "🔍 執行 ESLint 檢查..."
pnpm lint

# 執行建置檢查
echo "🏗️ 執行建置檢查..."
pnpm build

echo "✅ 前置檢查完成"

# 執行 E2E 測試並生成覆蓋率
echo "🧪 執行 E2E 測試..."

# 設定測試執行參數
E2E_ARGS="--config=vitest.e2e.config.ts"
E2E_ARGS="$E2E_ARGS --reporter=verbose"
E2E_ARGS="$E2E_ARGS --coverage"
E2E_ARGS="$E2E_ARGS --coverage.enabled=true"

# 根據環境變數調整執行模式
if [ "$DEBUG_TESTS" = "true" ]; then
    echo "🐛 以除錯模式執行測試..."
    E2E_ARGS="$E2E_ARGS --reporter=verbose --bail=1"
fi

# 執行測試
echo "執行命令: pnpm vitest run $E2E_ARGS"

if pnpm vitest run $E2E_ARGS; then
    echo "✅ E2E 測試執行完成"
else
    echo "❌ E2E 測試執行失敗"
    exit 1
fi

# 檢查覆蓋率報告是否生成
echo "📊 檢查覆蓋率報告..."

COVERAGE_SUMMARY="coverage/e2e/coverage-summary.json"
COVERAGE_HTML="coverage/e2e/index.html"

if [ -f "$COVERAGE_SUMMARY" ]; then
    echo "✅ 覆蓋率摘要報告已生成: $COVERAGE_SUMMARY"

    # 提取關鍵覆蓋率指標
    if command -v jq >/dev/null 2>&1; then
        echo "📈 覆蓋率摘要:"
        echo "  - 程式碼行: $(jq -r '.total.lines.pct' $COVERAGE_SUMMARY)%"
        echo "  - 函式: $(jq -r '.total.functions.pct' $COVERAGE_SUMMARY)%"
        echo "  - 分支: $(jq -r '.total.branches.pct' $COVERAGE_SUMMARY)%"
        echo "  - 語句: $(jq -r '.total.statements.pct' $COVERAGE_SUMMARY)%"

        # 檢查是否達到 90% 目標
        LINES_PCT=$(jq -r '.total.lines.pct' $COVERAGE_SUMMARY)
        FUNCTIONS_PCT=$(jq -r '.total.functions.pct' $COVERAGE_SUMMARY)
        STATEMENTS_PCT=$(jq -r '.total.statements.pct' $COVERAGE_SUMMARY)

        if (( $(echo "$LINES_PCT >= 90" | bc -l) )) && \
           (( $(echo "$FUNCTIONS_PCT >= 90" | bc -l) )) && \
           (( $(echo "$STATEMENTS_PCT >= 90" | bc -l) )); then
            echo "🎉 恭喜！達到 90% 覆蓋率目標！"
        else
            echo "⚠️  尚未達到 90% 覆蓋率目標"
            echo "   建議執行覆蓋率驗證測試以獲得改善建議"
        fi
    else
        echo "💡 安裝 jq 以顯示詳細覆蓋率統計"
    fi
else
    echo "⚠️  覆蓋率摘要報告未生成"
fi

if [ -f "$COVERAGE_HTML" ]; then
    echo "✅ HTML 覆蓋率報告已生成: $COVERAGE_HTML"
    echo "💡 在瀏覽器中開啟 $COVERAGE_HTML 查看詳細報告"
else
    echo "⚠️  HTML 覆蓋率報告未生成"
fi

# 執行覆蓋率驗證測試
echo "🔍 執行覆蓋率驗證測試..."

if pnpm vitest run tests/e2e/coverage/coverage-validation.test.ts --config=vitest.e2e.config.ts; then
    echo "✅ 覆蓋率驗證通過"
else
    echo "⚠️  覆蓋率驗證未完全通過，請查看上方建議"
fi

# 生成覆蓋率摘要
echo ""
echo "📋 E2E 測試覆蓋率驗證完成摘要:"
echo "  - 測試配置: vitest.e2e.config.ts"
echo "  - 覆蓋率報告: coverage/e2e/"
echo "  - HTML 報告: coverage/e2e/index.html"
echo "  - JSON 報告: coverage/e2e/coverage-final.json"
echo "  - 摘要報告: coverage/e2e/coverage-summary.json"

# 提供後續建議
echo ""
echo "🔧 後續建議:"
echo "  - 查看 HTML 報告以了解詳細覆蓋率情況"
echo "  - 針對低覆蓋率檔案增加測試"
echo "  - 確保關鍵業務邏輯有完整測試覆蓋"
echo "  - 定期執行此腳本以監控覆蓋率趨勢"

echo ""
echo "🎯 E2E 測試覆蓋率驗證腳本執行完成！"