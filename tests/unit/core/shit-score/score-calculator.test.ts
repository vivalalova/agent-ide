import { describe, it, expect, beforeEach } from 'vitest';
import { ScoreCalculator } from '@core/shit-score/score-calculator';
import type { ComplexityData, MaintainabilityData, ArchitectureData, QualityAssuranceData } from '@core/shit-score/types';

describe('ScoreCalculator', () => {
  let calculator: ScoreCalculator;

  beforeEach(() => {
    calculator = new ScoreCalculator();
  });

  describe('複雜度評分', () => {
    it('應該計算複雜度評分', () => {
      const data: ComplexityData = {
        totalFunctions: 100,
        highComplexityCount: 20,
        longFunctionCount: 15,
        deepNestingCount: 10,
        tooManyParamsCount: 5,
      };

      const score = calculator.calculateComplexityShit(data);

      expect(score.dimension).toBe('complexity');
      expect(score.weight).toBe(0.3);
      expect(score.score).toBeGreaterThan(0);
      expect(score.weightedScore).toBeCloseTo(score.score * 0.3, 1);
    });

    it('應該處理沒有函式的情況', () => {
      const data: ComplexityData = {
        totalFunctions: 0,
        highComplexityCount: 0,
        longFunctionCount: 0,
        deepNestingCount: 0,
        tooManyParamsCount: 0,
      };

      const score = calculator.calculateComplexityShit(data);

      expect(score.score).toBe(0);
      expect(score.weightedScore).toBe(0);
    });

    it('應該正確計算各項目比例', () => {
      const data: ComplexityData = {
        totalFunctions: 100,
        highComplexityCount: 40,
        longFunctionCount: 30,
        deepNestingCount: 20,
        tooManyParamsCount: 10,
      };

      const score = calculator.calculateComplexityShit(data);

      expect(score.breakdown.highComplexity).toBe(40);
      expect(score.breakdown.longFunction).toBe(30);
      expect(score.breakdown.deepNesting).toBe(20);
      expect(score.breakdown.tooManyParams).toBe(10);
    });
  });

  describe('維護性評分', () => {
    it('應該計算維護性評分', () => {
      const data: MaintainabilityData = {
        totalFiles: 100,
        deadCodeCount: 20,
        largeFileCount: 15,
        duplicateCodeCount: 10,
        patternDuplicationCount: 5,
      };

      const score = calculator.calculateMaintainabilityShit(data);

      expect(score.dimension).toBe('maintainability');
      expect(score.weight).toBe(0.3);
      expect(score.score).toBeGreaterThan(0);
      expect(score.weightedScore).toBeCloseTo(score.score * 0.3, 1);
    });

    it('應該處理沒有檔案的情況', () => {
      const data: MaintainabilityData = {
        totalFiles: 0,
        deadCodeCount: 0,
        largeFileCount: 0,
        duplicateCodeCount: 0,
        patternDuplicationCount: 0,
      };

      const score = calculator.calculateMaintainabilityShit(data);

      expect(score.score).toBe(0);
      expect(score.weightedScore).toBe(0);
    });

    it('應該限制比例上限為 100%', () => {
      const data: MaintainabilityData = {
        totalFiles: 10,
        deadCodeCount: 50, // 500%
        largeFileCount: 30, // 300%
        duplicateCodeCount: 20, // 200%
        patternDuplicationCount: 15, // 150%
      };

      const score = calculator.calculateMaintainabilityShit(data);

      // 即使比例超過 100%，最終分數也不應該超過合理範圍
      expect(score.score).toBeLessThanOrEqual(100);
    });
  });

  describe('架構評分', () => {
    it('應該計算架構評分', () => {
      const data: ArchitectureData = {
        totalFiles: 100,
        circularDependencyCount: 5,
        orphanFileCount: 10,
        highCouplingCount: 15,
      };

      const score = calculator.calculateArchitectureShit(data);

      expect(score.dimension).toBe('architecture');
      expect(score.weight).toBe(0.3);
      expect(score.score).toBeGreaterThan(0);
    });

    it('應該處理沒有檔案的情況', () => {
      const data: ArchitectureData = {
        totalFiles: 0,
        circularDependencyCount: 0,
        orphanFileCount: 0,
        highCouplingCount: 0,
      };

      const score = calculator.calculateArchitectureShit(data);

      expect(score.score).toBe(0);
    });
  });

  describe('品質保證評分', () => {
    it('應該計算品質保證評分', () => {
      const data: QualityAssuranceData = {
        totalFiles: 100,
        typeSafetyIssues: 10,
        testCoverageRatio: 0.8,
        errorHandlingIssues: 15,
        namingIssues: 8,
        securityIssues: 3,
        strictModeEnabled: true,
        strictNullChecksEnabled: true,
      };

      const score = calculator.calculateQualityAssuranceShit(data);

      expect(score.dimension).toBe('qualityAssurance');
      expect(score.weight).toBe(0.2);
      expect(score.score).toBeGreaterThan(0);
    });

    it('應該處理沒有檔案的情況', () => {
      const data: QualityAssuranceData = {
        totalFiles: 0,
        typeSafetyIssues: 0,
        testCoverageRatio: 1,
        errorHandlingIssues: 0,
        namingIssues: 0,
        securityIssues: 0,
        strictModeEnabled: true,
        strictNullChecksEnabled: true,
      };

      const score = calculator.calculateQualityAssuranceShit(data);

      expect(score.score).toBe(0);
    });
  });

  describe('總分計算', () => {
    it('應該計算總分', () => {
      const complexity: ComplexityData = {
        totalFunctions: 100,
        highComplexityCount: 20,
        longFunctionCount: 15,
        deepNestingCount: 10,
        tooManyParamsCount: 5,
      };

      const maintainability: MaintainabilityData = {
        totalFiles: 100,
        deadCodeCount: 20,
        largeFileCount: 15,
        duplicateCodeCount: 10,
        patternDuplicationCount: 5,
      };

      const architecture: ArchitectureData = {
        totalFiles: 100,
        circularDependencyCount: 5,
        orphanFileCount: 10,
        highCouplingCount: 15,
      };

      const qualityAssurance: QualityAssuranceData = {
        totalFiles: 100,
        typeSafetyIssues: 10,
        testCoverageRatio: 0.8,
        errorHandlingIssues: 15,
        namingIssues: 8,
        securityIssues: 3,
        strictModeEnabled: true,
        strictNullChecksEnabled: true,
      };

      const result = calculator.calculate(complexity, maintainability, architecture, qualityAssurance);

      expect(result.totalScore).toBeGreaterThanOrEqual(0);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.complexityScore).toBeDefined();
      expect(result.maintainabilityScore).toBeDefined();
      expect(result.architectureScore).toBeDefined();
      expect(result.qualityAssuranceScore).toBeDefined();
    });

    it('應該回傳 0 分當所有維度都是 0', () => {
      const complexity: ComplexityData = {
        totalFunctions: 0,
        highComplexityCount: 0,
        longFunctionCount: 0,
        deepNestingCount: 0,
        tooManyParamsCount: 0,
      };

      const maintainability: MaintainabilityData = {
        totalFiles: 0,
        deadCodeCount: 0,
        largeFileCount: 0,
        duplicateCodeCount: 0,
        patternDuplicationCount: 0,
      };

      const architecture: ArchitectureData = {
        totalFiles: 0,
        circularDependencyCount: 0,
        orphanFileCount: 0,
        highCouplingCount: 0,
      };

      const qualityAssurance: QualityAssuranceData = {
        totalFiles: 0,
        typeSafetyIssues: 0,
        testCoverageRatio: 1,
        errorHandlingIssues: 0,
        namingIssues: 0,
        securityIssues: 0,
        strictModeEnabled: true,
        strictNullChecksEnabled: true,
      };

      const result = calculator.calculate(complexity, maintainability, architecture, qualityAssurance);

      expect(result.totalScore).toBe(0);
    });
  });
});
