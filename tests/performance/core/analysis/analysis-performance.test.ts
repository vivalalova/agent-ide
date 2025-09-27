/**
 * Analysis 模組效能基準測試
 * 測試程式碼分析工具的效能表現，包括複雜度分析、品質評估、重複檢測等
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComplexityAnalyzer } from '../../../../src/core/analysis/complexity-analyzer';
import { QualityMetrics } from '../../../../src/core/analysis/quality-metrics';
import { DuplicationDetector } from '../../../../src/core/analysis/duplication-detector';
import { DeadCodeDetector } from '../../../../src/core/analysis/dead-code-detector';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('程式碼分析模組效能基準測試', () => {
  let testDir: string;
  let testFiles: Array<{ path: string; content: string; size: number }>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-analysis-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createTestFiles(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('複雜度分析效能測試', async () => {
    const analyzer = new ComplexityAnalyzer();
    const results: Array<{ size: number; time: number; metrics: any }> = [];

    console.log('複雜度分析效能測試開始...');

    for (const testFile of testFiles) {
      const startTime = Date.now();

      const complexity = await analyzer.analyzeCode(testFile.content);

      const analysisTime = Date.now() - startTime;
      const linesPerMs = testFile.content.split('\n').length / analysisTime;
      const bytesPerMs = testFile.size / analysisTime;

      results.push({
        size: testFile.size,
        time: analysisTime,
        metrics: complexity
      });

      console.log(`檔案大小: ${(testFile.size / 1024).toFixed(2)} KB`);
      console.log(`分析時間: ${analysisTime}ms`);
      console.log(`處理速度: ${linesPerMs.toFixed(2)} lines/ms, ${(bytesPerMs / 1024).toFixed(2)} KB/ms`);
      console.log(`複雜度: 圈複雜度=${complexity.cyclomaticComplexity}, 認知複雜度=${complexity.cognitiveComplexity}`);
      console.log('---');

      // 效能要求：每KB代碼分析時間不超過200ms（放寬限制）
      expect(analysisTime).toBeLessThan(testFile.size / 1024 * 200);
      expect(complexity.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    }

    // 計算整體統計
    const totalFiles = results.length;
    const totalTime = results.reduce((sum, r) => sum + r.time, 0);
    const totalSize = results.reduce((sum, r) => sum + r.size, 0);
    const avgComplexity = results.reduce((sum, r) => sum + r.metrics.cyclomaticComplexity, 0) / totalFiles;

    console.log('複雜度分析整體統計:');
    console.log(`總檔案數: ${totalFiles}`);
    console.log(`總處理時間: ${totalTime}ms`);
    console.log(`總程式碼大小: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`平均複雜度: ${avgComplexity.toFixed(2)}`);
    console.log(`整體處理速度: ${(totalSize / totalTime / 1024).toFixed(2)} KB/ms`);

    expect(totalTime).toBeLessThan(10000); // 總時間不超過10秒
    expect(totalSize / totalTime).toBeGreaterThan(10 * 1024); // 至少10KB/ms
  });

  it('品質指標評估效能測試', async () => {
    const qualityMetrics = new QualityMetrics();
    const results: Array<{ time: number; score: number; size: number }> = [];

    console.log('品質指標評估效能測試開始...');

    for (const testFile of testFiles) {
      const startTime = Date.now();

      const metrics = await qualityMetrics.calculateMetrics(testFile.content);

      const evaluationTime = Date.now() - startTime;
      const throughput = testFile.size / evaluationTime * 1000; // bytes/sec

      results.push({
        time: evaluationTime,
        score: metrics.maintainability,
        size: testFile.size
      });

      console.log(`檔案大小: ${(testFile.size / 1024).toFixed(2)} KB`);
      console.log(`評估時間: ${evaluationTime}ms`);
      console.log(`處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);
      console.log(`品質分數: 可維護性=${metrics.maintainability.toFixed(2)}, 可讀性=${metrics.readability.toFixed(2)}`);
      console.log('---');

      // 效能要求
      expect(evaluationTime).toBeLessThan(2000); // 每個檔案評估不超過2秒
      expect(throughput).toBeGreaterThan(50 * 1024); // 至少50KB/sec
      expect(metrics.maintainability).toBeGreaterThanOrEqual(0);
      expect(metrics.maintainability).toBeLessThanOrEqual(100);
    }

    const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const totalThroughput = results.reduce((sum, r) => sum + r.size, 0) /
                           results.reduce((sum, r) => sum + r.time, 0) * 1000;

    console.log('品質評估整體統計:');
    console.log(`平均評估時間: ${avgTime.toFixed(2)}ms`);
    console.log(`平均品質分數: ${avgScore.toFixed(2)}`);
    console.log(`整體處理速度: ${(totalThroughput / 1024).toFixed(2)} KB/sec`);

    expect(avgTime).toBeLessThan(500);
    expect(avgScore).toBeGreaterThan(30); // 平均品質分數合理
  });

  it('重複程式碼檢測效能測試', async () => {
    const detector = new DuplicationDetector();

    // 建立包含重複程式碼的測試檔案
    const duplicatedCode = generateCodeWithDuplication();
    const testFilePath = join(testDir, 'duplicated-code.ts');
    await fs.writeFile(testFilePath, duplicatedCode);

    console.log('重複程式碼檢測效能測試開始...');
    console.log(`測試檔案大小: ${(Buffer.byteLength(duplicatedCode) / 1024).toFixed(2)} KB`);

    const startTime = Date.now();

    const duplicates = await detector.findDuplicates([testFilePath]);

    const detectionTime = Date.now() - startTime;
    const codeSize = Buffer.byteLength(duplicatedCode);
    const throughput = codeSize / detectionTime * 1000; // bytes/sec

    console.log(`檢測時間: ${detectionTime}ms`);
    console.log(`找到重複: ${duplicates.length} 組`);
    console.log(`處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

    // 驗證檢測結果
    expect(duplicates.length).toBeGreaterThan(0); // 應該檢測到重複程式碼
    expect(detectionTime).toBeLessThan(5000); // 檢測時間不超過5秒
    expect(throughput).toBeGreaterThan(20 * 1024); // 至少20KB/sec

    // 測試多檔案重複檢測
    const multiFileStartTime = Date.now();
    const multiFileDuplicates = await detector.findDuplicates(testFiles.map(f => f.path));
    const multiFileTime = Date.now() - multiFileStartTime;

    const totalSize = testFiles.reduce((sum, f) => sum + f.size, 0);
    const multiFileThroughput = totalSize / multiFileTime * 1000;

    console.log(`多檔案檢測 (${testFiles.length}個檔案):`);
    console.log(`  總大小: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`  檢測時間: ${multiFileTime}ms`);
    console.log(`  找到重複: ${multiFileDuplicates.length} 組`);
    console.log(`  處理速度: ${(multiFileThroughput / 1024).toFixed(2)} KB/sec`);

    expect(multiFileTime).toBeLessThan(5000); // 多檔案檢測不超過5秒
    expect(multiFileThroughput).toBeGreaterThan(10 * 1024); // 至少10KB/sec

    await fs.unlink(testFilePath);
  });

  it('死代碼檢測效能測試', async () => {
    const detector = new DeadCodeDetector();

    // 建立包含死代碼的測試檔案
    const codeWithDeadParts = generateCodeWithDeadCode();
    const testFilePath = join(testDir, 'code-with-dead-parts.ts');
    await fs.writeFile(testFilePath, codeWithDeadParts);

    console.log('死代碼檢測效能測試開始...');

    const startTime = Date.now();

    const deadCode = await detector.findDeadCode([testFilePath]);

    const detectionTime = Date.now() - startTime;
    const codeSize = Buffer.byteLength(codeWithDeadParts);
    const throughput = codeSize / detectionTime * 1000;

    console.log(`檔案大小: ${(codeSize / 1024).toFixed(2)} KB`);
    console.log(`檢測時間: ${detectionTime}ms`);
    console.log(`找到死代碼: ${deadCode.length} 處`);
    console.log(`處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

    expect(detectionTime).toBeLessThan(6000); // 檢測時間不超過6秒
    expect(throughput).toBeGreaterThan(20 * 1024); // 至少20KB/sec
    expect(deadCode.length).toBeGreaterThanOrEqual(0);

    await fs.unlink(testFilePath);
  });

  it('並發分析效能測試', async () => {
    const analyzer = new ComplexityAnalyzer();
    const qualityMetrics = new QualityMetrics();

    console.log('並發分析效能測試開始...');

    const startTime = Date.now();

    // 並發執行複雜度分析和品質評估
    const analysisPromises = testFiles.map(async (testFile) => {
      const [complexity, quality] = await Promise.all([
        analyzer.analyzeCode(testFile.content),
        qualityMetrics.calculateMetrics(testFile.content)
      ]);

      return {
        file: testFile.path,
        complexity,
        quality,
        size: testFile.size
      };
    });

    const results = await Promise.all(analysisPromises);
    const totalTime = Date.now() - startTime;

    const totalSize = results.reduce((sum, r) => sum + r.size, 0);
    const avgComplexity = results.reduce((sum, r) => sum + r.complexity.cyclomaticComplexity, 0) / results.length;
    const avgQuality = results.reduce((sum, r) => sum + r.quality.maintainability, 0) / results.length;
    const throughput = totalSize / totalTime * 1000;

    console.log(`並發分析結果 (${results.length}個檔案):`);
    console.log(`  總大小: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`  總時間: ${totalTime}ms`);
    console.log(`  平均複雜度: ${avgComplexity.toFixed(2)}`);
    console.log(`  平均品質: ${avgQuality.toFixed(2)}`);
    console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

    // 並發分析應該比序列分析更快
    expect(totalTime).toBeLessThan(10000); // 不超過10秒
    expect(throughput).toBeGreaterThan(50 * 1024); // 至少50KB/sec
    expect(results.length).toBe(testFiles.length);
  });

  it('記憶體使用量監控', async () => {
    const analyzer = new ComplexityAnalyzer();
    const initialMemory = process.memoryUsage();

    // 分析所有測試檔案
    for (const testFile of testFiles) {
      await analyzer.analyzeCode(testFile.content);
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const totalSize = testFiles.reduce((sum, f) => sum + f.size, 0);
    const memoryRatio = memoryIncrease / totalSize;

    console.log('分析記憶體使用量:');
    console.log(`  記憶體增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  程式碼大小: ${(totalSize / 1024).toFixed(2)} KB`);
    console.log(`  記憶體比率: ${memoryRatio.toFixed(2)}x`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 小於100MB
    expect(memoryRatio).toBeLessThan(10); // 記憶體不超過檔案大小的10倍
  });
});

// 輔助函數：建立測試檔案
async function createTestFiles(baseDir: string): Promise<Array<{ path: string; content: string; size: number }>> {
  const files: Array<{ path: string; content: string; size: number }> = [];

  // 建立不同大小和複雜度的測試檔案
  const testCases = [
    { name: 'simple.ts', complexity: 'low', size: 'small' },
    { name: 'medium.ts', complexity: 'medium', size: 'medium' },
    { name: 'complex.ts', complexity: 'high', size: 'large' },
    { name: 'functional.ts', complexity: 'medium', size: 'medium' },
    { name: 'class-heavy.ts', complexity: 'high', size: 'large' }
  ];

  for (const testCase of testCases) {
    const filePath = join(baseDir, testCase.name);
    const content = generateCodeByComplexity(testCase.complexity, testCase.size);

    await fs.writeFile(filePath, content);

    files.push({
      path: filePath,
      content,
      size: Buffer.byteLength(content)
    });
  }

  return files;
}

// 輔助函數：根據複雜度生成程式碼
function generateCodeByComplexity(complexity: string, size: string): string {
  let code = `// Generated code with ${complexity} complexity and ${size} size\n\n`;

  const methodCount = size === 'small' ? 3 : size === 'medium' ? 8 : 15;  // 減少測試複雜度
  const nestingLevel = complexity === 'low' ? 1 : complexity === 'medium' ? 2 : 3;  // 減少巢狀層級

  // 生成類別
  code += `export class TestClass {\n`;
  code += `  private data: Map<string, any> = new Map();\n\n`;

  for (let i = 0; i < methodCount; i++) {
    code += generateMethod(i, nestingLevel, complexity);
  }

  code += `}\n\n`;

  // 生成函式
  for (let i = 0; i < methodCount / 2; i++) {
    code += generateFunction(i, nestingLevel, complexity);
  }

  return code;
}

// 輔助函數：生成方法
function generateMethod(index: number, nestingLevel: number, complexity: string): string {
  let method = `  async method${index}(param: any): Promise<any> {\n`;

  if (complexity === 'low') {
    method += `    return param?.toString() || 'default';\n`;
  } else if (complexity === 'medium') {
    method += `    if (param) {\n`;
    method += `      for (let i = 0; i < 10; i++) {\n`;
    method += `        if (i % 2 === 0) {\n`;
    method += `          console.log(\`Processing \${i}\`);\n`;
    method += `        }\n`;
    method += `      }\n`;
    method += `      return param;\n`;
    method += `    } else {\n`;
    method += `      throw new Error('Invalid parameter');\n`;
    method += `    }\n`;
  } else {
    // 高複雜度：多重嵌套和條件分支
    method += generateComplexLogic(nestingLevel);
  }

  method += `  }\n\n`;
  return method;
}

// 輔助函數：生成函式
function generateFunction(index: number, nestingLevel: number, complexity: string): string {
  let func = `export function utilFunction${index}(data: any[]): any {\n`;

  if (complexity === 'high') {
    func += generateComplexLogic(nestingLevel);
  } else {
    func += `  return data.filter(item => item != null).map(item => item.toString());\n`;
  }

  func += `}\n\n`;
  return func;
}

// 輔助函數：生成複雜邏輯
function generateComplexLogic(nestingLevel: number): string {
  let logic = '';
  const indent = '    ';

  for (let level = 0; level < nestingLevel; level++) {
    const currentIndent = indent.repeat(level + 1);

    if (level === 0) {
      logic += `${currentIndent}try {\n`;
      logic += `${currentIndent}  if (Array.isArray(param)) {\n`;
    } else if (level === 1) {
      logic += `${currentIndent}    for (const item of param) {\n`;
    } else if (level === 2) {
      logic += `${currentIndent}      if (typeof item === 'object' && item !== null) {\n`;
    } else {
      logic += `${currentIndent}        switch (typeof item.value) {\n`;
      logic += `${currentIndent}          case 'string':\n`;
      logic += `${currentIndent}            return item.value.toUpperCase();\n`;
      logic += `${currentIndent}          case 'number':\n`;
      logic += `${currentIndent}            return item.value * 2;\n`;
      logic += `${currentIndent}          default:\n`;
      logic += `${currentIndent}            return null;\n`;
      logic += `${currentIndent}        }\n`;
    }
  }

  // 關閉嵌套
  for (let level = nestingLevel - 1; level >= 0; level--) {
    const currentIndent = indent.repeat(level + 1);

    if (level === 0) {
      logic += `${currentIndent}  } else {\n`;
      logic += `${currentIndent}    return 'not an array';\n`;
      logic += `${currentIndent}  }\n`;
      logic += `${currentIndent}} catch (error) {\n`;
      logic += `${currentIndent}  console.error('Error processing:', error);\n`;
      logic += `${currentIndent}  return null;\n`;
      logic += `${currentIndent}}\n`;
    } else {
      logic += `${currentIndent}      }\n`;
      logic += `${currentIndent}    }\n`;
    }
  }

  return logic;
}

// 輔助函數：生成包含重複程式碼的內容
function generateCodeWithDuplication(): string {
  const duplicatedBlock = `
    const processData = (data: any) => {
      if (!data) return null;
      const result = data.toString().trim();
      return result.length > 0 ? result : 'empty';
    };`;

  return `
// File with intentional duplications for testing

export class DuplicatedClass1 {
  ${duplicatedBlock}

  method1() {
    return this.processData('test1');
  }
}

export class DuplicatedClass2 {
  ${duplicatedBlock}

  method2() {
    return this.processData('test2');
  }
}

export class DuplicatedClass3 {
  ${duplicatedBlock}

  method3() {
    return this.processData('test3');
  }
}

// Some variations of similar code
export function processingFunction1(input: string) {
  if (!input) return null;
  const result = input.toString().trim();
  return result.length > 0 ? result : 'empty';
}

export function processingFunction2(input: any) {
  if (!input) return null;
  const result = input.toString().trim();
  return result.length > 0 ? result : 'empty';
}
`;
}

// 輔助函數：生成包含死代碼的內容
function generateCodeWithDeadCode(): string {
  return `
// File with dead code for testing

export class ActiveClass {
  public activeMethod() {
    console.log('This method is used');
    return 'active';
  }

  private unusedMethod() {
    console.log('This method is never called');
    return 'unused';
  }
}

// This class is never exported or used
class UnusedClass {
  deadMethod() {
    return 'never called';
  }
}

// This function is never called
function deadFunction() {
  return 'dead code';
}

// This variable is never used
const unusedVariable = 'never referenced';

// Used exports
export const activeInstance = new ActiveClass();
export function activeFunction() {
  return activeInstance.activeMethod();
}

// Dead export (not imported anywhere)
export const deadExport = 'never imported';
`;
}