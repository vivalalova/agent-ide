#!/bin/bash
# 驗證 .claude-plugin 結構

set -e

PLUGIN_DIR=".claude-plugin"
MARKETPLACE_JSON="$PLUGIN_DIR/marketplace.json"

echo "🔍 Validating plugin structure..."

# 1. marketplace.json 存在且是有效 JSON
if ! jq empty "$MARKETPLACE_JSON" 2>/dev/null; then
  echo "❌ $MARKETPLACE_JSON is not valid JSON"
  exit 1
fi

# 2. 驗證 hooks 路徑格式（必須以 ./ 開頭且以 .json 結尾）
HOOKS=$(jq -r '.plugins[]?.hooks[]? // empty' "$MARKETPLACE_JSON" 2>/dev/null)
for hook in $HOOKS; do
  if [[ ! "$hook" =~ ^\.\/.+\.json$ ]]; then
    echo "❌ Invalid hook path: $hook (must start with ./ and end with .json)"
    exit 1
  fi
  if [[ ! -f "$hook" ]]; then
    echo "❌ Hook file not found: $hook"
    exit 1
  fi
  if ! jq empty "$hook" 2>/dev/null; then
    echo "❌ Hook file is not valid JSON: $hook"
    exit 1
  fi
done

# 3. 驗證 skills 路徑存在
SKILLS=$(jq -r '.plugins[]?.skills[]? // empty' "$MARKETPLACE_JSON" 2>/dev/null)
for skill in $SKILLS; do
  SKILL_SOURCE=$(jq -r '.plugins[] | select(.skills[]? == "'"$skill"'") | .source' "$MARKETPLACE_JSON")
  SKILL_PATH="${SKILL_SOURCE}/${skill}"
  SKILL_PATH="${SKILL_PATH//\/\.\//\/}"  # normalize ./
  if [[ ! -d "$SKILL_PATH" && ! -f "${SKILL_PATH}/SKILL.md" && ! -f "${SKILL_PATH}SKILL.md" ]]; then
    # 嘗試其他路徑組合
    if [[ ! -f "${SKILL_SOURCE}/SKILL.md" ]]; then
      echo "⚠️  Warning: Skill path may not exist: $SKILL_PATH"
    fi
  fi
done

echo "✅ Plugin validation passed"
