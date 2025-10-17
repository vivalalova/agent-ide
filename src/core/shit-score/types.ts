/**
 * ShitScore 模組型別定義
 */

/**
 * 評級等級
 */
export enum GradeLevel {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  F = 'F',
}

/**
 * 嚴重程度等級
 */
export enum SeverityLevel {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical',
}

/**
 * 垃圾類型
 */
export enum ShitType {
  HighComplexity = 'high_complexity',
  LongFunction = 'long_function',
  DeepNesting = 'deep_nesting',
  TooManyParams = 'too_many_params',
  DeadCode = 'dead_code',
  LargeFile = 'large_file',
  DuplicateCode = 'duplicate_code',
  CircularDependency = 'circular_dependency',
  OrphanFile = 'orphan_file',
  HighCoupling = 'high_coupling',
}

/**
 * 評級資訊
 */
export interface GradeInfo {
  readonly level: GradeLevel;
  readonly emoji: string;
  readonly message: string;
  readonly minScore: number;
  readonly maxScore: number;
}

/**
 * 維度評分
 */
export interface DimensionScore {
  readonly dimension: string;
  readonly score: number;
  readonly weight: number;
  readonly weightedScore: number;
  readonly breakdown: Record<string, number>;
}

/**
 * 垃圾項目
 */
export interface ShitItem {
  readonly filePath: string;
  readonly type: ShitType;
  readonly severity: SeverityLevel;
  readonly score: number;
  readonly description: string;
  readonly location?: {
    readonly line: number;
    readonly column: number;
  };
}

/**
 * 垃圾統計
 */
export interface ShitStats {
  readonly totalShit: number;
  readonly byType: Record<string, number>;
  readonly bySeverity: Record<string, number>;
  readonly topFiles: readonly string[];
}

/**
 * 改進建議
 */
export interface Recommendation {
  readonly priority: SeverityLevel;
  readonly category: string;
  readonly suggestion: string;
  readonly affectedFiles: readonly string[];
  readonly estimatedImpact: number;
}

/**
 * ShitScore 分析結果
 */
export interface ShitScoreResult {
  readonly shitScore: number;
  readonly grade: GradeLevel;
  readonly gradeInfo: GradeInfo;
  readonly dimensions: {
    readonly complexity: DimensionScore;
    readonly maintainability: DimensionScore;
    readonly architecture: DimensionScore;
  };
  readonly summary: {
    readonly totalFiles: number;
    readonly analyzedFiles: number;
    readonly totalShit: number;
  };
  readonly topShit?: readonly ShitItem[];
  readonly recommendations?: readonly Recommendation[];
  readonly analyzedAt: Date;
}

/**
 * ShitScore 分析選項
 */
export interface ShitScoreOptions {
  readonly detailed: boolean;
  readonly topCount: number;
  readonly maxAllowed?: number;
  readonly excludePatterns?: readonly string[];
  readonly includePatterns?: readonly string[];
}

/**
 * 複雜度資料
 */
export interface ComplexityData {
  readonly totalFunctions: number;
  readonly highComplexityCount: number;
  readonly longFunctionCount: number;
  readonly deepNestingCount: number;
  readonly tooManyParamsCount: number;
}

/**
 * 維護性資料
 */
export interface MaintainabilityData {
  readonly totalFiles: number;
  readonly deadCodeCount: number;
  readonly largeFileCount: number;
  readonly duplicateCodeCount: number;
}

/**
 * 架構資料
 */
export interface ArchitectureData {
  readonly totalFiles: number;
  readonly circularDependencyCount: number;
  readonly orphanFileCount: number;
  readonly highCouplingCount: number;
}

/**
 * 建立預設分析選項
 */
export function createDefaultShitScoreOptions(): ShitScoreOptions {
  return {
    detailed: false,
    topCount: 10,
    excludePatterns: ['node_modules', '.git', 'dist', 'build', 'coverage'],
    includePatterns: ['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'],
  };
}

/**
 * ShitScoreResult 型別守衛
 */
export function isShitScoreResult(value: unknown): value is ShitScoreResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.shitScore === 'number' &&
    obj.shitScore >= 0 &&
    obj.shitScore <= 100 &&
    Object.values(GradeLevel).includes(obj.grade as GradeLevel) &&
    obj.analyzedAt instanceof Date
  );
}
