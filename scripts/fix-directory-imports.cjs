#!/usr/bin/env node

/**
 * 修正目錄導入問題
 * 將 './directory' 改為 './directory/index.js'
 */

const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

async function fixDirectoryImports() {
  console.log('🔧 開始修正目錄導入問題...');
  
  // 找到所有 JS 檔案
  const jsFiles = await glob('dist/**/*.js', { 
    ignore: ['**/node_modules/**'],
    absolute: true
  });
  
  console.log(`📁 找到 ${jsFiles.length} 個 JS 檔案`);
  
  const directoryMappings = {
    '/errors': '/errors/index.js',
    '/types': '/types/index.js', 
    '/parser': '/parser/index.js',
    '/utils': '/utils/index.js',
    '/cache': '/cache/index.js',
    '/storage': '/storage/index.js'
  };
  
  let fixedFiles = 0;
  let totalFixes = 0;
  
  for (const filePath of jsFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      let newContent = content;
      
      // 修正每個目錄映射
      for (const [dirPath, replacement] of Object.entries(directoryMappings)) {
        // 修正 import 語句
        const importRegex = new RegExp(`(import\\s+.*?\\s+from\\s+['"\`])([^'"\`]*${dirPath.replace('/', '\\/')})(['"\`][^;]*;?)`, 'gm');
        newContent = newContent.replace(importRegex, (match, prefix, importPath, suffix) => {
          // 檢查是否已經有副檔名或是index.js
          if (importPath.endsWith('.js') || importPath.endsWith('/index.js') || importPath.endsWith('/index')) {
            return match;
          }
          
          // 如果路徑以目錄結尾，替換成 index.js
          if (importPath.endsWith(dirPath)) {
            modified = true;
            totalFixes++;
            return `${prefix}${importPath}${replacement.substring(dirPath.length)}${suffix}`;
          }
          
          return match;
        });
        
        // 修正 export 語句  
        const exportRegex = new RegExp(`(export\\s+.*?\\s+from\\s+['"\`])([^'"\`]*${dirPath.replace('/', '\\/')})(['"\`][^;]*;?)`, 'gm');
        newContent = newContent.replace(exportRegex, (match, prefix, importPath, suffix) => {
          // 檢查是否已經有副檔名或是index.js
          if (importPath.endsWith('.js') || importPath.endsWith('/index.js') || importPath.endsWith('/index')) {
            return match;
          }
          
          // 如果路徑以目錄結尾，替換成 index.js
          if (importPath.endsWith(dirPath)) {
            modified = true;
            totalFixes++;
            return `${prefix}${importPath}${replacement.substring(dirPath.length)}${suffix}`;
          }
          
          return match;
        });
      }
      
      if (modified) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        fixedFiles++;
        console.log(`✅ 修正: ${path.relative(process.cwd(), filePath)}`);
      }
      
    } catch (error) {
      console.error(`❌ 處理檔案失敗: ${filePath}`, error.message);
    }
  }
  
  console.log(`\n🎉 完成! 修正了 ${fixedFiles} 個檔案中的 ${totalFixes} 個目錄導入`);
}

// 執行修正
fixDirectoryImports().catch(error => {
  console.error('❌ 修正失敗:', error);
  process.exit(1);
});