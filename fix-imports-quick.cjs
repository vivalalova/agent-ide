#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 修正 .js 檔案中的 import 語句
  const updated = content
    .replace(/from ['"]\.([^'"]+)(?<!\.js)['"]/g, "from '.$1.js'")
    .replace(/import ['"]\.([^'"]+)(?<!\.js)['"]/g, "import '.$1.js'")
    .replace(/from ['"]\.\.([^'"]+)(?<!\.js)['"]/g, "from '..$1.js'")
    .replace(/import ['"]\.\.([^'"]+)(?<!\.js)['"]/g, "import '..$1.js'");
  
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    console.log(`Fixed: ${filePath}`);
  }
}

function walkDir(dirPath) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (item.endsWith('.js')) {
      processFile(fullPath);
    }
  }
}

console.log('Fixing import paths in dist/...');
walkDir('./dist');
console.log('Done!');