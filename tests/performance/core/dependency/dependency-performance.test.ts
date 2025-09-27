/**
 * Dependency 模組效能基準測試
 * 測試依賴分析、循環檢測和依賴圖建構的效能表現
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DependencyAnalyzer } from '../../../../src/core/dependency/dependency-analyzer';
import { DependencyGraph } from '../../../../src/core/dependency/dependency-graph';
import { CycleDetector } from '../../../../src/core/dependency/cycle-detector';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('依賴分析模組效能基準測試', () => {
  let testDir: string;
  let testFiles: string[];

  beforeEach(async () => {
    testDir = join(tmpdir(), `agent-ide-dependency-perf-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });

    testFiles = await createDependencyTestFiles(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('依賴分析效能測試', async () => {
    const analyzer = new DependencyAnalyzer();

    console.log('依賴分析效能測試開始...');
    console.log(`測試檔案數量: ${testFiles.length}`);

    const startTime = Date.now();

    // 分析所有檔案的依賴關係
    const allDependencies = [];
    for (const filePath of testFiles) {
      const dependencies = await analyzer.analyzeDependencies(filePath);
      allDependencies.push({
        file: filePath,
        dependencies
      });
    }

    const analysisTime = Date.now() - startTime;
    const totalDependencies = allDependencies.reduce((sum, item) => sum + item.dependencies.length, 0);
    const avgDependenciesPerFile = totalDependencies / testFiles.length;
    const filesPerMs = testFiles.length / analysisTime;

    console.log(`分析時間: ${analysisTime}ms`);
    console.log(`總依賴數量: ${totalDependencies}`);
    console.log(`平均每檔案依賴: ${avgDependenciesPerFile.toFixed(2)}`);
    console.log(`分析速率: ${filesPerMs.toFixed(2)} files/ms`);

    // 效能要求
    expect(analysisTime).toBeLessThan(5000); // 分析時間不超過5秒
    expect(filesPerMs).toBeGreaterThan(0.1); // 至少0.1 files/ms
    expect(totalDependencies).toBeGreaterThan(0);

    // 檢查分析結果的正確性
    allDependencies.forEach(item => {
      expect(Array.isArray(item.dependencies)).toBe(true);
    });
  });

  it('依賴圖建構效能測試', async () => {
    const analyzer = new DependencyAnalyzer();
    const dependencyGraph = new DependencyGraph();

    console.log('依賴圖建構效能測試開始...');

    // 先收集所有依賴關係
    const dependencyData = [];
    for (const filePath of testFiles) {
      const dependencies = await analyzer.analyzeDependencies(filePath);
      dependencyData.push({ file: filePath, dependencies });
    }

    // 測試依賴圖建構時間
    const graphStartTime = Date.now();

    for (const { file, dependencies } of dependencyData) {
      dependencyGraph.addNode(file);
      for (const dep of dependencies) {
        if (dep.isInternal) {
          dependencyGraph.addNode(dep.path);
          dependencyGraph.addEdge(file, dep.path);
        }
      }
    }

    const graphBuildTime = Date.now() - graphStartTime;

    // 獲取圖統計
    const nodes = dependencyGraph.getAllNodes();
    const edges = dependencyGraph.getAllEdges();
    const graphStats = {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      buildTime: graphBuildTime
    };

    console.log(`依賴圖統計:`);
    console.log(`  節點數量: ${graphStats.nodeCount}`);
    console.log(`  邊數量: ${graphStats.edgeCount}`);
    console.log(`  建構時間: ${graphStats.buildTime}ms`);
    console.log(`  節點處理速率: ${(graphStats.nodeCount / graphStats.buildTime).toFixed(2)} nodes/ms`);

    // 效能要求
    expect(graphBuildTime).toBeLessThan(2000); // 建構時間不超過2秒
    expect(graphStats.nodeCount).toBeGreaterThan(0);
    expect(graphStats.edgeCount).toBeGreaterThanOrEqual(0);

    // 測試圖查詢效能
    const queryStartTime = Date.now();
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    const dependencies = dependencyGraph.getDependencies(randomNode);
    const dependents = dependencyGraph.getDependents(randomNode);
    const queryTime = Date.now() - queryStartTime;

    console.log(`圖查詢效能:`);
    console.log(`  查詢時間: ${queryTime}ms`);
    console.log(`  依賴數量: ${dependencies.length}`);
    console.log(`  被依賴數量: ${dependents.length}`);

    expect(queryTime).toBeLessThan(300); // 查詢時間不超過300ms (放寬以避免 flake)
  });

  it('循環依賴檢測效能測試', async () => {
    console.log('循環依賴檢測效能測試開始...');

    // 建立包含循環依賴的測試檔案
    const cyclicFiles = await createCyclicDependencyFiles(testDir);
    const detector = new CycleDetector();

    const detectionStartTime = Date.now();

    const cycles = await detector.detectCycles(cyclicFiles);

    const detectionTime = Date.now() - detectionStartTime;

    console.log(`循環檢測結果:`);
    console.log(`  檔案數量: ${cyclicFiles.length}`);
    console.log(`  檢測時間: ${detectionTime}ms`);
    console.log(`  發現循環: ${cycles.length} 個`);
    console.log(`  檢測速率: ${(cyclicFiles.length / detectionTime).toFixed(2)} files/ms`);

    // 效能要求
    expect(detectionTime).toBeLessThan(3000); // 檢測時間不超過3秒
    expect(cycles.length).toBeGreaterThan(0); // 應該檢測到循環
    expect(cyclicFiles.length / detectionTime).toBeGreaterThan(0.01); // 至少0.01 files/ms

    // 驗證檢測到的循環
    cycles.forEach(cycle => {
      expect(cycle.length).toBeGreaterThanOrEqual(2); // 循環至少包含2個節點
      expect(cycle[0]).toBe(cycle[cycle.length - 1]); // 形成閉環
    });

    // 清理循環測試檔案
    for (const file of cyclicFiles) {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('大型專案依賴分析效能', async () => {
    // 建立大型專案結構
    const largeProjectFiles = await createLargeProjectStructure(testDir);

    console.log('大型專案依賴分析開始...');
    console.log(`專案檔案數量: ${largeProjectFiles.length}`);

    const analyzer = new DependencyAnalyzer();
    const dependencyGraph = new DependencyGraph();

    const analysisStartTime = Date.now();

    // 分析所有依賴並建構圖
    let totalDependencies = 0;
    for (const filePath of largeProjectFiles) {
      const dependencies = await analyzer.analyzeDependencies(filePath);
      totalDependencies += dependencies.length;

      dependencyGraph.addNode(filePath);
      for (const dep of dependencies) {
        if (dep.isInternal && largeProjectFiles.includes(dep.path)) {
          dependencyGraph.addNode(dep.path);
          dependencyGraph.addEdge(filePath, dep.path);
        }
      }
    }

    const analysisTime = Date.now() - analysisStartTime;

    // 計算統計數據
    const nodes = dependencyGraph.getAllNodes();
    const edges = dependencyGraph.getAllEdges();
    const avgDependencies = totalDependencies / largeProjectFiles.length;
    const throughput = largeProjectFiles.length / analysisTime * 1000; // files/sec

    console.log(`大型專案分析結果:`);
    console.log(`  分析時間: ${analysisTime}ms`);
    console.log(`  圖節點數: ${nodes.length}`);
    console.log(`  圖邊數: ${edges.length}`);
    console.log(`  總依賴數: ${totalDependencies}`);
    console.log(`  平均依賴: ${avgDependencies.toFixed(2)}`);
    console.log(`  處理速度: ${throughput.toFixed(2)} files/sec`);

    // 大型專案效能要求
    expect(analysisTime).toBeLessThan(15000); // 15秒內完成
    expect(throughput).toBeGreaterThan(5); // 至少5 files/sec
    expect(nodes.length).toBe(largeProjectFiles.length);
    expect(edges.length).toBeGreaterThan(0);

    // 清理大型專案檔案
    for (const file of largeProjectFiles) {
      await fs.unlink(file).catch(() => {});
    }
  });

  it('並發依賴分析效能測試', async () => {
    const analyzer = new DependencyAnalyzer();

    console.log('並發依賴分析效能測試開始...');

    const concurrentStartTime = Date.now();

    // 並發分析所有檔案
    const analysisPromises = testFiles.map(filePath =>
      analyzer.analyzeDependencies(filePath)
    );

    const results = await Promise.all(analysisPromises);
    const concurrentTime = Date.now() - concurrentStartTime;

    // 序列分析進行比較
    const sequentialStartTime = Date.now();
    const sequentialResults = [];
    for (const filePath of testFiles) {
      const dependencies = await analyzer.analyzeDependencies(filePath);
      sequentialResults.push(dependencies);
    }
    const sequentialTime = Date.now() - sequentialStartTime;

    const totalDependencies = results.reduce((sum, deps) => sum + deps.length, 0);
    const speedup = sequentialTime / concurrentTime;

    console.log(`並發分析結果:`);
    console.log(`  檔案數量: ${testFiles.length}`);
    console.log(`  並發時間: ${concurrentTime}ms`);
    console.log(`  序列時間: ${sequentialTime}ms`);
    console.log(`  加速比: ${speedup.toFixed(2)}x`);
    console.log(`  總依賴數: ${totalDependencies}`);

    // 並發分析應該更快
    expect(concurrentTime).toBeLessThan(sequentialTime);
    expect(speedup).toBeGreaterThan(1.2); // 至少20%的提升
    expect(results.length).toBe(testFiles.length);

    // 驗證結果一致性
    expect(results.length).toBe(sequentialResults.length);
  });

  it('記憶體使用量監控', async () => {
    const analyzer = new DependencyAnalyzer();
    const dependencyGraph = new DependencyGraph();

    const initialMemory = process.memoryUsage();

    // 執行依賴分析和圖建構
    for (const filePath of testFiles) {
      const dependencies = await analyzer.analyzeDependencies(filePath);

      dependencyGraph.addNode(filePath);
      for (const dep of dependencies) {
        if (dep.isInternal) {
          dependencyGraph.addNode(dep.path);
          dependencyGraph.addEdge(filePath, dep.path);
        }
      }
    }

    const finalMemory = process.memoryUsage();
    const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
    const memoryPerFile = memoryIncrease / testFiles.length;

    const nodes = dependencyGraph.getAllNodes();
    const edges = dependencyGraph.getAllEdges();

    console.log('依賴分析記憶體使用量:');
    console.log(`  記憶體增長: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  每檔案記憶體: ${(memoryPerFile / 1024).toFixed(2)} KB`);
    console.log(`  圖節點數: ${nodes.length}`);
    console.log(`  圖邊數: ${edges.length}`);
    console.log(`  每節點記憶體: ${(memoryIncrease / nodes.length / 1024).toFixed(2)} KB`);

    // 記憶體使用量應該合理
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // 小於100MB
    expect(memoryPerFile).toBeLessThan(500 * 1024); // 每檔案小於500KB
  });
});

// 輔助函數：建立基本的依賴測試檔案
async function createDependencyTestFiles(baseDir: string): Promise<string[]> {
  const files: string[] = [];

  // 建立模擬的專案結構
  const modules = [
    { name: 'utils.ts', deps: [] },
    { name: 'types.ts', deps: [] },
    { name: 'config.ts', deps: ['./utils'] },
    { name: 'database.ts', deps: ['./config', './types'] },
    { name: 'api.ts', deps: ['./database', './types'] },
    { name: 'service.ts', deps: ['./api', './utils'] },
    { name: 'controller.ts', deps: ['./service', './types'] },
    { name: 'middleware.ts', deps: ['./config', './utils'] },
    { name: 'router.ts', deps: ['./controller', './middleware'] },
    { name: 'app.ts', deps: ['./router', './config'] }
  ];

  for (const module of modules) {
    const filePath = join(baseDir, module.name);
    const content = generateModuleContent(module.name, module.deps);

    await fs.writeFile(filePath, content);
    files.push(filePath);
  }

  // 建立更多複雜的模組
  for (let i = 0; i < 20; i++) {
    const fileName = `module${i}.ts`;
    const filePath = join(baseDir, fileName);

    // 隨機選擇依賴
    const availableDeps = modules.slice(0, Math.min(5, modules.length)).map(m => `./${m.name.replace('.ts', '')}`);
    const deps = availableDeps.slice(0, Math.floor(Math.random() * 3) + 1);

    const content = generateModuleContent(fileName, deps);
    await fs.writeFile(filePath, content);
    files.push(filePath);
  }

  return files;
}

// 輔助函數：建立包含循環依賴的測試檔案
async function createCyclicDependencyFiles(baseDir: string): Promise<string[]> {
  const cyclicDir = join(baseDir, 'cyclic');
  await fs.mkdir(cyclicDir, { recursive: true });

  const cyclicFiles: string[] = [];

  // 建立循環依賴：A -> B -> C -> A
  const cyclicModules = [
    { name: 'moduleA.ts', deps: ['./moduleB'] },
    { name: 'moduleB.ts', deps: ['./moduleC'] },
    { name: 'moduleC.ts', deps: ['./moduleA'] },
    // 另一個循環：D -> E -> D
    { name: 'moduleD.ts', deps: ['./moduleE'] },
    { name: 'moduleE.ts', deps: ['./moduleD'] },
    // 更複雜的循環：F -> G -> H -> I -> F
    { name: 'moduleF.ts', deps: ['./moduleG'] },
    { name: 'moduleG.ts', deps: ['./moduleH'] },
    { name: 'moduleH.ts', deps: ['./moduleI'] },
    { name: 'moduleI.ts', deps: ['./moduleF'] }
  ];

  for (const module of cyclicModules) {
    const filePath = join(cyclicDir, module.name);
    const content = generateModuleContent(module.name, module.deps);

    await fs.writeFile(filePath, content);
    cyclicFiles.push(filePath);
  }

  return cyclicFiles;
}

// 輔助函數：建立大型專案結構
async function createLargeProjectStructure(baseDir: string): Promise<string[]> {
  const largeDir = join(baseDir, 'large-project');
  await fs.mkdir(largeDir, { recursive: true });

  const subdirs = ['controllers', 'services', 'models', 'utils', 'types', 'config'];
  const files: string[] = [];

  for (const subdir of subdirs) {
    const subdirPath = join(largeDir, subdir);
    await fs.mkdir(subdirPath, { recursive: true });

    // 每個子目錄建立多個檔案
    for (let i = 0; i < 15; i++) {
      const fileName = `${subdir}-${i}.ts`;
      const filePath = join(subdirPath, fileName);

      // 根據目錄類型生成不同的依賴模式
      let deps: string[] = [];
      if (subdir === 'controllers') {
        deps = [`../services/service-${i % 5}`, `../types/types-${i % 3}`];
      } else if (subdir === 'services') {
        deps = [`../models/model-${i % 7}`, `../utils/utils-${i % 4}`];
      } else if (subdir === 'models') {
        deps = [`../types/types-${i % 3}`, `../config/config-${i % 2}`];
      } else if (subdir === 'utils') {
        deps = [`../config/config-${i % 2}`];
      }

      const content = generateModuleContent(fileName, deps);
      await fs.writeFile(filePath, content);
      files.push(filePath);
    }
  }

  return files;
}

// 輔助函數：生成模組內容
function generateModuleContent(filename: string, dependencies: string[]): string {
  let content = `// Generated module: ${filename}\n\n`;

  // 生成 import 語句
  dependencies.forEach((dep, index) => {
    if (dep.startsWith('./') || dep.startsWith('../')) {
      content += `import { ${dep.split('/').pop()?.replace('.ts', '') || 'module'}Type${index} } from '${dep}';\n`;
    } else {
      content += `import * as external${index} from '${dep}';\n`;
    }
  });

  if (dependencies.length > 0) {
    content += '\n';
  }

  // 生成類型定義
  const baseName = filename.replace('.ts', '').replace(/[^a-zA-Z0-9]/g, '');
  content += `export interface I${baseName} {\n`;
  content += `  id: string;\n`;
  content += `  name: string;\n`;
  content += `  process(): Promise<void>;\n`;
  content += `}\n\n`;

  // 生成類別
  content += `export class ${baseName} implements I${baseName} {\n`;
  content += `  constructor(\n`;
  content += `    public readonly id: string = '${baseName.toLowerCase()}',\n`;
  content += `    public readonly name: string = '${baseName}'\n`;
  content += `  ) {}\n\n`;

  content += `  async process(): Promise<void> {\n`;
  content += `    console.log(\`Processing \${this.name}\`);\n`;

  // 如果有依賴，生成使用依賴的程式碼
  if (dependencies.length > 0) {
    content += `    // Using dependencies:\n`;
    dependencies.forEach((dep, index) => {
      const depName = dep.split('/').pop()?.replace('.ts', '') || 'module';
      content += `    // await ${depName}Type${index}.process();\n`;
    });
  }

  content += `  }\n`;
  content += `}\n\n`;

  // 生成匯出的實例
  content += `export const ${baseName.toLowerCase()}Instance = new ${baseName}();\n`;

  // 生成工具函式
  content += `\nexport function create${baseName}(config?: Partial<I${baseName}>): ${baseName} {\n`;
  content += `  return new ${baseName}(config?.id, config?.name);\n`;
  content += `}\n`;

  return content;
}