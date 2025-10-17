/**
 * ShitScore 模組統一匯出
 */

export { ShitScoreAnalyzer, ShitScoreError } from './shit-score-analyzer.js';
export { ScoreCalculator } from './score-calculator.js';
export { Grading, gradeTable } from './grading.js';

export type {
  ShitScoreResult,
  ShitScoreOptions,
  GradeInfo,
  GradeLevel,
  SeverityLevel,
  ShitType,
  DimensionScore,
  ShitItem,
  ShitStats,
  Recommendation,
  ComplexityData,
  MaintainabilityData,
  ArchitectureData,
} from './types.js';

export {
  GradeLevel as GradeLevelEnum,
  SeverityLevel as SeverityLevelEnum,
  ShitType as ShitTypeEnum,
  createDefaultShitScoreOptions,
  isShitScoreResult,
} from './types.js';
