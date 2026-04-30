import * as path from 'path';
import type { BatchMoveInfo } from './types.js';

export interface GlobMovePlanInput {
  readonly sourcePattern: string;
  readonly matchedFiles: readonly string[];
  readonly targetPath: string;
  readonly projectRoot: string;
  readonly targetIsDirectory: boolean;
}

export interface GlobMovedFile {
  readonly from: string;
  readonly to: string;
}

export interface GlobMovePlan {
  readonly globPattern: string;
  readonly globBaseDir: string;
  readonly absoluteGlobBaseDir: string;
  readonly movedFiles: readonly GlobMovedFile[];
  readonly batchMoveInfo: BatchMoveInfo;
}

/** 檢查路徑是否包含 glob pattern */
export function isGlobPattern(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern);
}

/**
 * 計算 glob pattern 的基礎目錄。
 * 找到第一個包含 glob 特殊字元的路徑段之前的部分。
 */
export function getGlobBaseDir(pattern: string): string {
  const segments = pattern.split('/');
  const baseSegments: string[] = [];

  for (const segment of segments) {
    if (isGlobPattern(segment)) {
      break;
    }
    baseSegments.push(segment);
  }

  return baseSegments.length > 0 ? `${baseSegments.join('/')}/` : '';
}

export function resolveGlobPattern(sourcePattern: string, projectRoot: string): string {
  return path.isAbsolute(sourcePattern)
    ? path.relative(projectRoot, sourcePattern)
    : sourcePattern;
}

export function createGlobMovePlan(input: GlobMovePlanInput): GlobMovePlan {
  const globPattern = resolveGlobPattern(input.sourcePattern, input.projectRoot);
  const globBaseDir = getGlobBaseDir(globPattern);
  const absoluteGlobBaseDir = path.resolve(input.projectRoot, globBaseDir);
  const allMovedFiles = new Map<string, string>();
  const movedFiles: GlobMovedFile[] = [];

  for (const sourceFile of input.matchedFiles) {
    const relativePath = path.relative(absoluteGlobBaseDir, sourceFile);
    const targetFile = input.targetIsDirectory
      ? path.join(input.targetPath, relativePath)
      : input.targetPath;

    allMovedFiles.set(sourceFile, targetFile);
    movedFiles.push({ from: sourceFile, to: targetFile });
  }

  return {
    globPattern,
    globBaseDir,
    absoluteGlobBaseDir,
    movedFiles,
    batchMoveInfo: { allMovedFiles }
  };
}
