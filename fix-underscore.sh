#!/bin/bash

echo "修正所有底線開頭的變數命名..."

# 修正測試檔案中的 _description 參數
find tests -name "*.ts" -type f | while read -r file; do
    if grep -q "_description" "$file" 2>/dev/null; then
        echo "修正: $file"
        # 將 _description 改為未使用的參數註解
        sed -i.bak -E "s/\(_description,/_unused,/g" "$file"
        sed -i.bak -E "s/\(size, _description\)/(size, _unused)/g" "$file"
        sed -i.bak -E "s/if \(_description ===/if (_unused ===/g" "$file"
        rm -f "${file}.bak"
    fi
done

# 修正其他底線開頭的變數
find src tests -name "*.ts" -type f | while read -r file; do
    # 尋找並修正其他底線開頭的變數（排除已經處理的）
    if grep -qE "^\s+_((?!unused)[a-zA-Z])" "$file" 2>/dev/null; then
        echo "檢查其他底線變數: $file"
        # 將底線開頭的變數改為正常命名
        sed -i.bak -E "s/\b_([a-zA-Z][a-zA-Z0-9]*)\b/unused\1/g" "$file"
        rm -f "${file}.bak"
    fi
done

echo "修正完成！"
