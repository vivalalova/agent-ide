/**
 * tsconfig.json 載入器
 * 提供向上查找 tsconfig.json 並解析 path aliases 的功能
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { logger } from '@infrastructure/logging/index.js';

/** tsconfig 路徑設定 */
export interface TsconfigPathConfig {
  /** path aliases 映射（alias -> 絕對路徑） */
  pathAliases: Record<string, string>;
  /** baseUrl 絕對路徑 */
  baseUrl?: string;
  /** tsconfig.json 所在目錄 */
  tsconfigDir?: string;
}

/** tsconfig 查找結果 */
interface TsconfigLocation {
  tsconfigPath: string;
  tsconfigDir: string;
}

/**
 * 向上查找 tsconfig.json
 * 從指定目錄開始，逐層向上查找直到找到 tsconfig.json 或到達根目錄
 *
 * @param startDir 起始目錄
 * @param fileSystem 檔案系統
 * @returns tsconfig 位置，若未找到則返回 null
 */
export async function findTsconfigUp(
  startDir: string,
  fileSystem: IFileSystem
): Promise<TsconfigLocation | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const tsconfigPath = path.join(currentDir, 'tsconfig.json');
    if (await fileSystem.exists(tsconfigPath)) {
      return { tsconfigPath, tsconfigDir: currentDir };
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * 讀取 tsconfig.json 路徑設定（包含 paths 和 baseUrl）
 * 會向上查找 tsconfig.json，以支援 --path 指向子目錄的情況
 *
 * @param projectRoot 專案根目錄（或子目錄）
 * @param fileSystem 檔案系統
 * @returns tsconfig 路徑設定
 */
export async function loadTsconfigPathConfig(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<TsconfigPathConfig> {
  const config: TsconfigPathConfig = { pathAliases: {} };

  try {
    // 向上查找 tsconfig.json
    const found = await findTsconfigUp(projectRoot, fileSystem);
    if (!found) {
      return config;
    }

    const { tsconfigPath, tsconfigDir } = found;
    config.tsconfigDir = tsconfigDir;

    const tsconfigContent = await fileSystem.readFile(tsconfigPath, 'utf-8') as string;
    const tsconfig = JSON.parse(tsconfigContent);

    // 解析 baseUrl（相對於 tsconfig.json 所在目錄）
    if (tsconfig.compilerOptions?.baseUrl) {
      config.baseUrl = path.resolve(tsconfigDir, tsconfig.compilerOptions.baseUrl);
    }

    // 解析 paths（相對於 tsconfig.json 所在目錄）
    if (tsconfig.compilerOptions?.paths) {
      const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
      const basePath = path.resolve(tsconfigDir, baseUrl);

      for (const [alias, paths] of Object.entries(tsconfig.compilerOptions.paths)) {
        if (Array.isArray(paths) && paths.length > 0) {
          // 移除 /* 後綴
          const cleanAlias = alias.replace(/\/\*$/, '');
          const cleanPath = (paths[0] as string).replace(/\/\*$/, '');
          // 轉換為絕對路徑
          config.pathAliases[cleanAlias] = path.resolve(basePath, cleanPath);
        }
      }
    }
  } catch (error) {
    // graceful-degradation: tsconfig.json 不存在或格式錯誤時使用空設定
    logger.warn('tsconfig-loader', `Failed to load tsconfig.json: ${error}`);
  }

  return config;
}

/**
 * 簡化版：只取得 path aliases（向後相容）
 *
 * @param projectRoot 專案根目錄（或子目錄）
 * @param fileSystem 檔案系統
 * @returns path aliases 映射
 */
export async function loadPathAliases(
  projectRoot: string,
  fileSystem: IFileSystem
): Promise<Record<string, string>> {
  const config = await loadTsconfigPathConfig(projectRoot, fileSystem);
  return config.pathAliases;
}
