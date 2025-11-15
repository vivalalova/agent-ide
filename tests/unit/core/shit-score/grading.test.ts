import { describe, it, expect, beforeEach } from 'vitest';
import { Grading, gradeTable } from '@core/shit-score/grading';
import { GradeLevel, SeverityLevel, type DimensionScore } from '@core/shit-score/types';

describe('Grading', () => {
  let grading: Grading;

  beforeEach(() => {
    grading = new Grading();
  });

  describe('評級判定', () => {
    it('應該回傳 A 級（0-29）', () => {
      const grade = grading.getGrade(15);
      expect(grade.level).toBe(GradeLevel.A);
      expect(grade.emoji).toBe('✅');
    });

    it('應該回傳 B 級（30-49）', () => {
      const grade = grading.getGrade(40);
      expect(grade.level).toBe(GradeLevel.B);
      expect(grade.emoji).toBe('⚠️');
    });

    it('應該回傳 C 級（50-69）', () => {
      const grade = grading.getGrade(60);
      expect(grade.level).toBe(GradeLevel.C);
      expect(grade.emoji).toBe('💩');
    });

    it('應該回傳 D 級（70-84）', () => {
      const grade = grading.getGrade(75);
      expect(grade.level).toBe(GradeLevel.D);
      expect(grade.emoji).toBe('💩💩');
    });

    it('應該回傳 F 級（85-100）', () => {
      const grade = grading.getGrade(90);
      expect(grade.level).toBe(GradeLevel.F);
      expect(grade.emoji).toBe('💩💩💩');
    });

    it('應該處理邊界值', () => {
      expect(grading.getGrade(0).level).toBe(GradeLevel.A);
      expect(grading.getGrade(29).level).toBe(GradeLevel.A);
      expect(grading.getGrade(30).level).toBe(GradeLevel.B);
      expect(grading.getGrade(100).level).toBe(GradeLevel.F);
    });

    it('應該拋出錯誤當分數無效', () => {
      expect(() => grading.getGrade(-1)).toThrow();
      expect(() => grading.getGrade(101)).toThrow();
    });
  });

  describe('複雜度建議', () => {
    it('應該生成高複雜度建議', () => {
      const dimension: DimensionScore = {
        dimension: 'complexity',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          highComplexity: 60,
          longFunction: 10,
          deepNesting: 10,
          tooManyParams: 10,
        },
      };

      const recommendations = grading.generateComplexityRecommendations(dimension);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].category).toBe('複雜度');
      expect(recommendations[0].priority).toBe(SeverityLevel.Critical);
    });

    it('應該生成長函式建議', () => {
      const dimension: DimensionScore = {
        dimension: 'complexity',
        score: 30,
        weight: 0.3,
        weightedScore: 9,
        breakdown: {
          highComplexity: 10,
          longFunction: 60,
          deepNesting: 10,
          tooManyParams: 10,
        },
      };

      const recommendations = grading.generateComplexityRecommendations(dimension);

      expect(recommendations.some(r => r.suggestion.includes('過長'))).toBe(true);
    });

    it('應該不生成建議當分數低於閾值', () => {
      const dimension: DimensionScore = {
        dimension: 'complexity',
        score: 10,
        weight: 0.3,
        weightedScore: 3,
        breakdown: {
          highComplexity: 10,
          longFunction: 10,
          deepNesting: 10,
          tooManyParams: 10,
        },
      };

      const recommendations = grading.generateComplexityRecommendations(dimension);

      expect(recommendations.length).toBe(0);
    });
  });

  describe('維護性建議', () => {
    it('應該生成死代碼建議', () => {
      const dimension: DimensionScore = {
        dimension: 'maintainability',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          deadCode: 60,
          largeFile: 10,
          duplicateCode: 10,
          patternDuplication: 10,
        },
      };

      const recommendations = grading.generateMaintainabilityRecommendations(dimension);

      expect(recommendations.some(r => r.suggestion.includes('死代碼'))).toBe(true);
    });

    it('應該生成模式重複建議', () => {
      const dimension: DimensionScore = {
        dimension: 'maintainability',
        score: 30,
        weight: 0.3,
        weightedScore: 9,
        breakdown: {
          deadCode: 10,
          largeFile: 10,
          duplicateCode: 10,
          patternDuplication: 60,
        },
      };

      const recommendations = grading.generateMaintainabilityRecommendations(dimension);

      expect(recommendations.some(r => r.suggestion.includes('模式重複'))).toBe(true);
    });
  });

  describe('架構建議', () => {
    it('應該生成循環依賴建議', () => {
      const dimension: DimensionScore = {
        dimension: 'architecture',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          circularDependency: 60,
          orphanFile: 10,
          highCoupling: 10,
        },
      };

      const recommendations = grading.generateArchitectureRecommendations(dimension);

      expect(recommendations.some(r => r.priority === SeverityLevel.Critical)).toBe(true);
      expect(recommendations.some(r => r.suggestion.includes('循環依賴'))).toBe(true);
    });

    it('應該生成高耦合建議', () => {
      const dimension: DimensionScore = {
        dimension: 'architecture',
        score: 30,
        weight: 0.3,
        weightedScore: 9,
        breakdown: {
          circularDependency: 10,
          orphanFile: 10,
          highCoupling: 60,
        },
      };

      const recommendations = grading.generateArchitectureRecommendations(dimension);

      expect(recommendations.some(r => r.suggestion.includes('耦合度'))).toBe(true);
    });
  });

  describe('品質保證建議', () => {
    it('應該生成型別安全建議', () => {
      const dimension: DimensionScore = {
        dimension: 'qualityAssurance',
        score: 50,
        weight: 0.2,
        weightedScore: 10,
        breakdown: {
          typeSafety: 60,
          testCoverage: 10,
          errorHandling: 10,
          naming: 10,
          security: 10,
        },
      };

      const recommendations = grading.generateQualityAssuranceRecommendations(dimension);

      expect(recommendations.some(r => r.suggestion.includes('型別安全'))).toBe(true);
    });

    it('應該生成安全性建議', () => {
      const dimension: DimensionScore = {
        dimension: 'qualityAssurance',
        score: 50,
        weight: 0.2,
        weightedScore: 10,
        breakdown: {
          typeSafety: 10,
          testCoverage: 10,
          errorHandling: 10,
          naming: 10,
          security: 60,
        },
      };

      const recommendations = grading.generateQualityAssuranceRecommendations(dimension);

      expect(recommendations.some(r => r.priority === SeverityLevel.Critical)).toBe(true);
      expect(recommendations.some(r => r.suggestion.includes('安全性'))).toBe(true);
    });
  });

  describe('綜合建議生成', () => {
    it('應該生成所有維度的建議', () => {
      const complexity: DimensionScore = {
        dimension: 'complexity',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          highComplexity: 60,
          longFunction: 60,
          deepNesting: 60,
          tooManyParams: 60,
        },
      };

      const maintainability: DimensionScore = {
        dimension: 'maintainability',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          deadCode: 60,
          largeFile: 60,
          duplicateCode: 60,
          patternDuplication: 60,
        },
      };

      const architecture: DimensionScore = {
        dimension: 'architecture',
        score: 50,
        weight: 0.3,
        weightedScore: 15,
        breakdown: {
          circularDependency: 60,
          orphanFile: 60,
          highCoupling: 60,
        },
      };

      const qualityAssurance: DimensionScore = {
        dimension: 'qualityAssurance',
        score: 50,
        weight: 0.2,
        weightedScore: 10,
        breakdown: {
          typeSafety: 60,
          testCoverage: 60,
          errorHandling: 60,
          naming: 60,
          security: 60,
        },
      };

      const recommendations = grading.generateRecommendations(
        complexity,
        maintainability,
        architecture,
        qualityAssurance
      );

      expect(recommendations.length).toBeGreaterThan(0);
      // 應該按優先級排序
      for (let i = 0; i < recommendations.length - 1; i++) {
        const priorityOrder = {
          [SeverityLevel.Critical]: 4,
          [SeverityLevel.High]: 3,
          [SeverityLevel.Medium]: 2,
          [SeverityLevel.Low]: 1,
        };
        expect(priorityOrder[recommendations[i].priority]).toBeGreaterThanOrEqual(
          priorityOrder[recommendations[i + 1].priority]
        );
      }
    });

    it('應該不生成建議當所有分數都很低', () => {
      const complexity: DimensionScore = {
        dimension: 'complexity',
        score: 10,
        weight: 0.3,
        weightedScore: 3,
        breakdown: {
          highComplexity: 10,
          longFunction: 10,
          deepNesting: 10,
          tooManyParams: 10,
        },
      };

      const maintainability: DimensionScore = {
        dimension: 'maintainability',
        score: 10,
        weight: 0.3,
        weightedScore: 3,
        breakdown: {
          deadCode: 10,
          largeFile: 10,
          duplicateCode: 10,
          patternDuplication: 10,
        },
      };

      const architecture: DimensionScore = {
        dimension: 'architecture',
        score: 10,
        weight: 0.3,
        weightedScore: 3,
        breakdown: {
          circularDependency: 10,
          orphanFile: 10,
          highCoupling: 10,
        },
      };

      const qualityAssurance: DimensionScore = {
        dimension: 'qualityAssurance',
        score: 10,
        weight: 0.2,
        weightedScore: 2,
        breakdown: {
          typeSafety: 10,
          testCoverage: 10,
          errorHandling: 10,
          naming: 10,
          security: 10,
        },
      };

      const recommendations = grading.generateRecommendations(
        complexity,
        maintainability,
        architecture,
        qualityAssurance
      );

      expect(recommendations.length).toBe(0);
    });
  });

  describe('評級表', () => {
    it('應該包含所有評級', () => {
      expect(gradeTable).toHaveLength(5);
      expect(gradeTable.map(g => g.level)).toEqual([
        GradeLevel.A,
        GradeLevel.B,
        GradeLevel.C,
        GradeLevel.D,
        GradeLevel.F,
      ]);
    });

    it('評級範圍應該連續且不重疊', () => {
      for (let i = 0; i < gradeTable.length - 1; i++) {
        expect(gradeTable[i].maxScore + 1).toBe(gradeTable[i + 1].minScore);
      }
    });
  });
});
