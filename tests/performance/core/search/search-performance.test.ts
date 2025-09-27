/**
 * Search 模組效能基準測試
 * 測試各種搜尋引擎和搜尋策略的效能表現
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchService } from '../../../../src/core/search/service';
import { TextSearchEngine } from '../../../../src/core/search/engines/text-engine';
import { SearchType } from '../../../../src/core/search/types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('搜尋模組效能基準測試', () => {
  let testDir: string;
  let searchService: SearchService;
  let textEngine: TextSearchEngine;
  let testFiles: string[];

  beforeEach(async () => {
    // 建立臨時測試目錄和檔案
    testDir = join(tmpdir(), `agent-ide-search-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createTestFiles(testDir);

    // 初始化搜尋元件
    searchService = new SearchService();
    textEngine = new TextSearchEngine();
  });

  afterEach(async () => {
    try {
      searchService.dispose?.();
      textEngine.dispose?.();
    } catch (error) {
      // 忽略清理錯誤
    }

    // 清理測試目錄
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('文字搜尋引擎效能測試', async () => {
    const testCases = [
      { pattern: 'function', type: SearchType.TEXT },
      { pattern: 'class.*Test', type: SearchType.REGEX },
      { pattern: 'export.*interface', type: SearchType.REGEX },
      { pattern: 'const.*=.*require', type: SearchType.REGEX },
      { pattern: 'async.*await', type: SearchType.REGEX }
    ];

    const results: Record<string, { time: number; matches: number; throughput: number }> = {};

    for (const testCase of testCases) {
      const startTime = Date.now();

      const searchResults = await textEngine.search(testFiles, testCase.pattern, {
        type: testCase.type,
        caseSensitive: false,
        wholeWord: false
      });

      const searchTime = Date.now() - startTime;
      const totalFileSize = await getTotalFileSize(testFiles);
      const throughput = totalFileSize / searchTime * 1000; // bytes/sec

      results[testCase.pattern] = {
        time: searchTime,
        matches: searchResults.length,
        throughput
      };

      console.log(`搜尋 "${testCase.pattern}" (${testCase.type}):`);
      console.log(`  時間: ${searchTime}ms`);
      console.log(`  結果: ${searchResults.length} 個匹配`);
      console.log(`  吞吐量: ${(throughput / 1024 / 1024).toFixed(2)} MB/sec`);

      // 每次搜尋應該在合理時間內完成
      expect(searchTime).toBeLessThan(2000);
      expect(throughput).toBeGreaterThan(1024 * 1024); // 至少 1MB/sec
    }

    // 計算平均效能
    const avgTime = Object.values(results).reduce((sum, r) => sum + r.time, 0) / testCases.length;
    const avgThroughput = Object.values(results).reduce((sum, r) => sum + r.throughput, 0) / testCases.length;

    console.log(`平均搜尋時間: ${avgTime.toFixed(2)}ms`);
    console.log(`平均吞吐量: ${(avgThroughput / 1024 / 1024).toFixed(2)} MB/sec`);

    expect(avgTime).toBeLessThan(1000);
  });

  it('大型檔案搜尋效能', async () => {
    // 建立一個大型檔案 (1MB)
    const largeFilePath = join(testDir, 'large-file.ts');
    const largeContent = generateLargeContent(1024 * 1024); // 1MB
    await fs.writeFile(largeFilePath, largeContent);

    const patterns = ['function', 'class', 'interface', 'export', 'import'];
    const results: Array<{ pattern: string; time: number; matches: number }> = [];

    for (const pattern of patterns) {
      const startTime = Date.now();

      const searchResults = await textEngine.search([largeFilePath], pattern, {
        type: SearchType.TEXT,
        caseSensitive: false
      });

      const searchTime = Date.now() - startTime;
      const fileSize = (await fs.stat(largeFilePath)).size;
      const throughput = fileSize / searchTime * 1000; // bytes/sec

      results.push({
        pattern,
        time: searchTime,
        matches: searchResults.length
      });

      console.log(`大檔案搜尋 "${pattern}":`);
      console.log(`  檔案大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  搜尋時間: ${searchTime}ms`);
      console.log(`  匹配數量: ${searchResults.length}`);
      console.log(`  處理速度: ${(throughput / 1024 / 1024).toFixed(2)} MB/sec`);

      // 大檔案搜尋效能要求
      expect(searchTime).toBeLessThan(3000); // 3秒內完成
      expect(throughput).toBeGreaterThan(500 * 1024); // 至少 500KB/sec
    }

    await fs.unlink(largeFilePath);
  });

  it('並發搜尋效能測試', async () => {
    const queries = [
      'function',
      'class',
      'interface',
      'type',
      'const',
      'let',
      'var',
      'export',
      'import',
      'async'
    ];

    const startTime = Date.now();

    // 同時執行多個搜尋
    const searchPromises = queries.map(query =>
      searchService.search({
        pattern: query,
        type: SearchType.TEXT,
        paths: testFiles.slice(0, 50), // 只搜尋前50個檔案避免過度負載
        options: {
          caseSensitive: false,
          wholeWord: false
        }
      })
    );

    const results = await Promise.all(searchPromises);
    const totalTime = Date.now() - startTime;

    const totalMatches = results.reduce((sum, result) => sum + (result.matches?.length || 0), 0);
    const avgSearchTime = totalTime / queries.length;

    console.log(`並發搜尋效能 (${queries.length}個查詢):`);
    console.log(`  總時間: ${totalTime}ms`);
    console.log(`  平均時間: ${avgSearchTime.toFixed(2)}ms`);
    console.log(`  總匹配數: ${totalMatches}`);
    console.log(`  搜尋速率: ${(queries.length / totalTime * 1000).toFixed(2)} queries/sec`);

    // 並發搜尋效能要求
    expect(totalTime).toBeLessThan(5000);
    expect(avgSearchTime).toBeLessThan(1000);
    expect(totalMatches).toBeGreaterThan(0);
  });

  it('搜尋結果快取效能', async () => {
    const query = 'function';

    // 第一次搜尋 (cold cache)
    const coldStartTime = Date.now();
    const firstResult = await searchService.search({
      pattern: query,
      type: SearchType.TEXT,
      paths: testFiles,
      options: { caseSensitive: false }
    });
    const coldTime = Date.now() - coldStartTime;

    // 第二次相同搜尋 (warm cache)
    const warmStartTime = Date.now();
    const secondResult = await searchService.search({
      pattern: query,
      type: SearchType.TEXT,
      paths: testFiles,
      options: { caseSensitive: false }
    });
    const warmTime = Date.now() - warmStartTime;

    // 第三次相同搜尋 (hot cache)
    const hotStartTime = Date.now();
    const thirdResult = await searchService.search({
      pattern: query,
      type: SearchType.TEXT,
      paths: testFiles,
      options: { caseSensitive: false }
    });
    const hotTime = Date.now() - hotStartTime;

    console.log('快取效能測試:');
    console.log(`  Cold cache: ${coldTime}ms`);
    console.log(`  Warm cache: ${warmTime}ms`);
    console.log(`  Hot cache: ${hotTime}ms`);
    console.log(`  快取加速比: ${(coldTime / hotTime).toFixed(2)}x`);

    // 驗證結果一致性
    expect(firstResult.matches?.length || 0).toBe(secondResult.matches?.length || 0);
    expect(secondResult.matches?.length || 0).toBe(thirdResult.matches?.length || 0);

    // 快取應該有明顯的效能提升（考慮測試環境的變異性）
    expect(warmTime).toBeLessThanOrEqual(coldTime + 5); // 允許5ms的變異
    expect(hotTime).toBeLessThanOrEqual(Math.max(warmTime + 5, coldTime)); // 允許一些測量誤差
    expect(hotTime).toBeLessThan(coldTime * 0.8); // 至少20%的提升（更實際的預期）
  });

  it('複雜正則表達式效能', async () => {
    const complexPatterns = [
      '\\b(async|await)\\s+\\w+',
      '(class|interface)\\s+\\w+\\s*{',
      'export\\s+(default\\s+)?(class|function|interface)',
      '\\w+\\s*:\\s*(Promise<\\w+>|\\w+\\[\\])',
      '(import|from)\\s+[\'"][^\'\"]+[\'"]'
    ];

    const results: Array<{ pattern: string; time: number; matches: number; complexity: number }> = [];

    for (const pattern of complexPatterns) {
      const startTime = Date.now();

      const searchResults = await textEngine.search(testFiles, pattern, {
        type: SearchType.REGEX,
        caseSensitive: false
      });

      const searchTime = Date.now() - startTime;
      const complexity = calculateRegexComplexity(pattern);

      results.push({
        pattern,
        time: searchTime,
        matches: searchResults.length,
        complexity
      });

      console.log(`複雜正則 "${pattern}":`);
      console.log(`  時間: ${searchTime}ms`);
      console.log(`  匹配: ${searchResults.length}`);
      console.log(`  複雜度: ${complexity}`);

      // 複雜正則也應該在合理時間內完成
      expect(searchTime).toBeLessThan(5000);
    }

    // 分析複雜度與效能的關係
    const avgComplexity = results.reduce((sum, r) => sum + r.complexity, 0) / results.length;
    const avgTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;

    console.log(`平均正則複雜度: ${avgComplexity.toFixed(2)}`);
    console.log(`平均搜尋時間: ${avgTime.toFixed(2)}ms`);
  });

  it('記憶體使用量監控', async () => {
    const initialMemory = process.memoryUsage();

    // 執行大量搜尋操作
    const patterns = Array.from({length: 100}, (_, i) => `test${i % 10}`);

    for (const pattern of patterns) {
      await searchService.search({
        pattern,
        type: SearchType.TEXT,
        paths: testFiles.slice(0, 20),
        options: { caseSensitive: false }
      });
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerSearch = memoryIncrease / patterns.length;

    console.log('搜尋記憶體使用量:');
    console.log(`  總增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  每次搜尋: ${(memoryPerSearch / 1024).toFixed(2)} KB`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 小於 50MB
    expect(memoryPerSearch).toBeLessThan(500 * 1024); // 每次搜尋小於 500KB
  });
});

// 輔助函數：建立測試檔案
async function createTestFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];
  const fileCount = 100; // 建立100個測試檔案

  for (let i = 0; i < fileCount; i++) {
    const fileName = `test-file-${i}.ts`;
    const filePath = join(baseDir, fileName);

    const content = generateTestFileContent(i);
    await fs.writeFile(filePath, content);

    files.push(filePath);
  }

  return files;
}

// 輔助函數：生成測試檔案內容
function generateTestFileContent(index: number): string {
  const functions = Array.from({length: 5}, (_, i) =>
    `export function testFunction${index}_${i}(param: string): Promise<string> {
      return new Promise(resolve => {
        const result = param.toUpperCase();
        resolve(result);
      });
    }`
  ).join('\n\n');

  const classes = Array.from({length: 3}, (_, i) =>
    `export class TestClass${index}_${i} {
      private property: string = 'test';

      async method${i}(): Promise<void> {
        console.log('Method ${i} called');
      }
    }`
  ).join('\n\n');

  const interfaces = Array.from({length: 2}, (_, i) =>
    `export interface ITestInterface${index}_${i} {
      property${i}: string;
      method${i}(): Promise<void>;
    }`
  ).join('\n\n');

  return `// Test file ${index}
import { resolve } from 'path';
import { promises as fs } from 'fs';

${functions}

${classes}

${interfaces}

export const testConstant${index} = 'test-value-${index}';
export type TestType${index} = string | number;
`;
}

// 輔助函數：生成大型檔案內容
function generateLargeContent(targetSize: number): string {
  const baseContent = generateTestFileContent(0);
  const repetitions = Math.ceil(targetSize / baseContent.length);

  return Array.from({length: repetitions}, (_, i) =>
    generateTestFileContent(i)
  ).join('\n\n');
}

// 輔助函數：計算檔案總大小
async function getTotalFileSize(files: string[]): Promise<number> {
  let totalSize = 0;
  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      totalSize += stats.size;
    } catch (error) {
      // 忽略讀取錯誤
    }
  }
  return totalSize;
}

// 輔助函數：計算正則表達式複雜度
function calculateRegexComplexity(pattern: string): number {
  let complexity = 1;

  // 計算各種複雜度因子
  complexity += (pattern.match(/\*/g) || []).length * 2; // 星號
  complexity += (pattern.match(/\+/g) || []).length * 1.5; // 加號
  complexity += (pattern.match(/\?/g) || []).length * 1; // 問號
  complexity += (pattern.match(/\|/g) || []).length * 3; // 分支
  complexity += (pattern.match(/\[.*?\]/g) || []).length * 2; // 字元集
  complexity += (pattern.match(/\(.*?\)/g) || []).length * 1.5; // 群組
  complexity += (pattern.match(/\{.*?\}/g) || []).length * 2; // 量詞
  complexity += (pattern.match(/\\/g) || []).length * 0.5; // 轉義

  return complexity;
}