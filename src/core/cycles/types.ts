/**
 * 循環依賴檢測相關型別定義
 */

/**
 * 循環依賴資訊
 */
export interface CircularDependency {
  readonly cycle: readonly string[];
  readonly length: number;
  readonly severity: 'low' | 'medium' | 'high';
}

/**
 * 強連通分量
 */
export interface StronglyConnectedComponent {
  readonly nodes: readonly string[];
  readonly size: number;
  readonly cycleComplexity: number;
}

/**
 * 循環檢測選項
 */
export interface CycleDetectionOptions {
  readonly maxCycleLength: number;
  readonly reportAllCycles: boolean;
  readonly ignoreSelfLoops: boolean;
}

/**
 * 循環檢測結果
 */
export interface CycleDetectionResult {
  readonly cycles: readonly CircularDependency[];
  readonly stronglyConnectedComponents: readonly StronglyConnectedComponent[];
  readonly hasCycles: boolean;
  readonly statistics: CycleStatistics;
}

/**
 * 循環統計資訊
 */
export interface CycleStatistics {
  readonly totalCycles: number;
  readonly averageCycleLength: number;
  readonly maxCycleLength: number;
  readonly cyclesBySeverity: Record<string, number>;
}

/**
 * 循環修復建議
 */
export interface CycleFixSuggestion {
  readonly cycle: readonly string[];
  readonly strategy: string;
  readonly description: string;
  readonly priority: 'high' | 'medium' | 'low';
}

/**
 * 建立預設循環檢測選項
 */
export function createDefaultCycleDetectionOptions(): CycleDetectionOptions {
  return {
    maxCycleLength: 20,
    reportAllCycles: false,
    ignoreSelfLoops: true
  };
}

/**
 * 計算循環依賴嚴重程度
 */
export function calculateCycleSeverity(cycleLength: number): 'low' | 'medium' | 'high' {
  if (cycleLength <= 3) {
    return 'low';
  }
  if (cycleLength <= 6) {
    return 'medium';
  }
  return 'high';
}

/**
 * CircularDependency 型別守衛
 */
export function isCircularDependency(value: unknown): value is CircularDependency {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validSeverities = ['low', 'medium', 'high'];

  return (
    Array.isArray(obj.cycle) &&
    obj.cycle.length >= 1 &&
    obj.cycle.every((item: unknown) => typeof item === 'string') &&
    typeof obj.length === 'number' &&
    obj.length >= 1 &&
    validSeverities.includes(obj.severity as string)
  );
}
