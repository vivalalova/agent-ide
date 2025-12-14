/**
 * 循環依賴檢測模組統一匯出
 */

import { CycleDetector } from './cycle-detector.js';

export { CycleDetector };

export type {
  CircularDependency,
  StronglyConnectedComponent,
  CycleDetectionOptions,
  CycleDetectionResult,
  CycleStatistics,
  CycleFixSuggestion
} from './types.js';

export {
  createDefaultCycleDetectionOptions,
  calculateCycleSeverity,
  isCircularDependency
} from './types.js';

/**
 * 建立循環檢測器的便利函式
 * @returns 循環檢測器實例
 */
export function createCycleDetector(): CycleDetector {
  return new CycleDetector();
}
