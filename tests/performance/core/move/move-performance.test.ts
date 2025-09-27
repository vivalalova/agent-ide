/**
 * Move 模組效能基準測試
 * 測試檔案移動和 import 路徑更新的效能表現
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MoveService } from '../../../../src/core/move/move-service';
import { ImportResolver } from '../../../../src/core/move/import-resolver';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('檔案移動模組效能基準測試', () => {
  let testDir: string;
  let testProject: { files: string[]; structure: Map<string, string[]> };

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-move-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testProject = await createMoveTestProject(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('Import 路徑解析效能測試', async () => {
    const resolver = new ImportResolver();

    console.log('Import 路徑解析效能測試開始...');
    console.log(`測試檔案數量: ${testProject.files.length}`);

    const analysisResults: Array<{ file: string; imports: number; time: number }> = [];

    for (const filePath of testProject.files) {
      const content = await fs.readFile(filePath, 'utf-8');

      const startTime = Date.now();

      const imports = await resolver.analyzeImports(filePath, content);

      const analysisTime = Date.now() - startTime;
      const fileSize = Buffer.byteLength(content);
      const throughput = fileSize / analysisTime * 1000; // bytes/sec

      analysisResults.push({
        file: filePath,
        imports: imports.length,
        time: analysisTime
      });

      console.log(`檔案: ${filePath.split('/').pop()}`);
      console.log(`  大小: ${(fileSize / 1024).toFixed(2)} KB`);
      console.log(`  Import 數量: ${imports.length}`);
      console.log(`  分析時間: ${analysisTime}ms`);
      console.log(`  處理速度: ${(throughput / 1024).toFixed(2)} KB/sec`);

      // 效能要求
      expect(analysisTime).toBeLessThan(500); // 每個檔案分析不超過500ms
      expect(throughput).toBeGreaterThan(200 * 1024); // 至少200KB/sec
    }

    const totalTime = analysisResults.reduce((sum, r) => sum + r.time, 0);
    const totalImports = analysisResults.reduce((sum, r) => sum + r.imports, 0);
    const avgTime = totalTime / analysisResults.length;

    console.log('Import 分析整體統計:');
    console.log(`  總時間: ${totalTime}ms`);
    console.log(`  總 Import 數: ${totalImports}`);
    console.log(`  平均時間: ${avgTime.toFixed(2)}ms`);
    console.log(`  分析速率: ${(analysisResults.length / totalTime * 1000).toFixed(2)} files/sec`);

    expect(avgTime).toBeLessThan(200);
    expect(totalImports).toBeGreaterThan(0);
  });

  it('路徑更新效能測試', async () => {
    const resolver = new ImportResolver();

    console.log('路徑更新效能測試開始...');

    // 模擬檔案移動場景
    const moveScenarios = [
      {
        from: join(testDir, 'src', 'utils', 'helper.ts'),
        to: join(testDir, 'src', 'common', 'helper.ts')
      },
      {
        from: join(testDir, 'src', 'services', 'api.ts'),
        to: join(testDir, 'lib', 'api.ts')
      },
      {
        from: join(testDir, 'src', 'types', 'index.ts'),
        to: join(testDir, 'src', 'shared', 'types.ts')
      }
    ];

    const updateResults: Array<{ scenario: any; time: number; affectedFiles: number; updates: number }> = [];

    for (const scenario of moveScenarios) {
      const startTime = Date.now();

      // 找出受影響的檔案
      const affectedFiles = [];
      const pathUpdates = [];

      for (const filePath of testProject.files) {
        const content = await fs.readFile(filePath, 'utf-8');
        const imports = await resolver.analyzeImports(filePath, content);

        // 檢查是否需要更新 import 路徑
        for (const imp of imports) {
          if (imp.resolvedPath === scenario.from) {
            affectedFiles.push(filePath);
            const updatedPath = await resolver.updateImportPath(
              filePath,
              scenario.from,
              scenario.to
            );
            pathUpdates.push(updatedPath);
            break;
          }
        }
      }

      const updateTime = Date.now() - startTime;

      updateResults.push({
        scenario,
        time: updateTime,
        affectedFiles: affectedFiles.length,
        updates: pathUpdates.length
      });

      console.log(`移動: ${scenario.from.split('/').pop()} -> ${scenario.to.split('/').pop()}`);
      console.log(`  更新時間: ${updateTime}ms`);
      console.log(`  影響檔案: ${affectedFiles.length}`);
      console.log(`  路徑更新: ${pathUpdates.length}`);

      // 效能要求
      expect(updateTime).toBeLessThan(2000); // 路徑更新不超過2秒
      expect(affectedFiles.length).toBeGreaterThanOrEqual(0);
    }

    const avgUpdateTime = updateResults.reduce((sum, r) => sum + r.time, 0) / updateResults.length;
    const totalUpdates = updateResults.reduce((sum, r) => sum + r.updates, 0);

    console.log('路徑更新整體統計:');
    console.log(`  平均更新時間: ${avgUpdateTime.toFixed(2)}ms`);
    console.log(`  總更新數量: ${totalUpdates}`);

    expect(avgUpdateTime).toBeLessThan(1000);
  });

  it('檔案移動服務效能測試', async () => {
    const moveService = new MoveService();

    console.log('檔案移動服務效能測試開始...');

    // 執行多個移動操作
    const moveOperations = [
      {
        source: join(testDir, 'src', 'components', 'button.ts'),
        target: join(testDir, 'src', 'ui', 'button.ts')
      },
      {
        source: join(testDir, 'src', 'services', 'database.ts'),
        target: join(testDir, 'lib', 'database.ts')
      },
      {
        source: join(testDir, 'src', 'utils', 'formatter.ts'),
        target: join(testDir, 'src', 'helpers', 'formatter.ts')
      }
    ];

    const moveResults: Array<{ operation: any; time: number; success: boolean; updatedFiles: number }> = [];

    for (const operation of moveOperations) {
      const startTime = Date.now();

      const result = await moveService.moveFile(
        operation.source,
        operation.target,
        { updateReferences: true }
      );

      const moveTime = Date.now() - startTime;

      moveResults.push({
        operation,
        time: moveTime,
        success: result.success,
        updatedFiles: result.updatedFiles?.length || 0
      });

      console.log(`移動檔案: ${operation.source.split('/').pop()}`);
      console.log(`  目標: ${operation.target}`);
      console.log(`  時間: ${moveTime}ms`);
      console.log(`  成功: ${result.success ? 'Yes' : 'No'}`);
      console.log(`  更新檔案: ${result.updatedFiles?.length || 0}`);

      if (!result.success) {
        console.log(`  錯誤: ${result.error}`);
      }

      // 效能要求
      expect(moveTime).toBeLessThan(3000); // 檔案移動不超過3秒
    }

    const avgMoveTime = moveResults.reduce((sum, r) => sum + r.time, 0) / moveResults.length;
    const successfulMoves = moveResults.filter(r => r.success).length;
    const totalUpdatedFiles = moveResults.reduce((sum, r) => sum + r.updatedFiles, 0);

    console.log('檔案移動整體統計:');
    console.log(`  平均移動時間: ${avgMoveTime.toFixed(2)}ms`);
    console.log(`  成功移動: ${successfulMoves}/${moveOperations.length}`);
    console.log(`  總更新檔案: ${totalUpdatedFiles}`);

    expect(avgMoveTime).toBeLessThan(2000);
    expect(successfulMoves).toBeGreaterThan(0);
  });

  it('批次移動效能測試', async () => {
    const moveService = new MoveService();

    console.log('批次移動效能測試開始...');

    // 準備批次移動操作
    const sourceDir = join(testDir, 'src', 'components');
    const targetDir = join(testDir, 'src', 'ui');

    // 確保目標目錄存在
    await fs.mkdir(targetDir, { recursive: true });

    // 獲取要移動的檔案
    const sourceFiles = testProject.files
      .filter(f => f.startsWith(sourceDir))
      .slice(0, 5); // 移動前5個檔案

    const batchOperations = sourceFiles.map(sourceFile => ({
      source: sourceFile,
      target: sourceFile.replace(sourceDir, targetDir)
    }));

    const batchStartTime = Date.now();

    // 執行批次移動
    const batchResults = await Promise.all(
      batchOperations.map(op =>
        moveService.moveFile(op.source, op.target, { updateReferences: true })
      )
    );

    const batchTime = Date.now() - batchStartTime;

    const successfulBatchMoves = batchResults.filter(r => r.success).length;
    const totalBatchUpdates = batchResults.reduce((sum, r) => sum + (r.updatedFiles?.length || 0), 0);

    console.log(`批次移動結果 (${batchOperations.length}個檔案):`);
    console.log(`  批次時間: ${batchTime}ms`);
    console.log(`  平均時間: ${(batchTime / batchOperations.length).toFixed(2)}ms`);
    console.log(`  成功移動: ${successfulBatchMoves}/${batchOperations.length}`);
    console.log(`  總更新檔案: ${totalBatchUpdates}`);
    console.log(`  處理速度: ${(batchOperations.length / batchTime * 1000).toFixed(2)} files/sec`);

    // 批次移動效能要求
    expect(batchTime).toBeLessThan(10000); // 批次移動不超過10秒
    expect(batchTime / batchOperations.length).toBeLessThan(2000); // 平均每檔案不超過2秒
    expect(successfulBatchMoves).toBeGreaterThan(0);
  });

  it('大型專案移動效能測試', async () => {
    // 建立大型專案結構
    const largeProject = await createLargeProjectForMove(testDir);

    console.log('大型專案移動效能測試開始...');
    console.log(`大型專案檔案數: ${largeProject.files.length}`);

    const moveService = new MoveService();
    const resolver = new ImportResolver();

    // 分析所有檔案的 import 關係
    const analysisStartTime = Date.now();
    const importMap = new Map<string, any[]>();

    for (const filePath of largeProject.files) {
      const content = await fs.readFile(filePath, 'utf-8');
      const imports = await resolver.analyzeImports(filePath, content);
      importMap.set(filePath, imports);
    }

    const analysisTime = Date.now() - analysisStartTime;

    // 執行一個複雜的移動操作
    const complexMoveStartTime = Date.now();

    const sourceFile = largeProject.files.find(f => f.includes('core')) || largeProject.files[0];
    const targetFile = sourceFile.replace('core', 'shared');

    const moveResult = await moveService.moveFile(sourceFile, targetFile, {
      updateReferences: true
    });

    const complexMoveTime = Date.now() - complexMoveStartTime;

    const totalImports = Array.from(importMap.values()).reduce((sum, imports) => sum + imports.length, 0);

    console.log(`大型專案移動結果:`);
    console.log(`  分析時間: ${analysisTime}ms`);
    console.log(`  移動時間: ${complexMoveTime}ms`);
    console.log(`  總檔案數: ${largeProject.files.length}`);
    console.log(`  總 Import 數: ${totalImports}`);
    console.log(`  移動成功: ${moveResult.success ? 'Yes' : 'No'}`);
    console.log(`  更新檔案: ${moveResult.updatedFiles?.length || 0}`);
    console.log(`  分析速度: ${(largeProject.files.length / analysisTime * 1000).toFixed(2)} files/sec`);

    // 大型專案效能要求
    expect(analysisTime).toBeLessThan(10000); // 分析時間不超過10秒
    expect(complexMoveTime).toBeLessThan(5000); // 移動時間不超過5秒
    expect(totalImports).toBeGreaterThan(0);

    // 清理大型專案檔案
    for (const file of largeProject.files) {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('記憶體使用量監控', async () => {
    const moveService = new MoveService();
    const resolver = new ImportResolver();

    const initialMemory = process.memoryUsage();

    // 執行多個移動操作
    const operations = testProject.files.slice(0, 10).map((file, i) => ({
      source: file,
      target: file.replace('src', `moved-${i}`)
    }));

    for (const op of operations) {
      await resolver.analyzeImports(op.source, await fs.readFile(op.source, 'utf-8'));
      // 注意：這裡不實際執行移動，只分析以避免破壞測試結構
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerOperation = memoryIncrease / operations.length;

    console.log('移動操作記憶體使用量:');
    console.log(`  記憶體增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  每次操作: ${(memoryPerOperation / 1024).toFixed(2)} KB`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 小於100MB
    expect(memoryPerOperation).toBeLessThan(2 * 1024 * 1024); // 每次操作小於2MB
  });
});

// 輔助函數：建立移動測試專案
async function createMoveTestProject(baseDir: string): Promise<{ files: string[]; structure: Map<string, string[]> }> {
  const structure = new Map<string, string[]>();
  const files: string[] = [];

  // 建立目錄結構
  const directories = [
    'src/components',
    'src/services',
    'src/utils',
    'src/types',
    'lib',
    'shared'
  ];

  for (const dir of directories) {
    const dirPath = join(baseDir, dir);
    await fs.mkdir(dirPath, { recursive: true });
    structure.set(dir, []);
  }

  // 建立檔案
  const fileConfigs = [
    { dir: 'src/components', files: ['button.ts', 'modal.ts', 'form.ts'] },
    { dir: 'src/services', files: ['api.ts', 'database.ts', 'auth.ts'] },
    { dir: 'src/utils', files: ['helper.ts', 'formatter.ts', 'validator.ts'] },
    { dir: 'src/types', files: ['index.ts', 'api.ts', 'user.ts'] },
    { dir: 'lib', files: ['core.ts'] },
    { dir: 'shared', files: ['constants.ts'] }
  ];

  for (const config of fileConfigs) {
    const dirFiles: string[] = [];

    for (const fileName of config.files) {
      const filePath = join(baseDir, config.dir, fileName);
      const content = generateFileWithImports(fileName, config.dir, baseDir);

      await fs.writeFile(filePath, content);
      files.push(filePath);
      dirFiles.push(fileName);
    }

    structure.set(config.dir, dirFiles);
  }

  return { files, structure };
}

// 輔助函數：建立大型專案
async function createLargeProjectForMove(baseDir: string): Promise<{ files: string[] }> {
  const largeDir = join(baseDir, 'large-move');
  await fs.mkdir(largeDir, { recursive: true });

  const files: string[] = [];
  const modules = ['core', 'ui', 'api', 'utils', 'types'];

  for (const module of modules) {
    const moduleDir = join(largeDir, module);
    await fs.mkdir(moduleDir, { recursive: true });

    // 每個模組建立20個檔案
    for (let i = 0; i < 20; i++) {
      const fileName = `${module}-${i}.ts`;
      const filePath = join(moduleDir, fileName);

      const content = generateComplexFileWithImports(fileName, module, i);
      await fs.writeFile(filePath, content);
      files.push(filePath);
    }
  }

  return { files };
}

// 輔助函數：生成包含 import 的檔案
function generateFileWithImports(fileName: string, directory: string, baseDir: string): string {
  const baseName = fileName.replace('.ts', '');
  let content = `// Generated file: ${fileName} in ${directory}\n\n`;

  // 生成不同類型的 import
  const imports = [];

  // 相對路徑 import
  if (directory === 'src/components') {
    imports.push(`import { helper } from '../utils/helper';`);
    imports.push(`import { ApiService } from '../services/api';`);
    imports.push(`import type { User } from '../types/user';`);
  } else if (directory === 'src/services') {
    imports.push(`import { validator } from '../utils/validator';`);
    imports.push(`import type { ApiType } from '../types/api';`);
  } else if (directory === 'src/utils') {
    imports.push(`import { CONSTANTS } from '../../shared/constants';`);
  } else if (directory === 'src/types') {
    imports.push(`import { core } from '../../lib/core';`);
  }

  // 外部套件 import
  imports.push(`import { join } from 'path';`);
  imports.push(`import { readFile } from 'fs/promises';`);

  content += imports.join('\n') + '\n\n';

  // 生成內容
  content += `export interface I${baseName.charAt(0).toUpperCase() + baseName.slice(1)} {\n`;
  content += `  id: string;\n`;
  content += `  process(): Promise<void>;\n`;
  content += `}\n\n`;

  content += `export class ${baseName.charAt(0).toUpperCase() + baseName.slice(1)} implements I${baseName.charAt(0).toUpperCase() + baseName.slice(1)} {\n`;
  content += `  constructor(public readonly id: string = '${baseName}') {}\n\n`;
  content += `  async process(): Promise<void> {\n`;
  content += `    console.log(\`Processing \${this.id}\`);\n`;

  // 使用導入的依賴
  if (imports.some(imp => imp.includes('helper'))) {
    content += `    await helper.doSomething();\n`;
  }
  if (imports.some(imp => imp.includes('validator'))) {
    content += `    validator.validate(this.id);\n`;
  }

  content += `  }\n`;
  content += `}\n\n`;

  content += `export const ${baseName}Instance = new ${baseName.charAt(0).toUpperCase() + baseName.slice(1)}();\n`;

  return content;
}

// 輔助函數：生成複雜的檔案內容
function generateComplexFileWithImports(fileName: string, module: string, index: number): string {
  const baseName = fileName.replace('.ts', '');
  let content = `// Complex generated file: ${fileName}\n\n`;

  // 生成複雜的 import 結構
  const imports = [];

  // 模組內 import
  for (let i = 0; i < 3; i++) {
    if (i !== index) { // 避免自己 import 自己
      imports.push(`import { ${module}${i}Function } from './${module}-${i}';`);
    }
  }

  // 跨模組 import
  const otherModules = ['core', 'ui', 'api', 'utils', 'types'].filter(m => m !== module);
  for (const otherModule of otherModules.slice(0, 2)) {
    imports.push(`import { ${otherModule}Util } from '../${otherModule}/${otherModule}-0';`);
  }

  content += imports.join('\n') + '\n\n';

  // 生成類別和函式
  content += `export class ${baseName.charAt(0).toUpperCase() + baseName.slice(1)}Class {\n`;
  content += `  private data: Map<string, any> = new Map();\n\n`;

  for (let i = 0; i < 5; i++) {
    content += `  async method${i}(): Promise<void> {\n`;
    content += `    // Method implementation ${i}\n`;
    content += `    this.data.set('key${i}', 'value${i}');\n`;
    content += `  }\n\n`;
  }

  content += `}\n\n`;

  content += `export function ${baseName}Function(): string {\n`;
  content += `  return 'Function from ${baseName}';\n`;
  content += `}\n\n`;

  content += `export const ${baseName}Config = {\n`;
  content += `  name: '${baseName}',\n`;
  content += `  version: '1.0.${index}',\n`;
  content += `  module: '${module}'\n`;
  content += `};\n`;

  return content;
}