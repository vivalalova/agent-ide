#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, relative, join } from 'path';
import { glob } from 'glob';

/**
 * 路徑映射規則
 */
const PATH_MAPPINGS = {
  '@core': 'src/core',
  '@infrastructure': 'src/infrastructure',
  '@plugins': 'src/plugins',
  '@application': 'src/application',
  '@interfaces': 'src/interfaces',
  '@shared': 'src/shared',
};

/**
 * 將相對路徑轉換為路徑映射
 */
function convertImportPath(currentFilePath, importPath) {
  // 跳過非相對路徑
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // 解析絕對路徑
  const currentDir = dirname(currentFilePath);
  const absoluteImportPath = resolve(currentDir, importPath.replace(/\.js$/, ''));

  // 相對於專案根目錄的路徑
  const projectRoot = process.cwd();
  const relativeToRoot = relative(projectRoot, absoluteImportPath);

  // 嘗試匹配路徑映射
  for (const [alias, basePath] of Object.entries(PATH_MAPPINGS)) {
    if (relativeToRoot.startsWith(basePath)) {
      const mappedPath = relativeToRoot.replace(basePath, alias);
      // 保持 .js 擴展名（ESM 規範）
      return mappedPath + '.js';
    }
  }

  // 無法映射，保持原樣
  return importPath;
}

/**
 * 處理單個檔案
 */
function processFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  let modified = false;

  // 匹配所有 import 語句（包含 type import）
  const importRegex = /^(import(?:\s+type)?\s+.*?\s+from\s+['"])([^'"]+)(['"])/gm;

  const newContent = content.replace(importRegex, (match, prefix, importPath, suffix) => {
    const newPath = convertImportPath(filePath, importPath);

    if (newPath !== importPath) {
      modified = true;
      console.log(`  ${importPath} → ${newPath}`);
      return prefix + newPath + suffix;
    }

    return match;
  });

  if (modified) {
    writeFileSync(filePath, newContent, 'utf-8');
    return true;
  }

  return false;
}

/**
 * 主函數
 */
async function main() {
  console.log('🔄 開始遷移 import 路徑...\n');

  // 找到所有 TypeScript 檔案
  const files = await glob('**/*.ts', {
    ignore: ['node_modules/**', 'dist/**'],
    absolute: true,
  });

  console.log(`📁 找到 ${files.length} 個 TypeScript 檔案\n`);

  let modifiedCount = 0;

  for (const file of files) {
    const relativeFile = relative(process.cwd(), file);

    if (processFile(file)) {
      console.log(`✅ ${relativeFile}\n`);
      modifiedCount++;
    }
  }

  console.log(`\n✨ 完成！共修改 ${modifiedCount} 個檔案`);
}

main().catch(console.error);
