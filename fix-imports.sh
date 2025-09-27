#!/bin/bash

# 尋找所有需要修正的 TypeScript 檔案
echo "開始修正所有 TypeScript 檔案的相對 import 路徑..."

# 處理所有 .ts 檔案（排除 node_modules 和 dist）
find src tests -name "*.ts" -type f | while read -r file; do
    # 檢查檔案是否包含需要修正的 import
    if grep -qE "from '\./[^']*'" "$file" 2>/dev/null; then
        echo "修正: $file"
        
        # 使用 sed 來修正相對路徑的 import（加上 .js 副檔名）
        # 處理 from './xxx' 或 from '../xxx' 格式
        sed -i.bak -E "s/from '(\.\.[^']*)'$/from '\1.js'/g" "$file"
        sed -i.bak -E "s/from '(\.[^']*)'$/from '\1.js'/g" "$file"
        
        # 處理已經有 .js 的情況，避免重複加上 .js.js
        sed -i.bak -E "s/\.js\.js'/\.js'/g" "$file"
        
        # 刪除備份檔案
        rm -f "${file}.bak"
    fi
done

echo "修正完成！"
