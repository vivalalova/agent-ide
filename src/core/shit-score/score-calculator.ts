/**
 * ShitScore 評分計算器
 * 負責計算三大維度的垃圾度評分並計算總分
 */

import type {
  DimensionScore,
  ComplexityData,
  MaintainabilityData,
  ArchitectureData,
} from './types.js';

/**
 * 評分計算器
 */
export class ScoreCalculator {
  /**
   * 計算總分
   */
  calculate(complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData): {
    readonly complexityScore: DimensionScore;
    readonly maintainabilityScore: DimensionScore;
    readonly architectureScore: DimensionScore;
    readonly totalScore: number;
  } {
    const complexityScore = this.calculateComplexityShit(complexity);
    const maintainabilityScore = this.calculateMaintainabilityShit(maintainability);
    const architectureScore = this.calculateArchitectureShit(architecture);
    const totalScore = this.calculateTotalScore(complexityScore, maintainabilityScore, architectureScore);

    return {
      complexityScore,
      maintainabilityScore,
      architectureScore,
      totalScore,
    };
  }

  /**
   * 計算複雜度垃圾（35%）
   * complexityShit = (
   *   highComplexityRatio * 0.4 +
   *   longFunctionRatio * 0.25 +
   *   deepNestingRatio * 0.2 +
   *   tooManyParamsRatio * 0.15
   * ) * 100
   */
  calculateComplexityShit(data: ComplexityData): DimensionScore {
    const total = data.totalFunctions;

    if (total === 0) {
      return {
        dimension: 'complexity',
        score: 0,
        weight: 0.35,
        weightedScore: 0,
        breakdown: {
          highComplexity: 0,
          longFunction: 0,
          deepNesting: 0,
          tooManyParams: 0,
        },
      };
    }

    const highComplexityRatio = data.highComplexityCount / total;
    const longFunctionRatio = data.longFunctionCount / total;
    const deepNestingRatio = data.deepNestingCount / total;
    const tooManyParamsRatio = data.tooManyParamsCount / total;

    const score = this.round(
      (highComplexityRatio * 0.4 +
        longFunctionRatio * 0.25 +
        deepNestingRatio * 0.2 +
        tooManyParamsRatio * 0.15) *
        100
    );

    return {
      dimension: 'complexity',
      score,
      weight: 0.35,
      weightedScore: this.round(score * 0.35),
      breakdown: {
        highComplexity: this.round(highComplexityRatio * 100),
        longFunction: this.round(longFunctionRatio * 100),
        deepNesting: this.round(deepNestingRatio * 100),
        tooManyParams: this.round(tooManyParamsRatio * 100),
      },
    };
  }

  /**
   * 計算維護性垃圾（35%）
   * maintainabilityShit = (
   *   deadCodeRatio * 0.5 +
   *   largeFileRatio * 0.3 +
   *   duplicateCodeRatio * 0.2
   * ) * 100
   */
  calculateMaintainabilityShit(data: MaintainabilityData): DimensionScore {
    const total = data.totalFiles;

    if (total === 0) {
      return {
        dimension: 'maintainability',
        score: 0,
        weight: 0.35,
        weightedScore: 0,
        breakdown: {
          deadCode: 0,
          largeFile: 0,
          duplicateCode: 0,
        },
      };
    }

    const deadCodeRatio = data.deadCodeCount / total;
    const largeFileRatio = data.largeFileCount / total;
    const duplicateCodeRatio = data.duplicateCodeCount / total;

    const score = this.round(
      (deadCodeRatio * 0.5 + largeFileRatio * 0.3 + duplicateCodeRatio * 0.2) * 100
    );

    return {
      dimension: 'maintainability',
      score,
      weight: 0.35,
      weightedScore: this.round(score * 0.35),
      breakdown: {
        deadCode: this.round(deadCodeRatio * 100),
        largeFile: this.round(largeFileRatio * 100),
        duplicateCode: this.round(duplicateCodeRatio * 100),
      },
    };
  }

  /**
   * 計算架構垃圾（30%）
   * architectureShit = (
   *   min(cyclicDependencies * 10, 100) * 0.6 +
   *   orphanFileRatio * 0.25 +
   *   highCouplingRatio * 0.15
   * )
   */
  calculateArchitectureShit(data: ArchitectureData): DimensionScore {
    const total = data.totalFiles;

    if (total === 0) {
      return {
        dimension: 'architecture',
        score: 0,
        weight: 0.3,
        weightedScore: 0,
        breakdown: {
          circularDependency: 0,
          orphanFile: 0,
          highCoupling: 0,
        },
      };
    }

    const cyclicScore = Math.min(data.circularDependencyCount * 10, 100);
    const orphanFileRatio = data.orphanFileCount / total;
    const highCouplingRatio = data.highCouplingCount / total;

    const score = this.round(
      cyclicScore * 0.6 + orphanFileRatio * 0.25 * 100 + highCouplingRatio * 0.15 * 100
    );

    return {
      dimension: 'architecture',
      score,
      weight: 0.3,
      weightedScore: this.round(score * 0.3),
      breakdown: {
        circularDependency: cyclicScore,
        orphanFile: this.round(orphanFileRatio * 100),
        highCoupling: this.round(highCouplingRatio * 100),
      },
    };
  }

  /**
   * 計算總分
   * shitScore = (
   *   complexityShit * 0.35 +
   *   maintainabilityShit * 0.35 +
   *   architectureShit * 0.3
   * )
   */
  calculateTotalScore(complexity: DimensionScore, maintainability: DimensionScore, architecture: DimensionScore): number {
    return this.round(
      complexity.weightedScore + maintainability.weightedScore + architecture.weightedScore
    );
  }

  /**
   * 四捨五入到小數點後 2 位
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
