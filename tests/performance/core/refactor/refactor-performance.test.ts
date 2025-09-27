/**
 * Refactor 模組效能基準測試
 * 測試各種重構操作的效能表現，包括函式提取、變數內聯等
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExtractFunction } from '../../../../src/core/refactor/extract-function';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe.skip('重構模組效能基準測試', () => {
  let testDir: string;
  let testFiles: Array<{ path: string; content: string; size: number }>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-refactor-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createRefactorTestFiles(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('函式提取效能測試', async () => {
    const extractor = new ExtractFunction();

    console.log('函式提取效能測試開始...');
    console.log(`測試檔案數量: ${testFiles.length}`);

    const extractionResults: Array<{
      file: string;
      time: number;
      success: boolean;
      extractedFunctions: number;
      originalSize: number;
      newSize: number;
    }> = [];

    for (const testFile of testFiles) {
      // 找出可以提取的程式碼區塊
      const extractableBlocks = findExtractableBlocks(testFile.content);

      if (extractableBlocks.length === 0) continue;

      const startTime = Date.now();
      let successfulExtractions = 0;
      let totalNewSize = testFile.size;

      // 嘗試提取每個可提取的區塊
      for (const block of extractableBlocks.slice(0, 3)) { // 限制最多3個提取操作
        try {
          const result = await extractor.extractFunction(
            testFile.content,
            block.start,
            block.end,
            `extracted_${block.name}_${Date.now()}`
          );

          if (result.success) {
            successfulExtractions++;
            totalNewSize = Buffer.byteLength(result.newCode || testFile.content);
          }
        } catch (error) {
          console.log(`提取失敗: ${error}`);
        }
      }

      const extractionTime = Date.now() - startTime;
      const throughput = testFile.size / extractionTime * 1000; // bytes/sec

      extractionResults.push({
        file: testFile.path,
        time: extractionTime,
        success: successfulExtractions > 0,
        extractedFunctions: successfulExtractions,
        originalSize: testFile.size,
        newSize: totalNewSize
      });

      console.log(`檔案: ${testFile.path.split('/').pop()}`);
      console.log(`  原始大小: ${(testFile.size / 1024).toFixed(2)} KB`);
      console.log(`  提取時間: ${extractionTime}ms`);
      console.log(`  成功提取: ${successfulExtractions}/${extractableBlocks.length}`);
      console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

      // 效能要求
      expect(extractionTime).toBeLessThan(5000); // 每個檔案提取不超過5秒
      expect(throughput).toBeGreaterThan(20 * 1024); // 至少20KB/sec
    }

    // 整體統計
    const validResults = extractionResults.filter(r => r.extractedFunctions > 0);
    if (validResults.length > 0) {
      const avgExtractionTime = validResults.reduce((sum, r) => sum + r.time, 0) / validResults.length;
      const totalExtractions = validResults.reduce((sum, r) => sum + r.extractedFunctions, 0);
      const successRate = validResults.length / extractionResults.length;

      console.log('函式提取整體統計:');
      console.log(`  平均提取時間: ${avgExtractionTime.toFixed(2)}ms`);
      console.log(`  總提取數量: ${totalExtractions}`);
      console.log(`  成功率: ${(successRate * 100).toFixed(2)}%`);

      expect(avgExtractionTime).toBeLessThan(3000);
      expect(totalExtractions).toBeGreaterThan(0);
    }
  });

  it('程式碼區塊分析效能測試', async () => {
    console.log('程式碼區塊分析效能測試開始...');

    const analysisResults: Array<{
      file: string;
      time: number;
      blocks: number;
      complexity: number;
    }> = [];

    for (const testFile of testFiles) {
      const startTime = Date.now();

      // 分析程式碼結構
      const blocks = analyzeCodeBlocks(testFile.content);
      const complexity = calculateCodeComplexity(testFile.content);

      const analysisTime = Date.now() - startTime;
      const linesAnalyzed = testFile.content.split('\n').length;
      const analysisSpeed = linesAnalyzed / analysisTime; // lines/ms

      analysisResults.push({
        file: testFile.path,
        time: analysisTime,
        blocks: blocks.length,
        complexity
      });

      console.log(`檔案: ${testFile.path.split('/').pop()}`);
      console.log(`  行數: ${linesAnalyzed}`);
      console.log(`  分析時間: ${analysisTime}ms`);
      console.log(`  程式碼區塊: ${blocks.length}`);
      console.log(`  複雜度: ${complexity}`);
      console.log(`  分析速度: ${analysisSpeed.toFixed(2)} lines/ms`);

      // 效能要求
      expect(analysisTime).toBeLessThan(2000); // 分析時間不超過2秒
      expect(analysisSpeed).toBeGreaterThan(1); // 至少1 line/ms
      expect(blocks.length).toBeGreaterThan(0);
    }

    const totalTime = analysisResults.reduce((sum, r) => sum + r.time, 0);
    const totalBlocks = analysisResults.reduce((sum, r) => sum + r.blocks, 0);
    const avgComplexity = analysisResults.reduce((sum, r) => sum + r.complexity, 0) / analysisResults.length;

    console.log('程式碼分析整體統計:');
    console.log(`  總分析時間: ${totalTime}ms`);
    console.log(`  總程式碼區塊: ${totalBlocks}`);
    console.log(`  平均複雜度: ${avgComplexity.toFixed(2)}`);

    expect(totalTime).toBeLessThan(10000);
    expect(totalBlocks).toBeGreaterThan(0);
  });

  it('大型檔案重構效能測試', async () => {
    // 建立大型檔案
    const largeFilePath = join(testDir, 'large-refactor-file.ts');
    const largeContent = generateLargeFileForRefactor(3000); // 3000行
    await fs.writeFile(largeFilePath, largeContent);

    const extractor = new ExtractFunction();

    console.log('大型檔案重構效能測試開始...');
    console.log(`檔案大小: ${(Buffer.byteLength(largeContent) / 1024).toFixed(2)} KB`);
    console.log(`檔案行數: ${largeContent.split('\n').length}`);

    const startTime = Date.now();

    // 在大型檔案中執行多個提取操作
    const extractableBlocks = findExtractableBlocks(largeContent);
    let successfulExtractions = 0;

    for (const block of extractableBlocks.slice(0, 5)) { // 最多5個提取操作
      try {
        const result = await extractor.extractFunction(
          largeContent,
          block.start,
          block.end,
          `largeFileExtracted_${successfulExtractions}`
        );

        if (result.success) {
          successfulExtractions++;
        }
      } catch (error) {
        console.log(`大檔案提取失敗: ${error}`);
      }
    }

    const refactorTime = Date.now() - startTime;
    const fileSize = Buffer.byteLength(largeContent);
    const throughput = fileSize / refactorTime * 1000; // bytes/sec

    console.log(`大檔案重構結果:`);
    console.log(`  重構時間: ${refactorTime}ms`);
    console.log(`  成功提取: ${successfulExtractions}/${Math.min(extractableBlocks.length, 5)}`);
    console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

    // 大檔案效能要求
    expect(refactorTime).toBeLessThan(15000); // 不超過15秒
    expect(throughput).toBeGreaterThan(20 * 1024); // 至少20KB/sec
    expect(successfulExtractions).toBeGreaterThan(0);

    await fs.unlink(largeFilePath);
  });

  it('並發重構效能測試', async () => {
    const extractor = new ExtractFunction();

    console.log('並發重構效能測試開始...');

    // 準備並發重構任務
    const concurrentTasks = testFiles.slice(0, 5).map((testFile, index) => {
      const blocks = findExtractableBlocks(testFile.content);
      if (blocks.length === 0) return null;

      return {
        file: testFile,
        block: blocks[0],
        extractName: `concurrent_extract_${index}`
      };
    }).filter(task => task !== null) as any[];

    if (concurrentTasks.length === 0) {
      console.log('沒有可用的並發重構任務');
      return;
    }

    const concurrentStartTime = Date.now();

    // 並發執行重構
    const concurrentPromises = concurrentTasks.map(task =>
      extractor.extractFunction(
        task.file.content,
        task.block.start,
        task.block.end,
        task.extractName
      ).catch(error => ({ success: false, error: error.message }))
    );

    const concurrentResults = await Promise.all(concurrentPromises);
    const concurrentTime = Date.now() - concurrentStartTime;

    // 序列執行進行比較
    const sequentialStartTime = Date.now();
    const sequentialResults = [];

    for (const task of concurrentTasks) {
      try {
        const result = await extractor.extractFunction(
          task.file.content,
          task.block.start,
          task.block.end,
          `sequential_${task.extractName}`
        );
        sequentialResults.push(result);
      } catch (error) {
        sequentialResults.push({ success: false, error: (error as Error).message });
      }
    }

    const sequentialTime = Date.now() - sequentialStartTime;

    const concurrentSuccesses = concurrentResults.filter(r => r.success).length;
    const sequentialSuccesses = sequentialResults.filter(r => r.success).length;
    const speedup = sequentialTime / concurrentTime;

    console.log(`並發重構結果 (${concurrentTasks.length}個任務):`);
    console.log(`  並發時間: ${concurrentTime}ms`);
    console.log(`  序列時間: ${sequentialTime}ms`);
    console.log(`  加速比: ${speedup.toFixed(2)}x`);
    console.log(`  並發成功: ${concurrentSuccesses}/${concurrentTasks.length}`);
    console.log(`  序列成功: ${sequentialSuccesses}/${concurrentTasks.length}`);

    // 並發應該更快或至少相當
    expect(concurrentTime).toBeLessThanOrEqual(sequentialTime * 1.1); // 允許10%的誤差
    expect(concurrentSuccesses).toBeGreaterThan(0);
  });

  it('記憶體使用量監控', async () => {
    const extractor = new ExtractFunction();
    const initialMemory = process.memoryUsage();

    // 執行多個重構操作
    let operationCount = 0;
    for (const testFile of testFiles) {
      const blocks = findExtractableBlocks(testFile.content);

      for (const block of blocks.slice(0, 2)) { // 每個檔案最多2個操作
        try {
          await extractor.extractFunction(
            testFile.content,
            block.start,
            block.end,
            `memory_test_${operationCount}`
          );
          operationCount++;
        } catch (error) {
          // 忽略錯誤，繼續測試記憶體
        }
      }
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerOperation = operationCount > 0 ? memoryIncrease / operationCount : 0;

    console.log('重構記憶體使用量:');
    console.log(`  重構操作數: ${operationCount}`);
    console.log(`  記憶體增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  每次操作: ${(memoryPerOperation / 1024).toFixed(2)} KB`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(200 * 1024 * 1024); // 小於200MB
    if (operationCount > 0) {
      expect(memoryPerOperation).toBeLessThan(5 * 1024 * 1024); // 每次操作小於5MB
    }
  });
});

// 輔助函數：建立重構測試檔案
async function createRefactorTestFiles(baseDir: string): Promise<Array<{ path: string; content: string; size: number }>> {
  const files: Array<{ path: string; content: string; size: number }> = [];

  const fileTypes = [
    'simple-methods',
    'complex-logic',
    'nested-functions',
    'class-methods',
    'utility-functions'
  ];

  for (let i = 0; i < 15; i++) {
    const fileType = fileTypes[i % fileTypes.length];
    const fileName = `${fileType}-${i}.ts`;
    const filePath = join(baseDir, fileName);

    const content = generateRefactorableCode(fileType, i);
    await fs.writeFile(filePath, content);

    files.push({
      path: filePath,
      content,
      size: Buffer.byteLength(content)
    });
  }

  return files;
}

// 輔助函數：生成可重構的程式碼
function generateRefactorableCode(type: string, index: number): string {
  let content = `// Generated refactorable code of type: ${type}, index: ${index}\n\n`;

  switch (type) {
    case 'simple-methods':
      content += generateSimpleMethodsCode(index);
      break;
    case 'complex-logic':
      content += generateComplexLogicCode(index);
      break;
    case 'nested-functions':
      content += generateNestedFunctionsCode(index);
      break;
    case 'class-methods':
      content += generateClassMethodsCode(index);
      break;
    case 'utility-functions':
      content += generateUtilityFunctionsCode(index);
      break;
  }

  return content;
}

// 生成簡單方法程式碼
function generateSimpleMethodsCode(index: number): string {
  return `
export class SimpleClass${index} {
  private data: string[] = [];

  public addItem(item: string): void {
    // START_EXTRACTABLE_BLOCK: validateAndAdd
    if (!item || item.trim().length === 0) {
      throw new Error('Item cannot be empty');
    }

    const trimmed = item.trim();
    if (this.data.includes(trimmed)) {
      console.log('Item already exists');
      return;
    }

    this.data.push(trimmed);
    console.log(\`Added item: \${trimmed}\`);
    // END_EXTRACTABLE_BLOCK
  }

  public removeItem(item: string): boolean {
    // START_EXTRACTABLE_BLOCK: findAndRemove
    const index = this.data.findIndex(existing =>
      existing.toLowerCase() === item.toLowerCase()
    );

    if (index === -1) {
      console.log('Item not found');
      return false;
    }

    this.data.splice(index, 1);
    console.log(\`Removed item: \${item}\`);
    return true;
    // END_EXTRACTABLE_BLOCK
  }
}`;
}

// 生成複雜邏輯程式碼
function generateComplexLogicCode(index: number): string {
  return `
export function complexProcessor${index}(data: any[]): any[] {
  // START_EXTRACTABLE_BLOCK: dataValidation
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array');
  }

  if (data.length === 0) {
    console.log('Empty data array');
    return [];
  }

  const validData = data.filter(item =>
    item !== null &&
    item !== undefined &&
    typeof item === 'object'
  );

  if (validData.length === 0) {
    console.log('No valid data items found');
    return [];
  }
  // END_EXTRACTABLE_BLOCK

  // START_EXTRACTABLE_BLOCK: dataTransformation
  const processed = validData.map(item => {
    const result = { ...item };

    if (result.name) {
      result.name = result.name.toString().trim();
    }

    if (result.value && typeof result.value === 'number') {
      result.value = Math.round(result.value * 100) / 100;
    }

    if (result.tags && Array.isArray(result.tags)) {
      result.tags = result.tags.filter(tag =>
        typeof tag === 'string' && tag.length > 0
      );
    }

    result.processed = true;
    result.timestamp = Date.now();

    return result;
  });
  // END_EXTRACTABLE_BLOCK

  return processed;
}`;
}

// 生成嵌套函式程式碼
function generateNestedFunctionsCode(index: number): string {
  return `
export function outerFunction${index}(config: any): (input: any) => any {
  const settings = { ...config };

  return function innerFunction(input: any): any {
    // START_EXTRACTABLE_BLOCK: inputProcessing
    if (!input) {
      return null;
    }

    let processed = input;

    if (typeof input === 'string') {
      processed = input.trim().toLowerCase();

      if (settings.uppercase) {
        processed = processed.toUpperCase();
      }

      if (settings.prefix) {
        processed = settings.prefix + processed;
      }
    } else if (typeof input === 'number') {
      processed = input;

      if (settings.multiply) {
        processed *= settings.multiply;
      }

      if (settings.round) {
        processed = Math.round(processed);
      }
    }
    // END_EXTRACTABLE_BLOCK

    // START_EXTRACTABLE_BLOCK: resultFormatting
    const result = {
      original: input,
      processed: processed,
      timestamp: Date.now(),
      settings: { ...settings }
    };

    if (settings.includeMetadata) {
      result.metadata = {
        type: typeof input,
        length: input?.length || 0,
        hash: input?.toString().length || 0
      };
    }

    return result;
    // END_EXTRACTABLE_BLOCK
  };
}`;
}

// 生成類別方法程式碼
function generateClassMethodsCode(index: number): string {
  return `
export class DataManager${index} {
  private cache: Map<string, any> = new Map();
  private stats: { hits: number; misses: number } = { hits: 0, misses: 0 };

  public async getData(key: string): Promise<any> {
    // START_EXTRACTABLE_BLOCK: cacheCheck
    if (this.cache.has(key)) {
      this.stats.hits++;
      console.log(\`Cache hit for key: \${key}\`);

      const cached = this.cache.get(key);
      if (cached && cached.timestamp > Date.now() - 60000) {
        return cached.data;
      } else {
        console.log('Cached data expired');
        this.cache.delete(key);
      }
    }

    this.stats.misses++;
    console.log(\`Cache miss for key: \${key}\`);
    // END_EXTRACTABLE_BLOCK

    // START_EXTRACTABLE_BLOCK: dataFetching
    try {
      console.log(\`Fetching data for key: \${key}\`);

      // Simulate async data fetching
      await new Promise(resolve => setTimeout(resolve, 10));

      const data = {
        key: key,
        value: \`Data for \${key}\`,
        generated: Date.now()
      };

      const cacheEntry = {
        data: data,
        timestamp: Date.now()
      };

      this.cache.set(key, cacheEntry);
      console.log(\`Data cached for key: \${key}\`);

      return data;
    } catch (error) {
      console.error(\`Error fetching data for key \${key}:\`, error);
      throw error;
    }
    // END_EXTRACTABLE_BLOCK
  }
}`;
}

// 生成工具函式程式碼
function generateUtilityFunctionsCode(index: number): string {
  return `
export namespace Utils${index} {
  export function formatString(input: string, options: any = {}): string {
    // START_EXTRACTABLE_BLOCK: stringCleaning
    if (!input || typeof input !== 'string') {
      return '';
    }

    let result = input.trim();

    if (options.removeExtraSpaces) {
      result = result.replace(/\\s+/g, ' ');
    }

    if (options.removePunctuation) {
      result = result.replace(/[^\\w\\s]/gi, '');
    }

    if (options.normalizeCase) {
      result = result.toLowerCase();
    }
    // END_EXTRACTABLE_BLOCK

    // START_EXTRACTABLE_BLOCK: stringFormatting
    if (options.capitalize) {
      result = result.charAt(0).toUpperCase() + result.slice(1);
    }

    if (options.camelCase) {
      result = result.replace(/\\s+(\\w)/g, (match, letter) =>
        letter.toUpperCase()
      );
    }

    if (options.maxLength && result.length > options.maxLength) {
      result = result.substring(0, options.maxLength) + '...';
    }

    return result;
    // END_EXTRACTABLE_BLOCK
  }

  export function processArray<T>(
    array: T[],
    processor: (item: T) => T,
    filter?: (item: T) => boolean
  ): T[] {
    // START_EXTRACTABLE_BLOCK: arrayValidation
    if (!Array.isArray(array)) {
      console.log('Invalid array input');
      return [];
    }

    if (array.length === 0) {
      console.log('Empty array');
      return [];
    }

    if (typeof processor !== 'function') {
      console.log('Invalid processor function');
      return array;
    }
    // END_EXTRACTABLE_BLOCK

    let result = [...array];

    if (filter && typeof filter === 'function') {
      result = result.filter(filter);
    }

    return result.map(processor);
  }
}`;
}

// 輔助函數：生成大型重構檔案
function generateLargeFileForRefactor(lineCount: number): string {
  let content = `// Large file for refactoring performance test\n// Target lines: ${lineCount}\n\n`;

  const classCount = Math.floor(lineCount / 100); // 每100行一個類別

  for (let i = 0; i < classCount; i++) {
    content += `export class LargeRefactorClass${i} {\n`;
    content += `  private data: any[] = [];\n\n`;

    // 每個類別添加多個可提取的方法
    for (let j = 0; j < 8; j++) {
      content += `  public method${i}_${j}(param: any): any {\n`;
      content += `    // START_EXTRACTABLE_BLOCK: processing_${i}_${j}\n`;
      content += `    if (!param) {\n`;
      content += `      return null;\n`;
      content += `    }\n`;
      content += `    \n`;
      content += `    const processed = typeof param === 'string' ?\n`;
      content += `      param.trim().toUpperCase() :\n`;
      content += `      param.toString();\n`;
      content += `    \n`;
      content += `    const result = {\n`;
      content += `      original: param,\n`;
      content += `      processed: processed,\n`;
      content += `      timestamp: Date.now(),\n`;
      content += `      method: 'method${i}_${j}'\n`;
      content += `    };\n`;
      content += `    \n`;
      content += `    this.data.push(result);\n`;
      content += `    console.log(\`Processed in method${i}_${j}: \${processed}\`);\n`;
      content += `    return result;\n`;
      content += `    // END_EXTRACTABLE_BLOCK\n`;
      content += `  }\n\n`;
    }

    content += `}\n\n`;
  }

  return content;
}

// 輔助函數：尋找可提取的程式碼區塊
function findExtractableBlocks(content: string): Array<{ name: string; start: number; end: number }> {
  const blocks: Array<{ name: string; start: number; end: number }> = [];
  const lines = content.split('\n');

  let currentBlock: { name: string; start: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('START_EXTRACTABLE_BLOCK:')) {
      const match = line.match(/START_EXTRACTABLE_BLOCK:\s*(\w+)/);
      if (match) {
        currentBlock = {
          name: match[1],
          start: i
        };
      }
    } else if (line.includes('END_EXTRACTABLE_BLOCK') && currentBlock) {
      blocks.push({
        name: currentBlock.name,
        start: currentBlock.start,
        end: i
      });
      currentBlock = null;
    }
  }

  return blocks;
}

// 輔助函數：分析程式碼區塊
function analyzeCodeBlocks(content: string): Array<{ type: string; start: number; end: number; complexity: number }> {
  const blocks: Array<{ type: string; start: number; end: number; complexity: number }> = [];
  const lines = content.split('\n');

  let currentFunction: { start: number; complexity: number } | null = null;
  let braceLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 檢測函式開始
    if (line.match(/^(export\s+)?(async\s+)?function\s+\w+|^(public|private|protected)?\s*(async\s+)?\w+\s*\(/)) {
      currentFunction = { start: i, complexity: 1 };
      braceLevel = 0;
    }

    // 計算複雜度
    if (currentFunction) {
      if (line.includes('{')) braceLevel++;
      if (line.includes('}')) braceLevel--;

      // 增加複雜度的關鍵字
      if (line.match(/\b(if|for|while|switch|catch)\b/)) {
        currentFunction.complexity++;
      }

      // 函式結束
      if (braceLevel === 0 && line.includes('}') && currentFunction.start < i) {
        blocks.push({
          type: 'function',
          start: currentFunction.start,
          end: i,
          complexity: currentFunction.complexity
        });
        currentFunction = null;
      }
    }
  }

  return blocks;
}

// 輔助函數：計算程式碼複雜度
function calculateCodeComplexity(content: string): number {
  let complexity = 1; // 基本複雜度

  // 計算各種增加複雜度的因素
  const complexityKeywords = ['if', 'for', 'while', 'switch', 'catch', 'else if'];

  for (const keyword of complexityKeywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g');
    const matches = content.match(regex);
    if (matches) {
      complexity += matches.length;
    }
  }

  return complexity;
}