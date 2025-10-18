/**
 * ShitScore 評分計算器
 * 負責計算三大維度的垃圾度評分並計算總分
 */

import type {
  DimensionScore,
  ComplexityData,
  MaintainabilityData,
  ArchitectureData,
  QualityAssuranceData,
} from './types.js';

/**
 * 評分計算器
 */
export class ScoreCalculator {
  /**
   * 計算總分（四個維度）
   */
  calculate(complexity: ComplexityData, maintainability: MaintainabilityData, architecture: ArchitectureData, qualityAssurance: QualityAssuranceData): {
    readonly complexityScore: DimensionScore;
    readonly maintainabilityScore: DimensionScore;
    readonly architectureScore: DimensionScore;
    readonly qualityAssuranceScore: DimensionScore;
    readonly totalScore: number;
  } {
    const complexityScore = this.calculateComplexityShit(complexity);
    const maintainabilityScore = this.calculateMaintainabilityShit(maintainability);
    const architectureScore = this.calculateArchitectureShit(architecture);
    const qualityAssuranceScore = this.calculateQualityAssuranceShit(qualityAssurance);
    const totalScore = this.calculateTotalScore(complexityScore, maintainabilityScore, architectureScore, qualityAssuranceScore);

    return {
      complexityScore,
      maintainabilityScore,
      architectureScore,
      qualityAssuranceScore,
      totalScore,
    };
  }

  /**
   * 計算複雜度垃圾（30%）
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
        weight: 0.3,
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
      weight: 0.3,
      weightedScore: this.round(score * 0.3),
      breakdown: {
        highComplexity: this.round(highComplexityRatio * 100),
        longFunction: this.round(longFunctionRatio * 100),
        deepNesting: this.round(deepNestingRatio * 100),
        tooManyParams: this.round(tooManyParamsRatio * 100),
      },
    };
  }

  /**
   * 計算維護性垃圾（30%）
   * maintainabilityShit = (
   *   deadCodeRatio * 0.35 +
   *   largeFileRatio * 0.2 +
   *   duplicateCodeRatio * 0.2 +
   *   patternDuplicationRatio * 0.25
   * ) * 100
   */
  calculateMaintainabilityShit(data: MaintainabilityData): DimensionScore {
    const total = data.totalFiles;

    if (total === 0) {
      return {
        dimension: 'maintainability',
        score: 0,
        weight: 0.3,
        weightedScore: 0,
        breakdown: {
          deadCode: 0,
          largeFile: 0,
          duplicateCode: 0,
          patternDuplication: 0,
        },
      };
    }

    // 原始比例（可能超過 100%，用於 breakdown 顯示）
    const deadCodeRatio = data.deadCodeCount / total;
    const largeFileRatio = data.largeFileCount / total;
    const duplicateCodeRatio = data.duplicateCodeCount / total;
    const patternDuplicationRatio = data.patternDuplicationCount / total;

    // 限制比例上限為 100%，用於計算分數
    const deadCodeRatioCapped = Math.min(deadCodeRatio, 1);
    const largeFileRatioCapped = Math.min(largeFileRatio, 1);
    const duplicateCodeRatioCapped = Math.min(duplicateCodeRatio, 1);
    const patternDuplicationRatioCapped = Math.min(patternDuplicationRatio, 1);

    const score = this.round(
      (deadCodeRatioCapped * 0.35 +
        largeFileRatioCapped * 0.2 +
        duplicateCodeRatioCapped * 0.2 +
        patternDuplicationRatioCapped * 0.25) *
        100
    );

    return {
      dimension: 'maintainability',
      score,
      weight: 0.3,
      weightedScore: this.round(score * 0.3),
      breakdown: {
        deadCode: this.round(deadCodeRatio * 100),
        largeFile: this.round(largeFileRatio * 100),
        duplicateCode: this.round(duplicateCodeRatio * 100),
        patternDuplication: this.round(patternDuplicationRatio * 100),
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
   * 計算品質保證垃圾（20%）
   * qualityAssuranceShit = (
   *   typeSafetyScore * 0.3 +
   *   testCoverageScore * 0.25 +
   *   errorHandlingScore * 0.2 +
   *   namingScore * 0.15 +
   *   securityScore * 0.1
   * ) * 100
   */
  calculateQualityAssuranceShit(data: QualityAssuranceData): DimensionScore {
    const total = data.totalFiles;

    if (total === 0) {
      return {
        dimension: 'qualityAssurance',
        score: 0,
        weight: 0.2,
        weightedScore: 0,
        breakdown: {
          typeSafety: 0,
          testCoverage: 0,
          errorHandling: 0,
          naming: 0,
          security: 0,
        },
      };
    }

    // 1. 型別安全評分（30%）
    const typeSafetyScore = Math.min((data.typeSafetyIssues / total) * 100, 100);

    // 2. 測試覆蓋率評分（25%）- 反向評分
    const testCoverageScore = (1 - data.testCoverageRatio) * 100;

    // 3. 錯誤處理評分（20%）
    const errorHandlingScore = Math.min((data.errorHandlingIssues / total) * 100, 100);

    // 4. 命名規範評分（15%）
    const namingScore = Math.min((data.namingIssues / total) * 100, 100);

    // 5. 安全性評分（10%）
    const securityScore = Math.min((data.securityIssues / total) * 100, 100);

    const score = this.round(
      typeSafetyScore * 0.3 +
        testCoverageScore * 0.25 +
        errorHandlingScore * 0.2 +
        namingScore * 0.15 +
        securityScore * 0.1
    );

    return {
      dimension: 'qualityAssurance',
      score,
      weight: 0.2,
      weightedScore: this.round(score * 0.2),
      breakdown: {
        typeSafety: this.round(typeSafetyScore),
        testCoverage: this.round(testCoverageScore),
        errorHandling: this.round(errorHandlingScore),
        naming: this.round(namingScore),
        security: this.round(securityScore),
      },
    };
  }

  /**
   * 計算總分
   * shitScore = (
   *   complexityShit * 0.3 +
   *   maintainabilityShit * 0.3 +
   *   architectureShit * 0.3 +
   *   qualityAssuranceShit * 0.2
   * )
   */
  calculateTotalScore(complexity: DimensionScore, maintainability: DimensionScore, architecture: DimensionScore, qualityAssurance: DimensionScore): number {
    return this.round(
      complexity.weightedScore + maintainability.weightedScore + architecture.weightedScore + qualityAssurance.weightedScore
    );
  }

  /**
   * 四捨五入到小數點後 2 位
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
