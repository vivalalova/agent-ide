#!/usr/bin/env node

/**
 * 修正 TypeScript 編譯後的 ES module 匯入路徑
 * 自動添加 .js 副檔名到相對路徑匯入
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

async function fixImports() {
  console.log('🔧 開始修正 ES module 匯入路徑...');
  
  // 找到所有 JS 檔案
  const jsFiles = await glob('dist/**/*.js', { 
    ignore: ['**/node_modules/**'],
    absolute: true
  });
  
  console.log(`📁 找到 ${jsFiles.length} 個 JS 檔案`);
  
  let fixedFiles = 0;
  let totalFixes = 0;
  
  for (const filePath of jsFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // 修正 import 語句（包含多行）
      let newContent = content.replace(
        /(import\s+.*?\s+from\s+['"`])(\.[^'"`]+)(['"`][^;]*;?)/gm,
        (match, prefix, importPath, suffix) => {
          // 檢查是否已經有副檔名
          if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.json')) {
            return match;
          }
          
          // 檢查是否是相對路徑
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            modified = true;
            totalFixes++;
            return `${prefix}${importPath}.js${suffix}`;
          }
          
          return match;
        }
      );
      
      // 修正 export 語句（包含多行）
      newContent = newContent.replace(
        /(export\s+.*?\s+from\s+['"`])(\.[^'"`]+)(['"`][^;]*;?)/gm,
        (match, prefix, importPath, suffix) => {
          // 檢查是否已經有副檔名
          if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.json')) {
            return match;
          }
          
          // 檢查是否是相對路徑
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            modified = true;
            totalFixes++;
            return `${prefix}${importPath}.js${suffix}`;
          }
          
          return match;
        }
      );
      
      // 修正動態 import() 語句
      newContent = newContent.replace(
        /import\s*\(\s*['"`](\.[^'"`]+)['"`]\s*\)/g,
        (match, importPath) => {
          // 檢查是否已經有副檔名
          if (importPath.endsWith('.js') || importPath.endsWith('.ts') || importPath.endsWith('.json')) {
            return match;
          }
          
          // 檢查是否是相對路徑
          if (importPath.startsWith('./') || importPath.startsWith('../')) {
            modified = true;
            totalFixes++;
            return `import('${importPath}.js')`;
          }
          
          return match;
        }
      );
      
      if (modified) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedFiles++;
        console.log(`✅ 修正: ${path.relative(process.cwd(), filePath)}`);
      }
      
    } catch (error) {
      console.error(`❌ 處理檔案失敗: ${filePath}`, error.message);
    }
  }
  
  console.log(`\n🎉 完成! 修正了 ${fixedFiles} 個檔案中的 ${totalFixes} 個匯入路徑`);
}

// 執行修正
fixImports().catch(error => {
  console.error('❌ 修正失敗:', error);
  process.exit(1);
});