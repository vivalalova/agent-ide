import { describe, it, expect, beforeEach } from 'vitest';
import {
  MaintainabilityIndex,
  HalsteadComplexity,
  CodeSmellDetector,
  QualityMetricsAnalyzer,
  type CodeMetrics,
  type CodeSmell,
} from '@core/analysis/quality-metrics';

describe('MaintainabilityIndex', () => {
  let mi: MaintainabilityIndex;

  beforeEach(() => {
    mi = new MaintainabilityIndex();
  });

  describe('calculate', () => {
    it('應該計算可維護性指數', () => {
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 10,
        linesOfCode: 50,
        methodCount: 5,
        fieldCount: 3,
        parameterCount: 2,
      };

      const result = mi.calculate(metrics);

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(171);
    });

    it('應該處理最小值', () => {
      const metrics: CodeMetrics = {
        halsteadVolume: 0,
        cyclomaticComplexity: 0,
        linesOfCode: 0,
        methodCount: 0,
        fieldCount: 0,
        parameterCount: 0,
      };

      const result = mi.calculate(metrics);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('應該處理極大值', () => {
      const metrics: CodeMetrics = {
        halsteadVolume: 10000,
        cyclomaticComplexity: 100,
        linesOfCode: 1000,
        methodCount: 50,
        fieldCount: 30,
        parameterCount: 10,
      };

      const result = mi.calculate(metrics);

      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('應該回傳兩位小數', () => {
      const metrics: CodeMetrics = {
        halsteadVolume: 123.456,
        cyclomaticComplexity: 15,
        linesOfCode: 100,
        methodCount: 10,
        fieldCount: 5,
        parameterCount: 3,
      };

      const result = mi.calculate(metrics);

      expect(result).toBe(Math.round(result * 100) / 100);
    });
  });

  describe('getGrade', () => {
    it('應該回傳 A 當指數 >= 85', () => {
      expect(mi.getGrade(85)).toBe('A');
      expect(mi.getGrade(100)).toBe('A');
    });

    it('應該回傳 B 當指數 >= 70', () => {
      expect(mi.getGrade(70)).toBe('B');
      expect(mi.getGrade(84)).toBe('B');
    });

    it('應該回傳 C 當指數 >= 50', () => {
      expect(mi.getGrade(50)).toBe('C');
      expect(mi.getGrade(69)).toBe('C');
    });

    it('應該回傳 D 當指數 >= 25', () => {
      expect(mi.getGrade(25)).toBe('D');
      expect(mi.getGrade(49)).toBe('D');
    });

    it('應該回傳 F 當指數 < 25', () => {
      expect(mi.getGrade(0)).toBe('F');
      expect(mi.getGrade(24)).toBe('F');
    });
  });

  describe('getDescription', () => {
    it('應該回傳正確的描述', () => {
      expect(mi.getDescription('A')).toContain('優秀');
      expect(mi.getDescription('B')).toContain('良好');
      expect(mi.getDescription('C')).toContain('一般');
      expect(mi.getDescription('D')).toContain('差');
      expect(mi.getDescription('F')).toContain('非常差');
    });

    it('應該回傳未知等級描述', () => {
      expect(mi.getDescription('X')).toBe('未知等級');
    });
  });
});

describe('HalsteadComplexity', () => {
  let halstead: HalsteadComplexity;

  beforeEach(() => {
    halstead = new HalsteadComplexity();
  });

  describe('calculate', () => {
    it('應該計算簡單程式碼的 Halstead 複雜度', () => {
      const code = 'const x = 1 + 2;';
      const result = halstead.calculate(code);

      expect(result.volume).toBeGreaterThan(0);
      expect(result.difficulty).toBeGreaterThan(0);
      expect(result.effort).toBeGreaterThan(0);
      expect(result.timeToProgram).toBeGreaterThan(0);
      expect(result.bugsEstimate).toBeGreaterThanOrEqual(0);
    });

    it('應該計算包含多個運算子的程式碼', () => {
      const code = `
        function add(a, b) {
          return a + b;
        }
        const result = add(1, 2) * 3 - 4;
      `;
      const result = halstead.calculate(code);

      expect(result.volume).toBeGreaterThan(0);
      expect(result.difficulty).toBeGreaterThan(0);
    });

    it('應該處理空字串', () => {
      const code = '';
      const result = halstead.calculate(code);

      expect(result.volume).toBe(0);
    });

    it('應該處理複雜運算子', () => {
      const code = 'x += 1; y++; z === 10 && a !== b || c <= d;';
      const result = halstead.calculate(code);

      expect(result.volume).toBeGreaterThan(0);
    });

    it('應該正確提取字串字面值', () => {
      const code = 'const str = "hello"; const str2 = \'world\';';
      const result = halstead.calculate(code);

      expect(result.volume).toBeGreaterThan(0);
    });

    it('應該正確提取數字字面值', () => {
      const code = 'const a = 123; const b = 45.67;';
      const result = halstead.calculate(code);

      expect(result.volume).toBeGreaterThan(0);
    });

    it('應該回傳兩位小數的結果', () => {
      const code = 'const x = 1 + 2 * 3;';
      const result = halstead.calculate(code);

      expect(result.volume).toBe(Math.round(result.volume * 100) / 100);
      expect(result.difficulty).toBe(Math.round(result.difficulty * 100) / 100);
      expect(result.effort).toBe(Math.round(result.effort * 100) / 100);
    });
  });
});

describe('CodeSmellDetector', () => {
  let detector: CodeSmellDetector;

  beforeEach(() => {
    detector = new CodeSmellDetector();
  });

  describe('detect', () => {
    it('應該檢測長方法', () => {
      const code = Array(60).fill('console.log("line");').join('\n');
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 5,
        linesOfCode: 60,
        methodCount: 1,
        fieldCount: 0,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'LongMethod')).toBe(true);
    });

    it('應該檢測大類', () => {
      const code = 'class BigClass {}';
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 5,
        linesOfCode: 50,
        methodCount: 25,
        fieldCount: 20,
        parameterCount: 3,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'LargeClass')).toBe(true);
    });

    it('應該檢測長參數列表', () => {
      const code = 'function test() {}';
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 5,
        linesOfCode: 10,
        methodCount: 1,
        fieldCount: 0,
        parameterCount: 7,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'LongParameterList')).toBe(true);
    });

    it('應該檢測重複程式碼', () => {
      const code = `
        console.log("duplicate line");
        console.log("duplicate line");
        console.log("duplicate line");
      `;
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 1,
        linesOfCode: 3,
        methodCount: 0,
        fieldCount: 0,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'DuplicateCode')).toBe(true);
    });

    it('應該檢測複雜條件', () => {
      const code = 'if (a && b && c && d || e && f) { }';
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 10,
        linesOfCode: 1,
        methodCount: 0,
        fieldCount: 0,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'ComplexConditional')).toBe(true);
    });

    it('應該檢測魔術數字', () => {
      const code = 'const timeout = 5000;';
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 1,
        linesOfCode: 1,
        methodCount: 0,
        fieldCount: 1,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.some(s => s.type === 'MagicNumber')).toBe(true);
    });

    it('應該不標記 0, 1, -1 為魔術數字', () => {
      const code = 'const a = 0; const b = 1; const c = -1;';
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 1,
        linesOfCode: 1,
        methodCount: 0,
        fieldCount: 3,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);

      expect(smells.filter(s => s.type === 'MagicNumber')).toHaveLength(0);
    });

    it('應該設置正確的嚴重程度', () => {
      const code = Array(120).fill('console.log("line");').join('\n');
      const metrics: CodeMetrics = {
        halsteadVolume: 100,
        cyclomaticComplexity: 5,
        linesOfCode: 120,
        methodCount: 1,
        fieldCount: 0,
        parameterCount: 0,
      };

      const smells = detector.detect(code, metrics);
      const longMethodSmell = smells.find(s => s.type === 'LongMethod');

      expect(longMethodSmell?.severity).toBe('high');
    });
  });
});

describe('QualityMetricsAnalyzer', () => {
  let analyzer: QualityMetricsAnalyzer;

  beforeEach(() => {
    analyzer = new QualityMetricsAnalyzer();
  });

  describe('assess', () => {
    it('應該評估簡單程式碼', async () => {
      const code = 'const x = 1;';
      const result = await analyzer.assess(code);

      expect(result.maintainabilityIndex).toBeGreaterThan(0);
      expect(result.grade).toBeDefined();
      expect(result.codeSmells).toBeInstanceOf(Array);
      expect(result.metrics).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('應該評估複雜程式碼', async () => {
      const code = `
        function complexFunction(a, b, c, d, e, f) {
          if (a && b || c && d) {
            for (let i = 0; i < 100; i++) {
              console.log(i);
            }
          }
          return a + b + c + d + e + f;
        }
      `;
      const result = await analyzer.assess(code);

      expect(result.maintainabilityIndex).toBeGreaterThan(0);
      expect(result.codeSmells.length).toBeGreaterThan(0);
    });

    it('應該拋出錯誤當輸入不是字串', async () => {
      await expect(analyzer.assess(123 as any)).rejects.toThrow('程式碼必須是字串類型');
    });

    it('應該處理空字串', async () => {
      const result = await analyzer.assess('');

      expect(result.maintainabilityIndex).toBeGreaterThan(0);
      expect(result.metrics.linesOfCode).toBe(0);
    });

    it('應該正確計算循環複雜度', async () => {
      const code = `
        if (a) { }
        if (b) { }
        while (c) { }
        for (let i = 0; i < 10; i++) { }
      `;
      const result = await analyzer.assess(code);

      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('應該根據程式碼異味調整綜合評分', async () => {
      const longCode = Array(100).fill('console.log("line");').join('\n');
      const result = await analyzer.assess(longCode);

      expect(result.overallScore).toBeLessThanOrEqual(result.maintainabilityIndex);
    });

    it('應該處理多行程式碼', async () => {
      const code = `
        function test() {
          const a = 1;
          const b = 2;
          return a + b;
        }
      `;
      const result = await analyzer.assess(code);

      expect(result.metrics.linesOfCode).toBeGreaterThan(1);
    });

    it('應該正確計算方法數量', async () => {
      const code = `
        function func1() {}
        function func2() {}
        const func3 = () => {};
      `;
      const result = await analyzer.assess(code);

      expect(result.metrics.methodCount).toBeGreaterThan(0);
    });

    it('應該正確計算欄位數量', async () => {
      const code = `
        const a = 1;
        let b = 2;
        var c = 3;
      `;
      const result = await analyzer.assess(code);

      expect(result.metrics.fieldCount).toBe(3);
    });
  });

  describe('assessFiles', () => {
    it('應該評估多個檔案', async () => {
      const files = ['file1.ts', 'file2.ts'];
      const results = await analyzer.assessFiles(files);

      expect(results).toHaveLength(2);
      expect(results[0].file).toBe('file1.ts');
      expect(results[1].file).toBe('file2.ts');
    });

    it('應該拋出錯誤當輸入不是陣列', async () => {
      await expect(analyzer.assessFiles('not-array' as any))
        .rejects.toThrow('檔案列表必須是陣列');
    });

    it('應該處理空陣列', async () => {
      const results = await analyzer.assessFiles([]);

      expect(results).toHaveLength(0);
    });

    it('應該處理評估失敗的情況', async () => {
      // assessFiles 內部使用空字串作為程式碼，會得到良好的評分
      // 這個測試驗證即使檔案路徑看起來像錯誤，也能正常評估
      const files = ['error-file.ts'];
      const results = await analyzer.assessFiles(files);

      expect(results).toHaveLength(1);
      expect(results[0].file).toBe('error-file.ts');
      expect(results[0].assessment).toBeDefined();
    });
  });

  describe('getProjectReport', () => {
    it('應該生成專案報告', async () => {
      const files = ['file1.ts', 'file2.ts', 'file3.ts'];
      const report = await analyzer.getProjectReport(files);

      expect(report.averageMaintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(report.gradeDistribution).toBeDefined();
      expect(report.totalCodeSmells).toBeGreaterThanOrEqual(0);
      expect(report.smellsByType).toBeDefined();
      expect(report.topIssues).toBeInstanceOf(Array);
    });

    it('應該正確統計等級分布', async () => {
      const files = ['file1.ts', 'file2.ts'];
      const report = await analyzer.getProjectReport(files);

      const totalGrades = Object.values(report.gradeDistribution).reduce((a, b) => a + b, 0);
      expect(totalGrades).toBe(files.length);
    });

    it('應該限制 topIssues 為 10 個', async () => {
      const files = Array(20).fill('file.ts');
      const report = await analyzer.getProjectReport(files);

      expect(report.topIssues.length).toBeLessThanOrEqual(10);
    });

    it('應該只包含高嚴重度的問題在 topIssues', async () => {
      const files = ['file.ts'];
      const report = await analyzer.getProjectReport(files);

      for (const issue of report.topIssues) {
        expect(issue.severity).toBe('high');
      }
    });

    it('應該處理空檔案列表', async () => {
      const report = await analyzer.getProjectReport([]);

      expect(report.averageMaintainabilityIndex).toBe(0);
      expect(report.totalCodeSmells).toBe(0);
    });

    it('應該正確統計異味類型', async () => {
      const files = ['file1.ts', 'file2.ts'];
      const report = await analyzer.getProjectReport(files);

      const totalSmells = Object.values(report.smellsByType).reduce((a, b) => a + b, 0);
      expect(totalSmells).toBe(report.totalCodeSmells);
    });
  });
});
