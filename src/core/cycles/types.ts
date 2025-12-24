/**
 * 循環依賴檢測相關型別定義
 */

/**
 * 循環依賴嚴重程度
 */
export enum CycleSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

/**
 * 循環修復優先級
 */
export enum CyclePriority {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

/**
 * 循環依賴資訊
 */
export interface CircularDependency {
  readonly cycle: readonly string[];
  readonly length: number;
  readonly severity: CycleSeverity;
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
  readonly cyclesBySeverity: Record<CycleSeverity, number>;
}

/**
 * 循環修復建議
 */
export interface CycleFixSuggestion {
  readonly cycle: readonly string[];
  readonly strategy: string;
  readonly description: string;
  readonly priority: CyclePriority;
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
export function calculateCycleSeverity(cycleLength: number): CycleSeverity {
  if (cycleLength <= 3) {
    return CycleSeverity.LOW;
  }
  if (cycleLength <= 6) {
    return CycleSeverity.MEDIUM;
  }
  return CycleSeverity.HIGH;
}

/**
 * CircularDependency 型別守衛
 */
export function isCircularDependency(value: unknown): value is CircularDependency {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validSeverities = Object.values(CycleSeverity) as string[];

  return (
    Array.isArray(obj.cycle) &&
    obj.cycle.length >= 1 &&
    obj.cycle.every((item: unknown) => typeof item === 'string') &&
    typeof obj.length === 'number' &&
    obj.length >= 1 &&
    validSeverities.includes(obj.severity as string)
  );
}
