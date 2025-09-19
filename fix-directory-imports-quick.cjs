#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // 修正 index.js 目錄 import
  const updated = content
    .replace(/from ['"]\.\/([^\/'"]+)\.js['"]/g, (match, dir) => {
      const indexPath = `./dist/${path.dirname(filePath).replace('./dist/', '')}/${dir}/index.js`;
      if (fs.existsSync(indexPath)) {
        return `from './${dir}/index.js'`;
      }
      return match;
    })
    .replace(/from ['"]\.\.\/([^\/'"]+)\.js['"]/g, (match, dir) => {
      const currentDir = path.dirname(filePath);
      const parentDir = path.dirname(currentDir);
      const indexPath = path.join(parentDir, dir, 'index.js');
      if (fs.existsSync(indexPath)) {
        return `from '../${dir}/index.js'`;
      }
      return match;
    })
    .replace(/from ['"]\.\.\/.\.\.\/([^\/'"]+)\.js['"]/g, (match, dir) => {
      const currentDir = path.dirname(filePath);
      const parentDir = path.dirname(path.dirname(currentDir));
      const indexPath = path.join(parentDir, dir, 'index.js');
      if (fs.existsSync(indexPath)) {
        return `from '../../${dir}/index.js'`;
      }
      return match;
    });
  
  if (updated !== content) {
    fs.writeFileSync(filePath, updated);
    console.log(`Fixed directory imports: ${filePath}`);
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

console.log('Fixing directory imports in dist/...');
walkDir('./dist');
console.log('Done!');