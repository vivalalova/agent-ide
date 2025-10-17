/**
 * ShitScore 評級系統
 * 負責評級判定和改進建議生成
 */

import type {
  GradeLevel,
  GradeInfo,
  Recommendation,
  SeverityLevel,
  DimensionScore,
} from './types.js';
import { GradeLevel as GradeLevelEnum, SeverityLevel as SeverityLevelEnum } from './types.js';

/**
 * 評級表
 */
export const gradeTable: readonly GradeInfo[] = [
  {
    level: GradeLevelEnum.A,
    emoji: '✅',
    message: '程式碼品質優秀，保持下去',
    minScore: 0,
    maxScore: 29,
  },
  {
    level: GradeLevelEnum.B,
    emoji: '⚠️',
    message: '程式碼品質良好，有少量改進空間',
    minScore: 30,
    maxScore: 49,
  },
  {
    level: GradeLevelEnum.C,
    emoji: '💩',
    message: '程式碼品質普通，需要重構',
    minScore: 50,
    maxScore: 69,
  },
  {
    level: GradeLevelEnum.D,
    emoji: '💩💩',
    message: '程式碼品質差勁，強烈建議重構',
    minScore: 70,
    maxScore: 84,
  },
  {
    level: GradeLevelEnum.F,
    emoji: '💩💩💩',
    message: '程式碼品質極差，建議整個重寫',
    minScore: 85,
    maxScore: 100,
  },
];

/**
 * 評級系統
 */
export class Grading {
  /**
   * 取得評級
   */
  getGrade(score: number): GradeInfo {
    for (const grade of gradeTable) {
      if (score >= grade.minScore && score <= grade.maxScore) {
        return grade;
      }
    }

    throw new Error(`Invalid score: ${score}. Score must be between 0 and 100.`);
  }

  /**
   * 生成改進建議
   */
  generateRecommendations(complexity: DimensionScore, maintainability: DimensionScore, architecture: DimensionScore): readonly Recommendation[] {
    const recommendations: Recommendation[] = [];

    recommendations.push(...this.generateComplexityRecommendations(complexity));
    recommendations.push(...this.generateMaintainabilityRecommendations(maintainability));
    recommendations.push(...this.generateArchitectureRecommendations(architecture));

    return recommendations.sort((a, b) => {
      const priorityOrder = {
        [SeverityLevelEnum.Critical]: 4,
        [SeverityLevelEnum.High]: 3,
        [SeverityLevelEnum.Medium]: 2,
        [SeverityLevelEnum.Low]: 1,
      };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * 生成複雜度建議
   */
  generateComplexityRecommendations(dimension: DimensionScore): readonly Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (dimension.breakdown.highComplexity > 30) {
      recommendations.push({
        priority: dimension.breakdown.highComplexity > 50 ? SeverityLevelEnum.Critical : SeverityLevelEnum.High,
        category: '複雜度',
        suggestion: `有 ${dimension.breakdown.highComplexity.toFixed(0)}% 的函式複雜度過高（>10）。建議重構複雜函式，拆分成小函式。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.highComplexity * 0.4 * 0.35),
      });
    }

    if (dimension.breakdown.longFunction > 30) {
      recommendations.push({
        priority: dimension.breakdown.longFunction > 50 ? SeverityLevelEnum.High : SeverityLevelEnum.Medium,
        category: '複雜度',
        suggestion: `有 ${dimension.breakdown.longFunction.toFixed(0)}% 的函式過長（>100 行）。建議拆分長函式，提高可讀性。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.longFunction * 0.25 * 0.35),
      });
    }

    if (dimension.breakdown.deepNesting > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Medium,
        category: '複雜度',
        suggestion: `有 ${dimension.breakdown.deepNesting.toFixed(0)}% 的函式巢狀過深（>4 層）。建議使用 early return 減少巢狀層級。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.deepNesting * 0.2 * 0.35),
      });
    }

    if (dimension.breakdown.tooManyParams > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Low,
        category: '複雜度',
        suggestion: `有 ${dimension.breakdown.tooManyParams.toFixed(0)}% 的函式參數過多（>5 個）。建議使用物件參數或重構函式。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.tooManyParams * 0.15 * 0.35),
      });
    }

    return recommendations;
  }

  /**
   * 生成維護性建議
   */
  generateMaintainabilityRecommendations(dimension: DimensionScore): readonly Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (dimension.breakdown.deadCode > 30) {
      recommendations.push({
        priority: dimension.breakdown.deadCode > 50 ? SeverityLevelEnum.High : SeverityLevelEnum.Medium,
        category: '維護性',
        suggestion: `有 ${dimension.breakdown.deadCode.toFixed(0)}% 的檔案包含死代碼（未使用的變數/函式）。建議刪除所有死代碼。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.deadCode * 0.5 * 0.35),
      });
    }

    if (dimension.breakdown.largeFile > 30) {
      recommendations.push({
        priority: dimension.breakdown.largeFile > 50 ? SeverityLevelEnum.High : SeverityLevelEnum.Medium,
        category: '維護性',
        suggestion: `有 ${dimension.breakdown.largeFile.toFixed(0)}% 的檔案過大（>500 行）。建議拆分大檔案，提高模組化程度。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.largeFile * 0.3 * 0.35),
      });
    }

    if (dimension.breakdown.duplicateCode > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Medium,
        category: '維護性',
        suggestion: `有 ${dimension.breakdown.duplicateCode.toFixed(0)}% 的檔案包含重複代碼。建議提取共用邏輯到共用模組。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.duplicateCode * 0.2 * 0.35),
      });
    }

    return recommendations;
  }

  /**
   * 生成架構建議
   */
  generateArchitectureRecommendations(dimension: DimensionScore): readonly Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (dimension.breakdown.circularDependency > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Critical,
        category: '架構',
        suggestion: `檢測到循環依賴（評分 ${dimension.breakdown.circularDependency.toFixed(0)}）。循環依賴會導致模組耦合度高，建議立即重構。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.circularDependency * 0.6 * 0.3),
      });
    }

    if (dimension.breakdown.orphanFile > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Low,
        category: '架構',
        suggestion: `有 ${dimension.breakdown.orphanFile.toFixed(0)}% 的檔案是孤立檔案（無依賴也無被依賴）。檢查是否為遺留代碼。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.orphanFile * 0.25 * 0.3),
      });
    }

    if (dimension.breakdown.highCoupling > 30) {
      recommendations.push({
        priority: SeverityLevelEnum.Medium,
        category: '架構',
        suggestion: `有 ${dimension.breakdown.highCoupling.toFixed(0)}% 的檔案耦合度過高（>10 個依賴）。建議降低模組間的耦合度。`,
        affectedFiles: [],
        estimatedImpact: Math.round(dimension.breakdown.highCoupling * 0.15 * 0.3),
      });
    }

    return recommendations;
  }
}
