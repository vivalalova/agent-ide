/**
 * 完整工作流整合測試
 * 測試從索引到分析到重構的完整流程
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexEngine } from '@core/indexing/index-engine';
import { RenameEngine } from '@core/rename/rename-engine';
import { ParserRegistry } from '@infrastructure/parser/registry';
import { DependencyGraph } from '@core/dependency/dependency-graph';
import { MaintainabilityIndex } from '@core/analysis/quality-metrics';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import type { IndexConfig } from '@core/indexing/types';

describe('Full Workflow Integration', () => {
  let indexEngine: IndexEngine;
  let renameEngine: RenameEngine;
  let dependencyGraph: DependencyGraph;
  let tempDir: string;
  let testConfig: IndexConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    // 重置 ParserRegistry
    ParserRegistry.resetInstance();

    // 創建臨時目錄
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'agent-ide-test-'));

    // 創建測試配置
    testConfig = {
      workspacePath: tempDir,
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: false,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    // 創建依賴圖
    dependencyGraph = new DependencyGraph();
  });

  afterEach(async () => {
    // 清理引擎
    if (indexEngine) {
      indexEngine.dispose();
    }

    // 清理 ParserRegistry
    ParserRegistry.resetInstance();

    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('清理臨時目錄失敗:', error);
    }
  });

  it('應該支援完整的索引 → 搜尋 → 重命名工作流', async () => {
    // 步驟 1: 創建測試專案結構
    const srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    const userModelPath = path.join(srcDir, 'user-model.ts');
    const userServicePath = path.join(srcDir, 'user-service.ts');
    const indexPath = path.join(srcDir, 'index.ts');

    await fs.writeFile(
      userModelPath,
      `export interface User {
        id: number;
        name: string;
        email: string;
      }`
    );

    await fs.writeFile(
      userServicePath,
      `import { User } from './user-model';

      export class UserService {
        async getUser(id: number): Promise<User> {
          return { id, name: 'Test', email: 'test@example.com' };
        }

        async createUser(name: string, email: string): Promise<User> {
          return { id: 1, name, email };
        }
      }`
    );

    await fs.writeFile(
      indexPath,
      `export { User } from './user-model';
      export { UserService } from './user-service';`
    );

    // 步驟 2: 索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    const stats = await indexEngine.getStats();
    expect(stats.indexedFiles).toBe(3);
    expect(stats.totalSymbols).toBeGreaterThan(0);

    // 步驟 3: 搜尋符號
    const searchResults = await indexEngine.findSymbol('User');
    expect(searchResults.length).toBeGreaterThan(0);

    // 步驟 4: 重命名符號
    const registry = ParserRegistry.getInstance();
    renameEngine = new RenameEngine(registry);

    const userSymbols = await indexEngine.findSymbol('User');
    expect(userSymbols.length).toBeGreaterThan(0);

    const userSymbol = userSymbols[0].symbol;

    // 預覽重命名
    const preview = await renameEngine.previewRename({
      symbol: userSymbol,
      newName: 'UserModel',
      filePaths: [userModelPath, userServicePath, indexPath]
    });

    expect(preview.operations.length).toBeGreaterThan(0);
    expect(preview.conflicts.length).toBe(0);

    // 執行重命名
    const renameResult = await renameEngine.rename({
      symbol: userSymbol,
      newName: 'UserModel',
      filePaths: [userModelPath, userServicePath, indexPath]
    });

    expect(renameResult.success).toBe(true);

    // 步驟 5: 更新索引
    for (const affectedFile of renameResult.affectedFiles) {
      await indexEngine.updateFile(affectedFile);
    }

    // 步驟 6: 驗證重命名結果
    const newSymbols = await indexEngine.findSymbol('UserModel');
    expect(newSymbols.length).toBeGreaterThan(0);

    const oldSymbols = await indexEngine.findSymbol('User');
    expect(oldSymbols.length).toBe(0);
  });

  it('應該支援索引 → 依賴分析 → 影響範圍評估工作流', async () => {
    // 步驟 1: 創建具有依賴關係的檔案
    const moduleAPath = path.join(tempDir, 'module-a.ts');
    const moduleBPath = path.join(tempDir, 'module-b.ts');
    const moduleCPath = path.join(tempDir, 'module-c.ts');

    await fs.writeFile(
      moduleAPath,
      'export function functionA() { return "A"; }'
    );

    await fs.writeFile(
      moduleBPath,
      'import { functionA } from "./module-a"; export function functionB() { return functionA() + "B"; }'
    );

    await fs.writeFile(
      moduleCPath,
      'import { functionB } from "./module-b"; export function functionC() { return functionB() + "C"; }'
    );

    // 步驟 2: 索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 步驟 3: 建立依賴圖
    const allFiles = indexEngine.getAllIndexedFiles();
    for (const fileInfo of allFiles) {
      dependencyGraph.addNode(fileInfo.filePath);
    }

    // 添加依賴關係（簡化版本）
    dependencyGraph.addDependency(moduleBPath, moduleAPath);
    dependencyGraph.addDependency(moduleCPath, moduleBPath);

    // 步驟 4: 分析依賴關係
    const dependencies = dependencyGraph.getDependencies(moduleAPath);
    expect(dependencies).toBeDefined();

    const dependents = dependencyGraph.getDependents(moduleAPath);
    expect(dependents.length).toBeGreaterThan(0);

    // 步驟 5: 評估變更影響範圍
    // 如果修改 module-a，會影響 module-b 和 module-c
    const impactedFiles = new Set<string>();
    const queue = [moduleAPath];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      impactedFiles.add(current);

      const currentDependents = dependencyGraph.getDependents(current);
      queue.push(...currentDependents);
    }

    expect(impactedFiles.size).toBeGreaterThan(1);
    expect(impactedFiles.has(moduleBPath) || impactedFiles.has(moduleCPath)).toBe(true);
  });

  it('應該支援索引 → 品質分析 → 重構建議工作流', async () => {
    // 步驟 1: 創建需要重構的檔案
    const complexFilePath = path.join(tempDir, 'complex.ts');
    const complexCode = `
      export class ComplexService {
        // 複雜的方法
        processData(data: any[]): any[] {
          const result = [];
          for (let i = 0; i < data.length; i++) {
            if (data[i].status === 'active') {
              if (data[i].priority === 'high') {
                if (data[i].category === 'urgent') {
                  result.push({ ...data[i], processed: true });
                } else {
                  result.push({ ...data[i], processed: false });
                }
              } else {
                result.push(data[i]);
              }
            }
          }
          return result;
        }

        // 簡單的方法
        getId(): number {
          return 1;
        }
      }
    `;

    await fs.writeFile(complexFilePath, complexCode);

    // 步驟 2: 索引專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 步驟 3: 分析程式碼品質
    const maintainabilityCalculator = new MaintainabilityIndex();

    // 模擬程式碼度量（實際應該從 AST 提取）
    const metrics = {
      halsteadVolume: 350,
      cyclomaticComplexity: 8,
      linesOfCode: 20,
      methodCount: 2,
      fieldCount: 0,
      parameterCount: 1
    };

    const maintainabilityIndex = maintainabilityCalculator.calculate(metrics);
    const grade = maintainabilityCalculator.getGrade(maintainabilityIndex);

    expect(maintainabilityIndex).toBeGreaterThan(0);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(grade);

    // 步驟 4: 根據分析結果提供重構建議
    const suggestions: string[] = [];

    if (metrics.cyclomaticComplexity > 5) {
      suggestions.push('建議降低圈複雜度，將複雜邏輯拆分為多個方法');
    }

    if (metrics.linesOfCode > 15) {
      suggestions.push('方法過長，建議拆分為更小的方法');
    }

    if (grade === 'C' || grade === 'D' || grade === 'F') {
      suggestions.push('可維護性較低，建議進行重構');
    }

    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('應該支援多模組協作的端到端場景', async () => {
    // 步驟 1: 創建完整的應用程式結構
    const srcDir = path.join(tempDir, 'src');
    const modelsDir = path.join(srcDir, 'models');
    const servicesDir = path.join(srcDir, 'services');
    const utilsDir = path.join(srcDir, 'utils');

    await fs.mkdir(modelsDir, { recursive: true });
    await fs.mkdir(servicesDir, { recursive: true });
    await fs.mkdir(utilsDir, { recursive: true });

    // 創建模型檔案
    await fs.writeFile(
      path.join(modelsDir, 'product.ts'),
      `export interface Product {
        id: number;
        name: string;
        price: number;
      }`
    );

    // 創建工具檔案
    await fs.writeFile(
      path.join(utilsDir, 'helpers.ts'),
      `export function formatPrice(price: number): string {
        return \`$\${price.toFixed(2)}\`;
      }`
    );

    // 創建服務檔案
    await fs.writeFile(
      path.join(servicesDir, 'product-service.ts'),
      `import { Product } from '../models/product';
      import { formatPrice } from '../utils/helpers';

      export class ProductService {
        formatProductPrice(product: Product): string {
          return formatPrice(product.price);
        }
      }`
    );

    // 步驟 2: 索引整個專案
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    const stats = await indexEngine.getStats();
    expect(stats.indexedFiles).toBe(3);

    // 步驟 3: 搜尋跨模組的符號
    const productSymbols = await indexEngine.findSymbol('Product');
    const formatPriceSymbols = await indexEngine.findSymbol('formatPrice');

    expect(productSymbols.length).toBeGreaterThan(0);
    expect(formatPriceSymbols.length).toBeGreaterThan(0);

    // 步驟 4: 跨模組重命名
    const registry = ParserRegistry.getInstance();
    renameEngine = new RenameEngine(registry);

    const allFiles = indexEngine.getAllIndexedFiles().map(f => f.filePath);

    // 重命名 Product 為 ProductModel
    const productSymbol = productSymbols[0].symbol;
    const renameResult = await renameEngine.renameAcrossFiles(
      productSymbol,
      'ProductModel',
      allFiles
    );

    expect(renameResult.success).toBe(true);
    expect(renameResult.affectedFiles.length).toBeGreaterThan(0);

    // 步驟 5: 更新所有受影響檔案的索引
    for (const affectedFile of renameResult.affectedFiles) {
      await indexEngine.updateFile(affectedFile);
    }

    // 步驟 6: 驗證跨模組引用已更新
    const newProductSymbols = await indexEngine.findSymbol('ProductModel');
    expect(newProductSymbols.length).toBeGreaterThan(0);

    const oldProductSymbols = await indexEngine.findSymbol('Product');
    expect(oldProductSymbols.length).toBe(0);

    // 步驟 7: 驗證索引狀態一致性
    const finalStats = await indexEngine.getStats();
    expect(finalStats.indexedFiles).toBe(stats.indexedFiles);
  });

  it('應該處理大規模專案的完整工作流', async () => {
    // 步驟 1: 創建大量檔案模擬大專案
    const fileCount = 20;
    const files: string[] = [];

    for (let i = 0; i < fileCount; i++) {
      const filePath = path.join(tempDir, `module-${i}.ts`);
      const content = `
        export interface Data${i} {
          id: number;
          value: string;
        }

        export class Service${i} {
          process(data: Data${i}): string {
            return data.value;
          }
        }

        export function helper${i}(): void {
          console.log('Helper ${i}');
        }
      `;

      await fs.writeFile(filePath, content);
      files.push(filePath);
    }

    // 步驟 2: 批次索引
    const startTime = Date.now();
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();
    const indexTime = Date.now() - startTime;

    console.log(`索引 ${fileCount} 個檔案耗時: ${indexTime}ms`);

    // 步驟 3: 驗證索引完整性
    const stats = await indexEngine.getStats();
    expect(stats.indexedFiles).toBe(fileCount);
    expect(stats.totalSymbols).toBeGreaterThan(fileCount * 2); // 每個檔案至少 2 個符號

    // 步驟 4: 批次搜尋
    const searchStartTime = Date.now();
    const allSymbols = await indexEngine.getAllSymbols();
    const searchTime = Date.now() - searchStartTime;

    console.log(`搜尋所有符號耗時: ${searchTime}ms`);
    expect(allSymbols.length).toBeGreaterThan(0);

    // 步驟 5: 驗證搜尋性能
    expect(searchTime).toBeLessThan(1000); // 搜尋應該在 1 秒內完成
  });

  it('應該支援錯誤恢復和一致性維護', async () => {
    // 步驟 1: 創建測試檔案
    const validFilePath = path.join(tempDir, 'valid.ts');
    const invalidFilePath = path.join(tempDir, 'invalid.ts');

    await fs.writeFile(
      validFilePath,
      'export function validFunction() { return "valid"; }'
    );

    await fs.writeFile(
      invalidFilePath,
      'export function broken( { return } // 語法錯誤'
    );

    // 步驟 2: 索引專案（應該容錯處理）
    indexEngine = new IndexEngine(testConfig);
    await indexEngine.indexProject();

    // 步驟 3: 驗證有效檔案已索引
    expect(indexEngine.isIndexed(validFilePath)).toBe(true);

    // 步驟 4: 檢查錯誤檔案
    const hasErrors = indexEngine.hasFileParseErrors(invalidFilePath);
    if (hasErrors) {
      const errors = indexEngine.getFileParseErrors(invalidFilePath);
      expect(errors.length).toBeGreaterThan(0);
    }

    // 步驟 5: 修復錯誤檔案
    await fs.writeFile(
      invalidFilePath,
      'export function fixed() { return "fixed"; }'
    );

    // 步驟 6: 重新索引
    await indexEngine.updateFile(invalidFilePath);

    // 步驟 7: 驗證修復後的檔案
    const fixedSymbols = await indexEngine.findSymbol('fixed');
    expect(fixedSymbols.length).toBeGreaterThan(0);

    // 步驟 8: 驗證整體一致性
    const stats = await indexEngine.getStats();
    expect(stats.indexedFiles).toBe(2);
  });
});
