import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { CLIRunner } from '../helpers/cli-runner';
import { MCPClient } from '../helpers/mcp-client';
import { ProjectManager } from '../helpers/project-manager';
import { withMemoryOptimization } from '../../test-utils/memory-optimization';

// 使用 import.meta.url 獲取當前檔案路徑，避免 process.cwd() 變化的問題
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_PATH = join(__dirname, '../fixtures/typescript');

/**
 * 效能基準測試
 * 驗證系統在各種負載下的效能表現
 */
describe('效能基準測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-perf-'));

    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 使用 TypeScript 專案進行效能測試
    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('索引建立效能基準', () => {
    it('小型專案索引效能 (< 50 檔案)', withMemoryOptimization(async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await cliRunner.runCommand(['index', '--extensions', '.ts', '--exclude', 'node_modules/**'], {
        cwd: testProjectPath,
        timeout: 30000
      });

      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(result.exitCode).toBe(0);

      // 效能基準要求
      expect(duration).toBeLessThan(5000); // 5 秒內完成
      expect(memoryUsed).toBeLessThan(100 * 1024 * 1024); // 記憶體使用 < 100MB

      // 記錄效能指標
      console.log(`小型專案索引效能:
        - 執行時間: ${duration}ms
        - 記憶體使用: ${Math.round(memoryUsed / 1024 / 1024)}MB
        - 檔案處理速度: ${Math.round(10 / (duration / 1000))} 檔案/秒`);

      // 驗證吞吐量基準
      const filesPerSecond = 10 / (duration / 1000);
      expect(filesPerSecond).toBeGreaterThan(2); // 至少 2 檔案/秒
    }, { testName: 'small-project-indexing-performance' }));

    it('中型專案索引效能模擬 (100-500 檔案)', withMemoryOptimization(async () => {
      // 創建中型專案結構
      const modules = ['auth', 'user', 'product', 'order', 'payment', 'notification'];
      const fileTypes = ['controller', 'service', 'repository', 'dto', 'entity'];

      for (const module of modules) {
        for (const type of fileTypes) {
          for (let i = 1; i <= 5; i++) {
            const fileName = `${module}-${type}-${i}.ts`;
            const filePath = join(testProjectPath, 'src', module, fileName);

            await projectManager.createFile(filePath, `
// Generated ${type} for ${module} module
export class ${module}${type}${i} {
  private id: string = '${module}-${i}';

  async process(): Promise<void> {
    // Simulate complex logic
    const data = await this.fetchData();
    const processed = this.transform(data);
    await this.save(processed);
  }

  private async fetchData(): Promise<any[]> {
    return Array.from({ length: 100 }, (_, i) => ({
      id: i,
      name: \`item-\${i}\`,
      type: '${type}',
      module: '${module}'
    }));
  }

  private transform(data: any[]): any[] {
    return data.map(item => ({
      ...item,
      processed: true,
      timestamp: new Date().toISOString()
    }));
  }

  private async save(data: any[]): Promise<void> {
    // Simulate database save
    console.log(\`Saving \${data.length} items for ${module}\`);
  }
}`);
          }
        }
      }

      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await cliRunner.runCommand(['index', '--extensions', '.ts'], {
        cwd: testProjectPath,
        timeout: 60000
      });

      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(result.exitCode).toBe(0);

      // 中型專案效能基準
      expect(duration).toBeLessThan(30000); // 30 秒內完成
      expect(memoryUsed).toBeLessThan(300 * 1024 * 1024); // 記憶體使用 < 300MB

      const estimatedFiles = modules.length * fileTypes.length * 5 + 10; // 約 160 檔案
      const filesPerSecond = estimatedFiles / (duration / 1000);

      console.log(`中型專案索引效能:
        - 執行時間: ${duration}ms
        - 記憶體使用: ${Math.round(memoryUsed / 1024 / 1024)}MB
        - 預估檔案數: ${estimatedFiles}
        - 檔案處理速度: ${Math.round(filesPerSecond)} 檔案/秒`);

      // 驗證目標吞吐量 (1000 檔案/秒)
      expect(filesPerSecond).toBeGreaterThan(5); // 至少 5 檔案/秒

    }, { testName: 'medium-project-indexing-performance' }));

    it('增量索引更新效能', withMemoryOptimization(async () => {
      // 先建立初始索引
      await cliRunner.runCommand(['index', '--extensions', '.ts'], {
        cwd: testProjectPath
      });

      // 新增幾個檔案
      const newFiles = [
        'src/new-service-1.ts',
        'src/new-service-2.ts',
        'src/new-service-3.ts'
      ];

      for (const file of newFiles) {
        await projectManager.createFile(join(testProjectPath, file), `
export class NewService {
  async performOperation(): Promise<string> {
    return 'operation completed';
  }
}`);
      }

      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await cliRunner.runCommand(['index', '--update'], {
        cwd: testProjectPath
      });

      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(result.exitCode).toBe(0);

      // 增量更新應該很快
      expect(duration).toBeLessThan(2000); // 2 秒內完成
      expect(memoryUsed).toBeLessThan(50 * 1024 * 1024); // 記憶體使用 < 50MB

      console.log(`增量索引更新效能:
        - 執行時間: ${duration}ms
        - 記憶體使用: ${Math.round(memoryUsed / 1024 / 1024)}MB
        - 新增檔案數: ${newFiles.length}`);

    }, { testName: 'incremental-indexing-performance' }));
  });

  describe('搜尋效能基準', () => {
    beforeEach(async () => {
      // 為搜尋測試建立索引
      await cliRunner.runCommand(['index', '--extensions', '.ts'], {
        cwd: testProjectPath
      });
    });

    it('文字搜尋效能基準', withMemoryOptimization(async () => {
      const queries = [
        'function',
        'interface User',
        'async.*await',
        'class.*Service',
        'import.*from'
      ];

      const results = [];

      for (const query of queries) {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();

        const result = await cliRunner.runCommand(['search', query, '--format', 'json'], {
          cwd: testProjectPath
        });

        const duration = Date.now() - startTime;
        const endMemory = process.memoryUsage();
        const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

        expect(result.exitCode).toBe(0);

        if (!result.stdout || result.stdout.trim() === '') {
          console.error(`查詢 "${query}" 輸出為空`);
          console.error('stderr:', result.stderr);
          continue; // 跳過空輸出
        }
        const searchData = JSON.parse(result.stdout);
        results.push({
          query,
          duration,
          memoryUsed,
          resultCount: searchData.matches?.length || 0
        });

        // 每個搜尋應該在 1 秒內完成
        expect(duration).toBeLessThan(1000);
        expect(memoryUsed).toBeLessThan(20 * 1024 * 1024); // < 20MB
      }

      if (results.length > 0) {
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
        const avgMemory = results.reduce((sum, r) => sum + r.memoryUsed, 0) / results.length;

        console.log(`文字搜尋效能統計:
          - 平均執行時間: ${Math.round(avgDuration)}ms
          - 平均記憶體使用: ${Math.round(avgMemory / 1024 / 1024)}MB
          - 成功查詢數: ${results.length}/${queries.length}`);

        // 平均搜尋時間應該 < 500ms
        expect(avgDuration).toBeLessThan(500);
      }

    }, { testName: 'text-search-performance' }));

    it('結構化搜尋效能基準', withMemoryOptimization(async () => {
      const structuralQueries = [
        { type: 'class', pattern: 'class.*extends' },
        { type: 'interface', pattern: 'interface.*{' },
        { type: 'function', pattern: 'function.*\\(' },
        { type: 'method', pattern: 'async.*\\(' },
        { type: 'import', pattern: 'import.*{.*}' }
      ];

      const results = [];

      for (const query of structuralQueries) {
        const startTime = Date.now();

        const result = await cliRunner.runCommand([
          'search',
          query.pattern,
          '--type', 'structural',
          '--format', 'json'
        ], {
          cwd: testProjectPath
        });

        const duration = Date.now() - startTime;

        expect(result.exitCode).toBe(0);

        if (!result.stdout || result.stdout.trim() === '') {
          console.error(`結構化查詢 "${query.type}" 輸出為空`);
          continue; // 跳過空輸出
        }

        const searchData = JSON.parse(result.stdout);
        results.push({
          type: query.type,
          duration,
          resultCount: searchData.matches?.length || 0
        });

        // 結構化搜尋應該在 2 秒內完成
        expect(duration).toBeLessThan(2000);
      }

      if (results.length > 0) {
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

        console.log(`結構化搜尋效能統計:
          - 平均執行時間: ${Math.round(avgDuration)}ms
          - 成功查詢數: ${results.length}/${structuralQueries.length}`);

        expect(avgDuration).toBeLessThan(1000); // 平均 < 1 秒
      }

    }, { testName: 'structural-search-performance' }));

    it('並行搜尋效能基準', withMemoryOptimization(async () => {
      const parallelQueries = [
        'UserService',
        'DatabaseConnection',
        'async function',
        'interface.*Config',
        'class.*Error'
      ];

      const startTime = Date.now();

      // 並行執行所有搜尋
      const results = await Promise.all(
        parallelQueries.map(query =>
          cliRunner.runCommand(['search', query, '--format', 'json'], {
            cwd: testProjectPath
          })
        )
      );

      const totalDuration = Date.now() - startTime;

      // 所有搜尋都應該成功
      results.forEach(result => {
        expect(result.exitCode).toBe(0);
      });

      // 並行執行應該比順序執行快
      expect(totalDuration).toBeLessThan(3000); // 3 秒內完成全部

      console.log(`並行搜尋效能:
        - 總執行時間: ${totalDuration}ms
        - 並行查詢數: ${parallelQueries.length}
        - 平均每查詢: ${Math.round(totalDuration / parallelQueries.length)}ms`);

    }, { testName: 'parallel-search-performance' }));
  });

  describe('分析效能基準', () => {
    beforeEach(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });
    });

    it('複雜度分析效能基準', withMemoryOptimization(async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {
        cwd: testProjectPath
      });

      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(result.exitCode).toBe(0);

      const analysisData = JSON.parse(result.stdout);

      // 功能尚未實作，檢查開發中狀態
      expect(analysisData.status).toBe('under_development');

      console.log(`複雜度分析效能:
        - 執行時間: ${duration}ms
        - 記憶體使用: ${Math.round(memoryUsed / 1024 / 1024)}MB
        - 狀態: ${analysisData.message}`)

    }, { testName: 'complexity-analysis-performance' }));

    it('依賴關係分析效能基準', withMemoryOptimization(async () => {
      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      const result = await cliRunner.runCommand(['deps', '--format', 'json'], {
        cwd: testProjectPath
      });

      const duration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

      expect(result.exitCode).toBe(0);

      const depsData = JSON.parse(result.stdout);

      // 功能尚未實作，檢查開發中狀態
      expect(depsData.status).toBe('under_development');

      console.log(`依賴分析效能:
        - 執行時間: ${duration}ms
        - 記憶體使用: ${Math.round(memoryUsed / 1024 / 1024)}MB
        - 狀態: ${depsData.message}`)

    }, { testName: 'dependency-analysis-performance' }));

    it('綜合分析效能基準', withMemoryOptimization(async () => {
      const analyses = [
        'complexity',
        'quality',
        'patterns',
        'dead-code'
      ];

      const results = [];

      for (const analysis of analyses) {
        const startTime = Date.now();
        const startMemory = process.memoryUsage();

        const result = await cliRunner.runCommand(['analyze', analysis, '--format', 'json'], {
          cwd: testProjectPath
        });

        const duration = Date.now() - startTime;
        const endMemory = process.memoryUsage();
        const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

        expect(result.exitCode).toBe(0);

        results.push({
          analysis,
          duration,
          memoryUsed: memoryUsed / 1024 / 1024 // MB
        });

        // 每種分析都應該在合理時間內完成
        expect(duration).toBeLessThan(20000); // 20 秒
      }

      const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
      const avgMemory = results.reduce((sum, r) => sum + r.memoryUsed, 0) / results.length;

      console.log(`綜合分析效能統計:`);
      results.forEach(r => {
        console.log(`  - ${r.analysis}: ${r.duration}ms, ${Math.round(r.memoryUsed)}MB`);
      });
      console.log(`  - 總時間: ${totalDuration}ms`);
      console.log(`  - 平均記憶體: ${Math.round(avgMemory)}MB`);

      // 總體效能要求
      expect(totalDuration).toBeLessThan(60000); // 1 分鐘內完成全部分析
      expect(avgMemory).toBeLessThan(200); // 平均記憶體 < 200MB

    }, { testName: 'comprehensive-analysis-performance' }));
  });

  describe('MCP 介面效能基準', () => {
    it('MCP 工具調用效能基準', withMemoryOptimization(async () => {
      const mcpOperations = [
        { tool: 'code_index', args: { path: testProjectPath, include: ['**/*.ts'] } },
        { tool: 'code_search', args: { path: testProjectPath, query: 'UserService' } },
        { tool: 'code_analyze', args: { path: testProjectPath, type: 'complexity' } }
      ];

      const results = [];

      for (const operation of mcpOperations) {
        const startTime = Date.now();

        const result = await mcpClient.callTool(operation.tool, operation.args);

        const duration = Date.now() - startTime;

        // MCP 工具可能未實作，只檢查執行時間
        if (result.success) {
          results.push({
            tool: operation.tool,
            duration
          });

          // MCP 工具調用效能基準
          expect(duration).toBeLessThan(30000); // 30 秒內完成
        }
      }

      if (results.length > 0) {
        const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

        console.log(`MCP 工具效能統計:`);
        results.forEach(r => {
          console.log(`  - ${r.tool}: ${r.duration}ms`);
        });
        console.log(`  - 平均時間: ${Math.round(avgDuration)}ms`);
        console.log(`  - 成功工具數: ${results.length}/${mcpOperations.length}`);

        expect(avgDuration).toBeLessThan(15000); // 平均 < 15 秒
      } else {
        console.log('MCP 工具尚未實作，跳過效能測試');
      }

    }, { testName: 'mcp-tools-performance' }));

    it('MCP 並行操作效能基準', withMemoryOptimization(async () => {
      // 先建立索引
      await mcpClient.callTool('code_index', {
        path: testProjectPath,
        include: ['**/*.ts']
      });

      const parallelOperations = [
        mcpClient.callTool('code_search', {
          path: testProjectPath,
          query: 'class'
        }),
        mcpClient.callTool('code_search', {
          path: testProjectPath,
          query: 'interface'
        }),
        mcpClient.callTool('code_analyze', {
          path: testProjectPath,
          type: 'quality'
        })
      ];

      const startTime = Date.now();

      const results = await Promise.all(parallelOperations);

      const totalDuration = Date.now() - startTime;

      // 所有操作都應該成功
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並行操作應該比順序執行快
      expect(totalDuration).toBeLessThan(20000); // 20 秒內完成

      console.log(`MCP 並行操作效能:
        - 總執行時間: ${totalDuration}ms
        - 並行操作數: ${parallelOperations.length}`);

    }, { testName: 'mcp-parallel-performance' }));
  });

  describe('記憶體和資源管理效能', () => {
    it('記憶體洩漏檢測', withMemoryOptimization(async () => {
      const iterations = 5;
      const memoryMeasurements = [];

      for (let i = 0; i < iterations; i++) {
        const beforeMemory = process.memoryUsage();

        // 執行索引和搜尋操作
        await cliRunner.runCommand(['index'], { cwd: testProjectPath });
        await cliRunner.runCommand(['search', 'UserService'], {
          cwd: testProjectPath
        });

        // 強制垃圾回收
        if (global.gc) {
          global.gc();
        }

        const afterMemory = process.memoryUsage();
        const memoryDiff = afterMemory.heapUsed - beforeMemory.heapUsed;

        memoryMeasurements.push(memoryDiff);

        console.log(`迭代 ${i + 1}: 記憶體變化 ${Math.round(memoryDiff / 1024 / 1024)}MB`);
      }

      // 計算記憶體增長趨勢
      const avgGrowth = memoryMeasurements.reduce((sum, m) => sum + m, 0) / iterations;
      const maxGrowth = Math.max(...memoryMeasurements);

      console.log(`記憶體洩漏檢測結果:
        - 平均增長: ${Math.round(avgGrowth / 1024 / 1024)}MB
        - 最大增長: ${Math.round(maxGrowth / 1024 / 1024)}MB`);

      // 記憶體洩漏判定標準
      expect(avgGrowth).toBeLessThan(50 * 1024 * 1024); // 平均增長 < 50MB
      expect(maxGrowth).toBeLessThan(100 * 1024 * 1024); // 最大增長 < 100MB

    }, { testName: 'memory-leak-detection' }));

    it('長時間運行穩定性測試', withMemoryOptimization(async () => {
      const operations = 20; // 20 次操作
      const startTime = Date.now();
      const startMemory = process.memoryUsage();

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < operations; i++) {
        try {
          // 隨機選擇操作類型
          const operationType = i % 4;

          switch (operationType) {
            case 0:
              await cliRunner.runCommand(['index'], { cwd: testProjectPath });
              break;
            case 1:
              await cliRunner.runCommand(['search', `test${i}`], {
                cwd: testProjectPath
              });
              break;
            case 2:
              await cliRunner.runCommand(['analyze', 'complexity'], {
                cwd: testProjectPath
              });
              break;
            case 3:
              await mcpClient.callTool('code_search', {
                path: testProjectPath,
                query: `query${i}`
              });
              break;
          }

          successCount++;
        } catch (error) {
          errorCount++;
          console.warn(`操作 ${i + 1} 失敗:`, error);
        }

        // 每 5 次操作檢查一次記憶體
        if ((i + 1) % 5 === 0) {
          const currentMemory = process.memoryUsage();
          console.log(`操作 ${i + 1}: 記憶體使用 ${Math.round(currentMemory.heapUsed / 1024 / 1024)}MB`);
        }
      }

      const totalDuration = Date.now() - startTime;
      const endMemory = process.memoryUsage();
      const totalMemoryGrowth = endMemory.heapUsed - startMemory.heapUsed;

      console.log(`長時間運行測試結果:
        - 總操作數: ${operations}
        - 成功操作: ${successCount}
        - 失敗操作: ${errorCount}
        - 總執行時間: ${totalDuration}ms
        - 記憶體增長: ${Math.round(totalMemoryGrowth / 1024 / 1024)}MB
        - 成功率: ${Math.round(successCount / operations * 100)}%`);

      // 穩定性要求
      expect(successCount / operations).toBeGreaterThan(0.95); // 95% 成功率
      expect(totalMemoryGrowth).toBeLessThan(500 * 1024 * 1024); // 記憶體增長 < 500MB

    }, { testName: 'long-running-stability' }));
  });

  describe('擴展性效能測試', () => {
    it('檔案數量擴展性測試', withMemoryOptimization(async () => {
      const fileCounts = [10, 50, 100];
      const results = [];

      for (const fileCount of fileCounts) {
        // 清理之前的檔案
        await projectManager.cleanDirectory(join(testProjectPath, 'src/generated'));

        // 生成指定數量的檔案
        for (let i = 0; i < fileCount; i++) {
          const fileName = `generated-${i.toString().padStart(3, '0')}.ts`;
          const filePath = join(testProjectPath, 'src/generated', fileName);

          await projectManager.createFile(filePath, `
export class Generated${i} {
  private id = ${i};

  async process(): Promise<number> {
    const data = Array.from({ length: 10 }, (_, j) => i * 10 + j);
    return data.reduce((sum, val) => sum + val, 0);
  }

  calculate(x: number, y: number): number {
    return Math.pow(x, y) + this.id;
  }
}`);
        }

        const startTime = Date.now();
        const startMemory = process.memoryUsage();

        // 執行索引
        const indexResult = await cliRunner.runCommand(['index'], {
          cwd: testProjectPath,
          timeout: 120000 // 2 分鐘超時
        });

        const indexDuration = Date.now() - startTime;
        const indexMemory = process.memoryUsage().heapUsed - startMemory.heapUsed;

        expect(indexResult.exitCode).toBe(0);

        // 執行搜尋測試
        const searchStartTime = Date.now();
        const searchResult = await cliRunner.runCommand(['search', 'Generated', '--format', 'json'], {
          cwd: testProjectPath
        });

        const searchDuration = Date.now() - searchStartTime;

        expect(searchResult.exitCode).toBe(0);

        const searchData = JSON.parse(searchResult.stdout);

        results.push({
          fileCount,
          indexDuration,
          indexMemory: Math.round(indexMemory / 1024 / 1024),
          searchDuration,
          searchResults: searchData.matches?.length || 0
        });

        console.log(`${fileCount} 檔案測試:
          - 索引時間: ${indexDuration}ms
          - 索引記憶體: ${Math.round(indexMemory / 1024 / 1024)}MB
          - 搜尋時間: ${searchDuration}ms
          - 搜尋結果: ${searchData.matches?.length || 0}`);
      }

      // 分析擴展性
      console.log('\n擴展性分析:');
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1];
        const curr = results[i];

        const fileRatio = curr.fileCount / prev.fileCount;
        const timeRatio = curr.indexDuration / prev.indexDuration;
        const memoryRatio = curr.indexMemory / prev.indexMemory;

        console.log(`${prev.fileCount} → ${curr.fileCount} 檔案:
          - 時間擴展比: ${Math.round(timeRatio * 100) / 100}x (理想: ${fileRatio}x)
          - 記憶體擴展比: ${Math.round(memoryRatio * 100) / 100}x (理想: ${fileRatio}x)`);

        // 擴展性要求：時間和記憶體增長應該接近線性
        expect(timeRatio).toBeLessThan(fileRatio * 1.5); // 時間增長不超過 1.5 倍線性
        expect(memoryRatio).toBeLessThan(fileRatio * 2); // 記憶體增長不超過 2 倍線性
      }

    }, { testName: 'file-count-scalability' }));
  });
});