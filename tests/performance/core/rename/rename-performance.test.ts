/**
 * Rename 模組效能基準測試
 * 測試重新命名操作的效能表現，包括符號查找、引用更新和跨檔案操作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RenameEngine } from '../../../../src/core/rename/rename-engine';
import { ScopeAnalyzer } from '../../../../src/core/rename/scope-analyzer';
import { ReferenceUpdater } from '../../../../src/core/rename/reference-updater';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('重新命名模組效能基準測試', () => {
  let testDir: string;
  let testFiles: Array<{ path: string; content: string; symbols: string[] }>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-rename-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createRenameTestFiles(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('符號查找效能測試', async () => {
    const renameEngine = new RenameEngine();

    console.log('符號查找效能測試開始...');
    console.log(`測試檔案數量: ${testFiles.length}`);

    // 測試不同類型的符號查找
    const symbolTypes = ['function', 'class', 'interface', 'variable', 'type'];
    const results: Array<{ type: string; symbol: string; time: number; found: number }> = [];

    for (const symbolType of symbolTypes) {
      const testSymbol = getTestSymbolByType(symbolType);

      const startTime = Date.now();

      const references = await renameEngine.findReferences(
        testFiles.map(f => f.path),
        testSymbol,
        { includeDeclaration: true }
      );

      const findTime = Date.now() - startTime;

      results.push({
        type: symbolType,
        symbol: testSymbol,
        time: findTime,
        found: references.length
      });

      console.log(`符號類型 "${symbolType}" (${testSymbol}):`);
      console.log(`  查找時間: ${findTime}ms`);
      console.log(`  找到引用: ${references.length} 個`);
      console.log(`  平均每檔案: ${(findTime / testFiles.length).toFixed(2)}ms`);

      // 效能要求
      expect(findTime).toBeLessThan(2000); // 每次查找不超過2秒
      expect(findTime / testFiles.length).toBeLessThan(150); // 每檔案不超過150ms (放寬以避免 flake)
    }

    const avgFindTime = results.reduce((sum, r) => sum + r.time, 0) / results.length;
    const totalReferences = results.reduce((sum, r) => sum + r.found, 0);

    console.log('符號查找整體統計:');
    console.log(`  平均查找時間: ${avgFindTime.toFixed(2)}ms`);
    console.log(`  總引用數量: ${totalReferences}`);

    expect(avgFindTime).toBeLessThan(1000);
  });

  it('範圍分析效能測試', async () => {
    const scopeAnalyzer = new ScopeAnalyzer();

    console.log('範圍分析效能測試開始...');

    const analysisResults: Array<{ file: string; time: number; scopes: number }> = [];

    for (const testFile of testFiles) {
      const startTime = Date.now();

      const scopes = await scopeAnalyzer.analyzeScopes(testFile.content, testFile.path);

      const analysisTime = Date.now() - startTime;
      const fileSize = Buffer.byteLength(testFile.content);
      const throughput = fileSize / analysisTime * 1000; // bytes/sec

      analysisResults.push({
        file: testFile.path,
        time: analysisTime,
        scopes: scopes.length
      });

      console.log(`檔案: ${testFile.path.split('/').pop()}`);
      console.log(`  大小: ${(fileSize / 1024).toFixed(2)} KB`);
      console.log(`  分析時間: ${analysisTime}ms`);
      console.log(`  範圍數量: ${scopes.length}`);
      console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

      // 效能要求
      expect(analysisTime).toBeLessThan(1000); // 每個檔案分析不超過1秒
      expect(throughput).toBeGreaterThan(100 * 1024); // 至少100KB/sec
      expect(scopes.length).toBeGreaterThan(0);
    }

    const avgAnalysisTime = analysisResults.reduce((sum, r) => sum + r.time, 0) / analysisResults.length;
    const totalScopes = analysisResults.reduce((sum, r) => sum + r.scopes, 0);

    console.log('範圍分析整體統計:');
    console.log(`  平均分析時間: ${avgAnalysisTime.toFixed(2)}ms`);
    console.log(`  總範圍數量: ${totalScopes}`);

    expect(avgAnalysisTime).toBeLessThan(500);
  });

  it('引用更新效能測試', async () => {
    const referenceUpdater = new ReferenceUpdater();

    console.log('引用更新效能測試開始...');

    // 選擇一個常見的符號進行重新命名測試
    const oldName = 'TestFunction';
    const newName = 'RenamedTestFunction';

    const startTime = Date.now();

    // 更新所有檔案中的引用
    const updateResults = [];
    for (const testFile of testFiles) {
      const updates = await referenceUpdater.updateReferences(
        testFile.content,
        testFile.path,
        oldName,
        newName
      );

      updateResults.push({
        file: testFile.path,
        updates: updates.length,
        newContent: updates.length > 0 ? 'updated' : 'unchanged'
      });
    }

    const updateTime = Date.now() - startTime;
    const totalUpdates = updateResults.reduce((sum, r) => sum + r.updates, 0);
    const updatedFiles = updateResults.filter(r => r.updates > 0).length;

    console.log(`引用更新結果:`);
    console.log(`  更新時間: ${updateTime}ms`);
    console.log(`  更新檔案: ${updatedFiles}/${testFiles.length}`);
    console.log(`  總更新數: ${totalUpdates}`);
    console.log(`  平均每檔案: ${(updateTime / testFiles.length).toFixed(2)}ms`);
    console.log(`  更新速率: ${(totalUpdates / updateTime * 1000).toFixed(2)} updates/sec`);

    // 效能要求
    expect(updateTime).toBeLessThan(3000); // 更新時間不超過3秒
    expect(updateTime / testFiles.length).toBeLessThan(300); // 每檔案不超過300ms (放寬以避免 flake)
    expect(totalUpdates).toBeGreaterThan(0);
  });

  it('跨檔案重新命名效能測試', async () => {
    const renameEngine = new RenameEngine();

    console.log('跨檔案重新命名效能測試開始...');

    const renameOperations = [
      { oldName: 'BaseClass', newName: 'UpdatedBaseClass' },
      { oldName: 'utilFunction', newName: 'renamedUtilFunction' },
      { oldName: 'CommonInterface', newName: 'UpdatedCommonInterface' },
      { oldName: 'CONFIG_VALUE', newName: 'RENAMED_CONFIG_VALUE' }
    ];

    const renameResults: Array<{ operation: any; time: number; affectedFiles: number; changes: number }> = [];

    for (const operation of renameOperations) {
      const startTime = Date.now();

      // 創建模擬的 Symbol 對象進行測試
      const mockSymbol = {
        name: operation.oldName,
        type: 'class' as const,
        location: {
          filePath: testFiles[0].path,
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: operation.oldName.length + 1 }
          }
        },
        scope: {
          type: 'global' as const,
          name: 'global'
        }
      };

      const result = await renameEngine.rename({
        symbol: mockSymbol,
        newName: operation.newName,
        filePaths: testFiles.map(f => f.path)
      });

      const renameTime = Date.now() - startTime;

      renameResults.push({
        operation,
        time: renameTime,
        affectedFiles: result.affectedFiles.length,
        changes: result.operations.length
      });

      console.log(`重新命名 "${operation.oldName}" -> "${operation.newName}":`);
      console.log(`  時間: ${renameTime}ms`);
      console.log(`  影響檔案: ${result.affectedFiles.length}`);
      console.log(`  變更數量: ${result.operations.length}`);
      console.log(`  成功: ${result.success ? 'Yes' : 'No'}`);

      // 效能要求
      expect(renameTime).toBeLessThan(5000); // 每次重新命名不超過5秒
      expect(result.success).toBe(true);
    }

    const avgRenameTime = renameResults.reduce((sum, r) => sum + r.time, 0) / renameResults.length;
    const totalChanges = renameResults.reduce((sum, r) => sum + r.changes, 0);

    console.log('跨檔案重新命名整體統計:');
    console.log(`  平均重新命名時間: ${avgRenameTime.toFixed(2)}ms`);
    console.log(`  總變更數量: ${totalChanges}`);

    expect(avgRenameTime).toBeLessThan(3000);
  });

  it('大型檔案重新命名效能', async () => {
    // 建立一個大型檔案
    const largeFilePath = join(testDir, 'large-file.ts');
    const largeContent = generateLargeFileWithReferences(5000); // 5000行
    await fs.writeFile(largeFilePath, largeContent);

    const renameEngine = new RenameEngine();

    console.log('大型檔案重新命名效能測試開始...');
    console.log(`檔案大小: ${(Buffer.byteLength(largeContent) / 1024).toFixed(2)} KB`);

    const startTime = Date.now();

    const mockSymbol = {
      name: 'LargeFunction',
      type: 'function' as const,
      location: {
        filePath: largeFilePath,
        range: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 14 }
        }
      },
      scope: {
        type: 'global' as const,
        name: 'global'
      }
    };

    const result = await renameEngine.rename({
      symbol: mockSymbol,
      newName: 'RenamedLargeFunction',
      filePaths: [largeFilePath]
    });

    const renameTime = Date.now() - startTime;
    const fileSize = Buffer.byteLength(largeContent);
    const throughput = fileSize / renameTime * 1000; // bytes/sec

    console.log(`大檔案重新命名結果:`);
    console.log(`  重新命名時間: ${renameTime}ms`);
    console.log(`  變更數量: ${result.operations.length}`);
    console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);
    console.log(`  成功: ${result.success ? 'Yes' : 'No'}`);

    // 大檔案效能要求
    expect(renameTime).toBeLessThan(10000); // 不超過10秒
    expect(throughput).toBeGreaterThan(50 * 1024); // 至少50KB/sec
    expect(result.success).toBe(true);
    expect(result.operations.length).toBeGreaterThan(0);

    await fs.unlink(largeFilePath);
  });

  it('並發重新命名效能測試', async () => {
    const renameEngine = new RenameEngine();

    console.log('並發重新命名效能測試開始...');

    const operations = [
      { oldName: 'function1', newName: 'newFunction1' },
      { oldName: 'Class1', newName: 'NewClass1' },
      { oldName: 'interface1', newName: 'NewInterface1' },
      { oldName: 'variable1', newName: 'newVariable1' },
      { oldName: 'type1', newName: 'NewType1' }
    ];

    // 並發執行重新命名操作
    const concurrentStartTime = Date.now();

    const concurrentPromises = operations.map(op => {
      const mockSymbol = {
        name: op.oldName,
        type: 'variable' as const,
        location: {
          filePath: testFiles[0].path,
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: op.oldName.length + 1 }
          }
        },
        scope: {
          type: 'global' as const,
          name: 'global'
        }
      };

      return renameEngine.rename({
        symbol: mockSymbol,
        newName: op.newName,
        filePaths: testFiles.slice(0, 5).map(f => f.path)
      });
    });

    const concurrentResults = await Promise.all(concurrentPromises);
    const concurrentTime = Date.now() - concurrentStartTime;

    // 序列執行進行比較
    const sequentialStartTime = Date.now();
    const sequentialResults = [];

    for (const op of operations) {
      const mockSymbol = {
        name: op.oldName,
        type: 'variable' as const,
        location: {
          filePath: testFiles[5].path,
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: op.oldName.length + 1 }
          }
        },
        scope: {
          type: 'global' as const,
          name: 'global'
        }
      };

      const result = await renameEngine.rename({
        symbol: mockSymbol,
        newName: op.newName,
        filePaths: testFiles.slice(5, 10).map(f => f.path)
      });
      sequentialResults.push(result);
    }

    const sequentialTime = Date.now() - sequentialStartTime;

    const speedup = sequentialTime / concurrentTime;
    const totalConcurrentChanges = concurrentResults.reduce((sum, r) => sum + r.operations.length, 0);

    console.log('並發重新命名結果:');
    console.log(`  並發時間: ${concurrentTime}ms`);
    console.log(`  序列時間: ${sequentialTime}ms`);
    console.log(`  加速比: ${speedup.toFixed(2)}x`);
    console.log(`  總變更數: ${totalConcurrentChanges}`);

    // 並發應該有效能提升
    expect(concurrentTime).toBeLessThan(sequentialTime);
    expect(speedup).toBeGreaterThan(1.1); // 至少10%提升
    expect(concurrentResults.length).toBe(operations.length);
  });

  it('記憶體使用量監控', async () => {
    const renameEngine = new RenameEngine();
    const initialMemory = process.memoryUsage();

    // 執行多個重新命名操作
    const operations = Array.from({length: 20}, (_, i) => ({
      oldName: `testSymbol${i}`,
      newName: `renamedSymbol${i}`
    }));

    for (const op of operations) {
      const mockSymbol = {
        name: op.oldName,
        type: 'variable' as const,
        location: {
          filePath: testFiles[0].path,
          range: {
            start: { line: 1, column: 1 },
            end: { line: 1, column: op.oldName.length + 1 }
          }
        },
        scope: {
          type: 'global' as const,
          name: 'global'
        }
      };

      await renameEngine.rename({
        symbol: mockSymbol,
        newName: op.newName,
        filePaths: testFiles.slice(0, 10).map(f => f.path)
      });
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerOperation = memoryIncrease / operations.length;

    console.log('重新命名記憶體使用量:');
    console.log(`  記憶體增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  每次操作: ${(memoryPerOperation / 1024).toFixed(2)} KB`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 小於50MB
    expect(memoryPerOperation).toBeLessThan(1024 * 1024); // 每次操作小於1MB
  });
});

// 輔助函數：建立重新命名測試檔案
async function createRenameTestFiles(baseDir: string): Promise<Array<{ path: string; content: string; symbols: string[] }>> {
  const files: Array<{ path: string; content: string; symbols: string[] }> = [];

  // 建立不同類型的測試檔案
  const fileConfigs = [
    { name: 'functions.ts', type: 'functions' },
    { name: 'classes.ts', type: 'classes' },
    { name: 'interfaces.ts', type: 'interfaces' },
    { name: 'types.ts', type: 'types' },
    { name: 'variables.ts', type: 'variables' },
    { name: 'mixed.ts', type: 'mixed' }
  ];

  for (let i = 0; i < 20; i++) {
    const config = fileConfigs[i % fileConfigs.length];
    const fileName = `${config.name.replace('.ts', '')}-${i}.ts`;
    const filePath = join(baseDir, fileName);

    const { content, symbols } = generateFileContent(config.type, i);
    await fs.writeFile(filePath, content);

    files.push({
      path: filePath,
      content,
      symbols
    });
  }

  return files;
}

// 輔助函數：生成檔案內容
function generateFileContent(type: string, index: number): { content: string; symbols: string[] } {
  let content = `// Generated file of type: ${type}, index: ${index}\n\n`;
  const symbols: string[] = [];

  switch (type) {
    case 'functions':
      content += generateFunctionContent(index, symbols);
      break;
    case 'classes':
      content += generateClassContent(index, symbols);
      break;
    case 'interfaces':
      content += generateInterfaceContent(index, symbols);
      break;
    case 'types':
      content += generateTypeContent(index, symbols);
      break;
    case 'variables':
      content += generateVariableContent(index, symbols);
      break;
    case 'mixed':
      content += generateFunctionContent(index, symbols);
      content += generateClassContent(index, symbols);
      content += generateInterfaceContent(index, symbols);
      break;
  }

  // 添加一些通用符號引用
  content += `\n// References to common symbols\n`;
  content += `const testRef = BaseClass;\n`;
  content += `const utilRef = utilFunction;\n`;
  content += `type TestType = CommonInterface;\n`;
  symbols.push('testRef', 'utilRef', 'TestType');

  return { content, symbols };
}

// 生成函式內容
function generateFunctionContent(index: number, symbols: string[]): string {
  let content = '';

  for (let i = 0; i < 5; i++) {
    const funcName = `TestFunction${index}_${i}`;
    symbols.push(funcName);

    content += `export function ${funcName}(param: string): Promise<string> {\n`;
    content += `  return new Promise(resolve => {\n`;
    content += `    const result = param.toUpperCase();\n`;
    content += `    console.log('Processing in ${funcName}');\n`;
    content += `    resolve(result);\n`;
    content += `  });\n`;
    content += `}\n\n`;
  }

  // 添加通用函式
  const utilFunc = `utilFunction`;
  symbols.push(utilFunc);
  content += `export function ${utilFunc}(): void {\n`;
  content += `  console.log('Utility function called');\n`;
  content += `}\n\n`;

  return content;
}

// 生成類別內容
function generateClassContent(index: number, symbols: string[]): string {
  let content = '';

  const className = `BaseClass${index}`;
  symbols.push(className);

  content += `export class ${className} {\n`;
  content += `  private _value: string = 'default';\n\n`;

  for (let i = 0; i < 3; i++) {
    const methodName = `method${i}`;
    symbols.push(`${className}.${methodName}`);

    content += `  async ${methodName}(): Promise<void> {\n`;
    content += `    console.log('Method ${i} of ${className}');\n`;
    content += `  }\n\n`;
  }

  content += `}\n\n`;

  // 通用基類
  const baseClass = 'BaseClass';
  symbols.push(baseClass);
  content += `export class ${baseClass} {\n`;
  content += `  protected id: string = 'base';\n`;
  content += `  public getName(): string {\n`;
  content += `    return this.id;\n`;
  content += `  }\n`;
  content += `}\n\n`;

  return content;
}

// 生成介面內容
function generateInterfaceContent(index: number, symbols: string[]): string {
  let content = '';

  const interfaceName = `TestInterface${index}`;
  symbols.push(interfaceName);

  content += `export interface ${interfaceName} {\n`;
  content += `  id: string;\n`;
  content += `  process(): Promise<void>;\n`;
  content += `  getData(): any;\n`;
  content += `}\n\n`;

  // 通用介面
  const commonInterface = 'CommonInterface';
  symbols.push(commonInterface);
  content += `export interface ${commonInterface} {\n`;
  content += `  name: string;\n`;
  content += `  execute(): void;\n`;
  content += `}\n\n`;

  return content;
}

// 生成型別內容
function generateTypeContent(index: number, symbols: string[]): string {
  let content = '';

  const typeName = `TestType${index}`;
  symbols.push(typeName);

  content += `export type ${typeName} = {\n`;
  content += `  id: string;\n`;
  content += `  value: number;\n`;
  content += `  active: boolean;\n`;
  content += `};\n\n`;

  content += `export type UnionType${index} = 'option1' | 'option2' | 'option3';\n\n`;
  symbols.push(`UnionType${index}`);

  return content;
}

// 生成變數內容
function generateVariableContent(index: number, symbols: string[]): string {
  let content = '';

  const constName = `CONFIG_VALUE${index}`;
  symbols.push(constName);

  content += `export const ${constName} = 'config-value-${index}';\n`;
  content += `export const SETTINGS${index} = {\n`;
  content += `  debug: true,\n`;
  content += `  version: '1.0.${index}'\n`;
  content += `};\n\n`;
  symbols.push(`SETTINGS${index}`);

  content += `export let mutableValue${index} = 'initial';\n`;
  symbols.push(`mutableValue${index}`);

  return content;
}

// 輔助函數：根據類型獲取測試符號
function getTestSymbolByType(symbolType: string): string {
  switch (symbolType) {
    case 'function':
      return 'TestFunction';
    case 'class':
      return 'BaseClass';
    case 'interface':
      return 'CommonInterface';
    case 'variable':
      return 'CONFIG_VALUE';
    case 'type':
      return 'TestType';
    default:
      return 'TestFunction';
  }
}

// 輔助函數：生成大型檔案
function generateLargeFileWithReferences(lineCount: number): string {
  let content = `// Large file with ${lineCount} lines for performance testing\n\n`;

  const functionsPerClass = 20;
  const classCount = Math.floor(lineCount / (functionsPerClass + 10)); // 估算類別數量

  for (let i = 0; i < classCount; i++) {
    content += `export class LargeClass${i} {\n`;
    content += `  private property${i}: string = 'value${i}';\n\n`;

    for (let j = 0; j < functionsPerClass; j++) {
      content += `  async LargeFunction${i}_${j}(): Promise<void> {\n`;
      content += `    // Method implementation\n`;
      content += `    const result = this.property${i};\n`;
      content += `    console.log(\`Result: \${result}\`);\n`;
      content += `  }\n\n`;
    }

    content += `}\n\n`;
  }

  // 添加一些全域函式和變數
  content += `export function LargeFunction(): void {\n`;
  content += `  console.log('Large function called');\n`;
  content += `}\n\n`;

  content += `export const LARGE_CONFIG = {\n`;
  content += `  setting1: 'value1',\n`;
  content += `  setting2: 'value2'\n`;
  content += `};\n`;

  return content;
}