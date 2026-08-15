/**
 * move 命令的路徑顯示格式
 * move 與 glob move 的輸出都引用這裡，禁各自複製一份格式化規則。
 */

import * as path from 'path';

/** 以 project root 為基準的相對路徑；指向 project root 本身時顯示為 `.` */
export function formatRelativePath(projectRoot: string, filePath: string): string {
  const relativePath = path.relative(projectRoot, filePath);
  return relativePath.length > 0 ? relativePath : '.';
}
