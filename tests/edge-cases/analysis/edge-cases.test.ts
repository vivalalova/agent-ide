/**
 * Analysis 模組邊界條件和異常處理參數化測試
 * 測試各種邊界條件、異常輸入和錯誤處理情況
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { withMemoryOptimization } from '../../test-utils/cleanup';

// 模擬分析器類別
class ComplexityAnalyzer {
  analyzeCode(code: string): Promise<{ cyclomaticComplexity: number; cognitiveComplexity: number }> {
    return new Promise((resolve, reject) => {
      // 輸入驗證
      if (typeof code !== 'string') {
        reject(new Error('程式碼必須是字串類型'));
        return;
      }

      if (code.length === 0) {
        resolve({ cyclomaticComplexity: 1, cognitiveComplexity: 0 });
        return;
      }

      if (code.length > 1000000) {
        reject(new Error('程式碼過長，無法分析'));
        return;
      }

      // 模擬分析邏輯
      const lines = code.split('\n');
      const complexity = Math.max(1, Math.floor(lines.length / 10));
      resolve({ cyclomaticComplexity: complexity, cognitiveComplexity: complexity });
    });
  }
}

class QualityMetrics {
  calculateMetrics(code: string): Promise<{ maintainability: number; readability: number }> {
    return new Promise((resolve, reject) => {
      if (typeof code !== 'string') {
        reject(new Error('程式碼必須是字串類型'));
        return;
      }

      if (code.trim().length === 0) {
        resolve({ maintainability: 100, readability: 100 });
        return;
      }

      // 模擬品質計算
      const score = Math.max(10, 100 - code.length / 100);
      resolve({ maintainability: score, readability: score });
    });
  }
}

class DuplicationDetector {
  findDuplicates(files: string[]): Promise<Array<{ files: string[]; similarity: number }>> {
    return new Promise((resolve, reject) => {
      if (!Array.isArray(files)) {
        reject(new Error('檔案列表必須是陣列'));
        return;
      }

      if (files.length === 0) {
        resolve([]);
        return;
      }

      // 檢查檔案路徑有效性
      const invalidFiles = files.filter(f => !f || typeof f !== 'string');
      if (invalidFiles.length > 0) {
        reject(new Error(`無效的檔案路徑: ${invalidFiles.join(', ')}`));
        return;
      }

      // 模擬重複檢測
      resolve([]);
    });
  }
}

describe('Analysis 模組邊界條件測試', () => {
  let analyzer: ComplexityAnalyzer;
  let qualityMetrics: QualityMetrics;
  let duplicationDetector: DuplicationDetector;

  beforeEach(() => {
    analyzer = new ComplexityAnalyzer();
    qualityMetrics = new QualityMetrics();
    duplicationDetector = new DuplicationDetector();
  });

  describe('ComplexityAnalyzer 邊界條件測試', () => {
    it.each([
      // [描述, 輸入, 期望結果類型, 是否應該拋出錯誤]
      ['空字串輸入', '', 'success', false],
      ['單行程式碼', 'console.log("test");', 'success', false],
      ['極短程式碼', 'a', 'success', false],
      ['僅空白字符', '   \n\t  \n', 'success', false],
      ['單個字符', '{', 'success', false],
    ])('應該處理邊界輸入：%s', withMemoryOptimization(async (description, input, expectedType, shouldThrow) => {
      if (shouldThrow) {
        await expect(analyzer.analyzeCode(input as string)).rejects.toThrow();
      } else {
        const result = await analyzer.analyzeCode(input as string);
        expect(result).toHaveProperty('cyclomaticComplexity');
        expect(result).toHaveProperty('cognitiveComplexity');
        expect(typeof result.cyclomaticComplexity).toBe('number');
        expect(typeof result.cognitiveComplexity).toBe('number');
        expect(result.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
        expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);
      }
    }, { testName: `complexity-boundary-${description}` }));

    it.each([
      // 異常輸入測試
      ['null 輸入', null, 'error'],
      ['undefined 輸入', undefined, 'error'],
      ['數字輸入', 123, 'error'],
      ['物件輸入', { code: 'test' }, 'error'],
      ['陣列輸入', ['test'], 'error'],
      ['布林輸入', true, 'error'],
      ['函式輸入', () => 'test', 'error'],
    ])('應該拒絕無效輸入：%s', withMemoryOptimization(async (description, input, expectedType) => {
      await expect(analyzer.analyzeCode(input as any)).rejects.toThrow('程式碼必須是字串類型');
    }, { testName: `complexity-invalid-${description}` }));

    it.each([
      [10, '基本程式碼'],
      [100, '中型程式碼'],
      [1000, '大型程式碼'],
      [10000, '極大型程式碼'],
    ])('應該處理不同大小的程式碼：%d 行', withMemoryOptimization(async (lineCount, description) => {
      const largeCode = 'function test() {\n  console.log("test");\n}\n'.repeat(lineCount);

      const result = await analyzer.analyzeCode(largeCode);

      expect(result.cyclomaticComplexity).toBeGreaterThan(0);
      expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);

      // 複雜度應該與程式碼大小相關
      if (lineCount > 100) {
        expect(result.cyclomaticComplexity).toBeGreaterThan(10);
      }
    }, { testName: `complexity-size-${description}` }));

    it('應該拒絕過大的程式碼', withMemoryOptimization(async () => {
      const hugecode = 'x'.repeat(1000001); // 超過 1MB

      await expect(analyzer.analyzeCode(hugecode)).rejects.toThrow('程式碼過長，無法分析');
    }, { testName: 'complexity-oversized-rejection' }));
  });

  describe('QualityMetrics 邊界條件測試', () => {
    it.each([
      ['空字串', '', true, { maintainability: 100, readability: 100 }],
      ['僅空白', '   \t\n  ', true, { maintainability: 100, readability: 100 }],
      ['單字符', 'a', true, null],
      ['極短程式碼', 'let x = 1;', true, null],
    ])('應該處理特殊輸入：%s', withMemoryOptimization(async (description, input, shouldSucceed, expectedResult) => {
      if (shouldSucceed) {
        const result = await qualityMetrics.calculateMetrics(input);

        expect(result).toHaveProperty('maintainability');
        expect(result).toHaveProperty('readability');
        expect(typeof result.maintainability).toBe('number');
        expect(typeof result.readability).toBe('number');
        expect(result.maintainability).toBeGreaterThanOrEqual(0);
        expect(result.maintainability).toBeLessThanOrEqual(100);
        expect(result.readability).toBeGreaterThanOrEqual(0);
        expect(result.readability).toBeLessThanOrEqual(100);

        if (expectedResult) {
          expect(result.maintainability).toBe(expectedResult.maintainability);
          expect(result.readability).toBe(expectedResult.readability);
        }
      } else {
        await expect(qualityMetrics.calculateMetrics(input)).rejects.toThrow();
      }
    }, { testName: `quality-boundary-${description}` }));

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['數字', 42],
      ['物件', { test: 'value' }],
      ['陣列', ['a', 'b']],
      ['函式', () => 'test'],
    ])('應該拒絕無效類型：%s', withMemoryOptimization(async (description, input) => {
      await expect(qualityMetrics.calculateMetrics(input as any)).rejects.toThrow('程式碼必須是字串類型');
    }, { testName: `quality-invalid-${description}` }));
  });

  describe('DuplicationDetector 邊界條件測試', () => {
    it.each([
      ['空陣列', [], true, []],
      ['單一檔案', ['/path/to/file.ts'], true, []],
      ['兩個檔案', ['/path/file1.ts', '/path/file2.ts'], true, []],
      ['多個相同檔案', ['/same.ts', '/same.ts', '/same.ts'], true, []],
    ])('應該處理不同檔案列表：%s', withMemoryOptimization(async (description, files, shouldSucceed, expectedResult) => {
      if (shouldSucceed) {
        const result = await duplicationDetector.findDuplicates(files);
        expect(Array.isArray(result)).toBe(true);

        if (expectedResult !== null) {
          expect(result).toEqual(expectedResult);
        }
      } else {
        await expect(duplicationDetector.findDuplicates(files as any)).rejects.toThrow();
      }
    }, { testName: `duplication-boundary-${description}` }));

    it.each([
      ['null', null, '檔案列表必須是陣列'],
      ['undefined', undefined, '檔案列表必須是陣列'],
      ['字串', '/path/to/file.ts', '檔案列表必須是陣列'],
      ['數字', 123, '檔案列表必須是陣列'],
      ['物件', { files: ['/test.ts'] }, '檔案列表必須是陣列'],
    ])('應該拒絕無效的檔案列表類型：%s', withMemoryOptimization(async (description, input, expectedError) => {
      await expect(duplicationDetector.findDuplicates(input as any)).rejects.toThrow(expectedError);
    }, { testName: `duplication-invalid-type-${description}` }));

    it.each([
      [
        '包含 null 檔案',
        ['/valid/file.ts', null, '/another/file.ts'],
        '無效的檔案路徑'
      ],
      [
        '包含 undefined 檔案',
        ['/valid/file.ts', undefined, '/another/file.ts'],
        '無效的檔案路徑'
      ],
      [
        '包含空字串檔案',
        ['/valid/file.ts', '', '/another/file.ts'],
        '無效的檔案路徑'
      ],
      [
        '包含數字檔案路徑',
        ['/valid/file.ts', 123, '/another/file.ts'],
        '無效的檔案路徑'
      ],
      [
        '包含物件檔案路徑',
        ['/valid/file.ts', { path: '/test.ts' }, '/another/file.ts'],
        '無效的檔案路徑'
      ],
    ])('應該拒絕包含無效檔案路徑的陣列：%s', withMemoryOptimization(async (description, files, expectedError) => {
      await expect(duplicationDetector.findDuplicates(files as any)).rejects.toThrow(expectedError);
    }, { testName: `duplication-invalid-files-${description}` }));
  });

  describe('極端輸入壓力測試', () => {
    it.each([
      [1000, '大量短程式碼'],
      [100, '中量長程式碼'],
      [10, '少量極長程式碼'],
    ])('應該處理批次分析：%d 個程式碼樣本', withMemoryOptimization(async (count, description) => {
      const codes = Array.from({ length: count }, (_, i) =>
        `function test${i}() {\n  console.log("test ${i}");\n  return ${i};\n}`
      );

      const results = await Promise.all(codes.map(code => analyzer.analyzeCode(code)));

      expect(results.length).toBe(count);
      results.forEach(result => {
        expect(result.cyclomaticComplexity).toBeGreaterThan(0);
        expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);
      });
    }, { testName: `batch-analysis-${description}`, timeout: 10000 }));

    it('應該處理包含特殊字符的程式碼', withMemoryOptimization(async () => {
      const specialCharCode = `
        // 特殊字符測試 🚀
        function test(param: string): string {
          const emoji = "測試 🎯 ♠️ ♣️ ♥️ ♦️";
          const unicode = "\\u4e2d\\u6587";
          const symbols = "!@#$%^&*()_+-=[]{}|;':\",./<>?";
          return \`\${param} \${emoji} \${unicode} \${symbols}\`;
        }
      `;

      const result = await analyzer.analyzeCode(specialCharCode);

      expect(result.cyclomaticComplexity).toBeGreaterThan(0);
      expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);
    }, { testName: 'special-characters-analysis' }));

    it('應該處理嵌套極深的程式碼結構', withMemoryOptimization(async () => {
      // 生成嵌套深度 50 的程式碼
      let deepNestedCode = 'function deepNested() {\n';

      for (let i = 0; i < 50; i++) {
        deepNestedCode += '  '.repeat(i + 1) + `if (condition${i}) {\n`;
      }

      deepNestedCode += '  '.repeat(51) + 'return true;\n';

      for (let i = 49; i >= 0; i--) {
        deepNestedCode += '  '.repeat(i + 1) + '}\n';
      }

      deepNestedCode += '}';

      const result = await analyzer.analyzeCode(deepNestedCode);

      expect(result.cyclomaticComplexity).toBeGreaterThan(50);
      expect(result.cognitiveComplexity).toBeGreaterThan(50);
    }, { testName: 'deep-nested-structure' }));
  });

  describe('並發異常處理測試', () => {
    it('應該處理並發分析時的異常', withMemoryOptimization(async () => {
      const invalidInputs = [null, undefined, 123, {}, [], true, () => 'test'];

      const results = await Promise.allSettled(
        invalidInputs.map(input => analyzer.analyzeCode(input as any))
      );

      // 所有結果都應該是 rejected
      results.forEach((result, index) => {
        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.reason.message).toContain('程式碼必須是字串類型');
        }
      });
    }, { testName: 'concurrent-error-handling' }));

    it('應該處理混合有效和無效輸入的並發請求', withMemoryOptimization(async () => {
      const mixedInputs = [
        'function valid() { return true; }',  // 有效
        null,                                 // 無效
        'const x = 1;',                      // 有效
        undefined,                           // 無效
        'class Test {}',                     // 有效
      ];

      const results = await Promise.allSettled(
        mixedInputs.map(input => analyzer.analyzeCode(input as any))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('rejected');
      expect(results[4].status).toBe('fulfilled');
    }, { testName: 'mixed-concurrent-requests' }));
  });

  describe('記憶體壓力測試', () => {
    it('應該在記憶體壓力下正常運作', withMemoryOptimization(async () => {
      // 創建大量物件來增加記憶體壓力
      const memoryPressure = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: `test-data-${i}`.repeat(100)
      }));

      const code = 'function test() { return true; }';
      const result = await analyzer.analyzeCode(code);

      expect(result.cyclomaticComplexity).toBeGreaterThan(0);
      expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);

      // 清理記憶體壓力
      memoryPressure.length = 0;
    }, { testName: 'memory-pressure-analysis' }));
  });
});

describe('Analysis 模組錯誤恢復測試', () => {
  it.each([
    ['部分損壞的程式碼', 'function broken( { console.log("test");'],
    ['語法錯誤程式碼', 'if (true { console.log("missing closing brace");'],
    ['未配對的括號', 'function test() { if (true) { console.log("test"); }'],
    ['混合引號', 'const str = "hello\' + \'world";'],
    ['未結束的字串', 'const str = "unclosed string'],
  ])('應該優雅處理語法錯誤：%s', withMemoryOptimization(async (description, brokenCode) => {
    const analyzer = new ComplexityAnalyzer();

    // 即使程式碼有語法錯誤，分析器應該不會崩潰
    const result = await analyzer.analyzeCode(brokenCode);

    expect(typeof result.cyclomaticComplexity).toBe('number');
    expect(typeof result.cognitiveComplexity).toBe('number');
    expect(result.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    expect(result.cognitiveComplexity).toBeGreaterThanOrEqual(0);
  }, { testName: `error-recovery-${description}` }));
});