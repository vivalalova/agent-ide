/**
 * 影響分析模組統一匯出
 */

import { ImpactAnalyzer } from './impact-analyzer.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { ExtendedDependencyAnalysisOptions } from './types.js';

export { ImpactAnalyzer };

export type {
  FileDependencies,
  ProjectDependencies,
  DependencyStats,
  ImpactAnalysisResult,
  DependencyAnalysisOptions,
  DependencyQueryOptions,
  PathResolutionResult,
  ExtendedDependencyAnalysisOptions
} from './types.js';

export {
  createDefaultAnalysisOptions,
  createDefaultQueryOptions,
  isFileDependencies,
  isProjectDependencies
} from './types.js';

/**
 * 建立影響分析器的便利函式
 * @param fileSystem 檔案系統
 * @param options 分析選項
 * @returns 配置好的影響分析器實例
 */
export function createImpactAnalyzer(
  fileSystem: IFileSystem,
  options?: Partial<ExtendedDependencyAnalysisOptions>
): ImpactAnalyzer {
  return new ImpactAnalyzer(fileSystem, options);
}
