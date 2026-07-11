/**
 * PackageInfo
 * 讀取 package.json 版本號的單一權威來源。
 * 供 CLI（--version）與磁碟快取 key（cache invalidation）共用，
 * 避免版本讀取邏輯散落多處。
 */

import { readFileSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../package.json');

/**
 * 從 package.json 讀取 version 欄位
 * @param targetPath - package.json 路徑（預設為本專案的 package.json）
 */
export function readPackageVersion(targetPath: string = packageJsonPath): string {
  let packageJson: { version?: unknown };
  try {
    packageJson = JSON.parse(readFileSync(targetPath, 'utf-8')) as { version?: unknown };
  } catch (error) {
    throw new Error(`Cannot read package version from ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (typeof packageJson.version !== 'string' || packageJson.version.trim().length === 0) {
    throw new Error(`Invalid package version in ${targetPath}`);
  }

  return packageJson.version;
}

/** 模組載入時讀取一次，避免重複同步 I/O */
export const packageVersion = readPackageVersion();
