#!/bin/bash

# Swift Parser CLI 編譯腳本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building SwiftParserCLI..."

# 清理之前的建置
if [ -d ".build" ]; then
    echo "🧹 Cleaning previous build..."
    rm -rf .build
fi

# 編譯
swift build -c release

# 複製執行檔到方便存取的位置
BIN_PATH=".build/release/SwiftParserCLI"
if [ -f "$BIN_PATH" ]; then
    cp "$BIN_PATH" "./swift-parser"
    chmod +x "./swift-parser"
    echo "✅ Build successful! Binary: $SCRIPT_DIR/swift-parser"
else
    echo "❌ Build failed: Binary not found at $BIN_PATH"
    exit 1
fi

# 測試編譯結果
echo ""
echo "🧪 Testing parser..."
echo 'struct Test { let value: Int }' | ./swift-parser > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Parser test passed!"
else
    echo "❌ Parser test failed!"
    exit 1
fi

echo ""
echo "✨ Done! Use: echo 'swift code' | $SCRIPT_DIR/swift-parser"
