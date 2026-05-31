/**
 * 影響分析相關型別定義
 */

import { Dependency, SOURCE_FILE_EXTENSIONS } from '@shared/types/index.js';

/**
 * 檔案依賴資訊
 */
export interface FileDependencies {
  readonly filePath: string;
  readonly dependencies: readonly Dependency[];
  readonly lastModified: Date;
}

/**
 * 專案依賴資訊
 */
export interface ProjectDependencies {
  readonly projectPath: string;
  readonly fileDependencies: readonly FileDependencies[];
  readonly analyzedAt: Date;
}

/**
 * 依賴統計資訊
 */
export interface DependencyStats {
  readonly totalFiles: number;
  readonly totalDependencies: number;
  readonly averageDependenciesPerFile: number;
  readonly maxDependenciesInFile: number;
  readonly circularDependencies: number;
  readonly orphanedFiles: number;
}

/**
 * 影響分析結果
 */
export interface ImpactAnalysisResult {
  readonly targetFile: string;
  readonly directlyAffected: readonly string[];
  readonly transitivelyAffected: readonly string[];
  readonly affectedTests: readonly string[];
  readonly impactScore: number;
}

/**
 * 依賴分析選項
 */
export interface DependencyAnalysisOptions {
  readonly includeNodeModules: boolean;
  readonly followSymlinks: boolean;
  readonly maxDepth: number;
  readonly excludePatterns: readonly string[];
  readonly includePatterns: readonly string[];
}

/**
 * 依賴查詢選項
 */
export interface DependencyQueryOptions {
  readonly includeTransitive: boolean;
  readonly maxDepth: number;
  readonly direction: 'dependencies' | 'dependents' | 'both';
}

/**
 * 路徑解析結果
 */
export interface PathResolutionResult {
  readonly resolvedPath: string;
  readonly isRelative: boolean;
  readonly exists: boolean;
  readonly extension: string;
}

/**
 * 擴展的依賴分析選項（包含 concurrency）
 */
export interface ExtendedDependencyAnalysisOptions extends DependencyAnalysisOptions {
  readonly concurrency?: number;
  /** 是否輸出詳細警告資訊（預設 true） */
  readonly verbose?: boolean;
  /** TypeScript 路徑別名映射（鍵為別名前綴，值為絕對路徑） */
  readonly pathAliases?: Record<string, string>;
  /** runtime 已註冊 Parser 支援的原始碼副檔名 */
  readonly sourceFileExtensions?: readonly string[];
}

/**
 * 建立預設依賴分析選項
 */
export function createDefaultAnalysisOptions(
  sourceFileExtensions: readonly string[] = SOURCE_FILE_EXTENSIONS
): DependencyAnalysisOptions {
  return {
    includeNodeModules: false,
    followSymlinks: true,
    maxDepth: 100,
    excludePatterns: ['node_modules', '.git', 'dist', 'build'],
    includePatterns: sourceFileExtensions.map(extension => `**/*${extension}`)
  };
}

/**
 * 建立預設查詢選項
 */
export function createDefaultQueryOptions(): DependencyQueryOptions {
  return {
    includeTransitive: false,
    maxDepth: 10,
    direction: 'dependencies'
  };
}

/**
 * FileDependencies 型別守衛
 */
export function isFileDependencies(value: unknown): value is FileDependencies {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.filePath === 'string' &&
    obj.filePath.trim().length > 0 &&
    Array.isArray(obj.dependencies) &&
    obj.lastModified instanceof Date
  );
}

/**
 * ProjectDependencies 型別守衛
 */
export function isProjectDependencies(value: unknown): value is ProjectDependencies {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.projectPath === 'string' &&
    obj.projectPath.trim().length > 0 &&
    Array.isArray(obj.fileDependencies) &&
    obj.fileDependencies.every(isFileDependencies) &&
    obj.analyzedAt instanceof Date
  );
}
