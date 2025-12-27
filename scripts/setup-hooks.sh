#!/bin/bash
# 設定 git hooks

cp scripts/pre-commit.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
echo "✅ Git hooks installed"
