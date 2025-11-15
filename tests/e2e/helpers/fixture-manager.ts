/**
 * Fixture Manager - 簡化版本
 * 使用 git restore 恢復 fixtures 目錄到原始狀態
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(dirname, '../../fixtures');

/**
 * 恢復 fixtures 目錄到 git 原始狀態
 */
export async function resetFixtures(): Promise<void> {
  const projectRoot = path.resolve(dirname, '../../..');
  await execAsync('git restore tests/fixtures/ && git clean -fdx tests/fixtures/', {
    cwd: projectRoot
  });
}

/**
 * 取得 fixture 專案的絕對路徑
 */
export function getFixturePath(name: string): string {
  return path.join(FIXTURES_DIR, name);
}
