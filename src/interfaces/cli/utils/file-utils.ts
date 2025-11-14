/**
 * 文件系統工具模組
 * 提供文件操作相關功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ParserRegistry } from '../../../infrastructure/parser/registry.js';

/**
 * 檢查檔案是否存在
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 獲取專案中的所有檔案
 */
export async function getAllProjectFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];
  // 從 ParserRegistry 獲取所有支援的副檔名
  const registry = ParserRegistry.getInstance();
  const allowedExtensions = registry.getSupportedExtensions();
  const excludePatterns = ['node_modules', 'dist', '.git', 'coverage'];

  // 檢查路徑是檔案還是目錄
  try {
    const stats = await fs.stat(projectPath);

    if (stats.isFile()) {
      // 如果是單一檔案，直接返回
      if (allowedExtensions.some(ext => projectPath.endsWith(ext))) {
        return [projectPath];
      }
      return [];
    }
  } catch (error) {
    // 路徑不存在
    return [];
  }

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // 跳過排除的目錄
          if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
            continue;
          }
          await walkDir(fullPath);
        } else if (entry.isFile()) {
          // 只包含支援的副檔名
          if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // 忽略無法存取的目錄
    }
  }

  await walkDir(projectPath);
  return files;
}

/**
 * 讀取 tsconfig.json 的路徑別名設定
 */
export async function loadPathAliases(projectRoot: string): Promise<Record<string, string>> {
  const pathAliases: Record<string, string> = {};

  try {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfigContent = await fs.readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(tsconfigContent);

    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
      const basePath = path.resolve(projectRoot, baseUrl);

      for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
        if (Array.isArray(paths) && paths.length > 0) {
          // 移除 /* 後綴
          const cleanAlias = alias.replace(/\/\*$/, '');
          const cleanPath = (paths[0] as string).replace(/\/\*$/, '');
          // 轉換為絕對路徑
          pathAliases[cleanAlias] = path.resolve(basePath, cleanPath);
        }
      }
    }
  } catch (error) {
    // tsconfig.json 不存在或解析失敗，使用空的路徑別名
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️  無法讀取 tsconfig.json 路徑別名設定');
    }
  }

  return pathAliases;
}
