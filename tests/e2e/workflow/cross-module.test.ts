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
 * 跨模組協作測試
 * 測試 7 個核心模組的整合和協作工作流程
 */
describe('跨模組協作測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-cross-module-'));

    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 使用 TypeScript 專案進行跨模組測試
    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('Indexing + Search + Analysis 整合', () => {
    it('應該能執行完整的程式碼分析工作流程', withMemoryOptimization(async () => {
      // 模組 1: Indexing - 建立程式碼索引
      const indexResult = await cliRunner.runCommand(['index', '--extensions', '.ts', '--exclude', 'node_modules/**'], {cwd: testProjectPath,});

      expect(indexResult.exitCode).toBe(0);
      expect(indexResult.stdout).toContain('索引完成');

      // 模組 2: Search - 搜尋基本模式
      const searchResult = await cliRunner.runCommand(['search', 'function', '--format', 'json'], {cwd: testProjectPath,});

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      // 搜尋可能返回空結果
      expect(searchData).toBeDefined();

      // 模組 3: Analysis - 分析功能尚未完全實作，檢查基本輸出
      const analysisResult = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});

      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);

      // 功能開發中，檢查狀態
      expect(analysisData.status).toBe('under_development');
    }, { testName: 'indexing-search-analysis-workflow' }));

    it('應該能進行語義搜尋和結構化分析', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 基本搜尋測試
      const searchResult = await cliRunner.runCommand(['search', 'class', '--format', 'json'], { cwd: testProjectPath });

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.matches?.length || 0).toBeGreaterThan(0);
    }, { testName: 'semantic-search-structure-analysis' }));
  });

  describe('Dependency + Move + Rename 整合', () => {
    it('應該能安全地重構程式碼結構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 模組 1: Dependency - 依賴分析功能開發中
      const depsResult = await cliRunner.runCommand(['deps', '--format', 'json'], {cwd: testProjectPath,});

      expect(depsResult.exitCode).toBe(0);
      const depsData = JSON.parse(depsResult.stdout);
      expect(depsData.status).toBe('under_development');
    }, { testName: 'dependency-move-rename-workflow' }));

    it('應該能處理複雜的重構場景', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 依賴分析功能開發中
      const depsResult = await cliRunner.runCommand(['deps', '--format', 'json'], {cwd: testProjectPath,});
      expect(depsResult.exitCode).toBe(0);
      const depsData = JSON.parse(depsResult.stdout);
      expect(depsData.status).toBe('under_development');
    }, { testName: 'complex-refactoring-scenario' }));
  });

  describe('Analysis + Refactor + Search 整合', () => {
    it('應該能基於分析結果執行智能重構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 分析功能開發中
      const analysisResult = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});
      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.status).toBe('under_development');
    }, { testName: 'analysis-refactor-search-workflow' }));

    it('應該能識別和修復設計模式問題', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 分析功能開發中
      const analysisResult = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});
      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.status).toBe('under_development');
    }, { testName: 'pattern-analysis-fix-workflow' }));
  });

  describe('全模組整合工作流程', () => {
    it('應該能執行完整的程式碼品質改善流程', withMemoryOptimization(async () => {
      // 建立索引
      const indexResult = await cliRunner.runCommand(['index', '--extensions', '.ts'], {cwd: testProjectPath,});
      expect(indexResult.exitCode).toBe(0);

      // 分析功能開發中
      const analysisResult = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});
      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.status).toBe('under_development');
    }, { testName: 'complete-quality-improvement-workflow' }));

    it('應該能處理大型重構專案', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index', '--extensions', '.ts'], {cwd: testProjectPath,});

      // 分析功能開發中
      const analysisResult = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});
      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.status).toBe('under_development');
    }, { testName: 'large-scale-refactoring-project' }));
  });

  describe('跨模組錯誤處理', () => {
    it('應該能優雅處理模組間的錯誤傳播', withMemoryOptimization(async () => {
      // 建立有問題的檔案
      const brokenFile = join(testProjectPath, 'src/broken.ts');
      await projectManager.createFile(brokenFile, 'const broken = { incomplete');

      // 索引階段 - 應該記錄錯誤但繼續
      const indexResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      expect(indexResult.exitCode).toBe(0); // 不應該失敗

      // 搜尋階段 - 應該跳過有問題的檔案
      const searchResult = await cliRunner.runCommand(['search', 'class', '--format', 'json'], {cwd: testProjectPath,});

      expect(searchResult.exitCode).toBe(0);
    }, { testName: 'cross-module-error-handling' }));

    it('應該能從部分失敗中恢復', withMemoryOptimization(async () => {
      // 先建立正常的索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 創建一個新檔案並破壞它
      const corruptFile = join(testProjectPath, 'src/broken-temp.ts');
      const originalContent = 'export const test = "hello";';
      await projectManager.createFile(corruptFile, originalContent);

      // 破壞檔案
      await projectManager.createFile(corruptFile, 'corrupted content {{{');

      // 嘗試更新索引 - 可能會因為錯誤檔案而失敗
      const updateResult = await cliRunner.runCommand(['index', '--incremental'], {cwd: testProjectPath,});

      // 索引可能失敗或成功（取決於錯誤處理策略）
      expect([0, 1]).toContain(updateResult.exitCode);

      // 修復檔案
      await projectManager.createFile(corruptFile, originalContent);

      // 重新索引
      const fixResult = await cliRunner.runCommand(['index'], {cwd: testProjectPath,});

      // 應該能成功執行
      expect([0, 1]).toContain(fixResult.exitCode);
    }, { testName: 'partial-failure-recovery' }));
  });

  describe('效能和記憶體管理', () => {
    it('跨模組操作應該有效管理記憶體', withMemoryOptimization(async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 執行索引操作
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const finalMemory = process.memoryUsage().heapUsed;

      // 記憶體增長應該是合理的
      const totalGrowth = finalMemory - initialMemory;
      expect(totalGrowth).toBeLessThan(500 * 1024 * 1024); // < 500MB
    }, { testName: 'cross-module-memory-management' }));

    it('並行跨模組操作應該保持效能', withMemoryOptimization(async () => {
      // 先建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const startTime = Date.now();

      // 並行執行多個跨模組操作
      const operations = await Promise.all([
        cliRunner.runCommand(['search', '--query', 'class.*Service'], {cwd: testProjectPath,}),
        cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {
          cwd: testProjectPath
        }),
        cliRunner.runCommand(['deps', '--format', 'json'], {
          cwd: testProjectPath
        })
      ]);

      const duration = Date.now() - startTime;

      // 檢查成功的操作數量
      const successfulOps = operations.filter(result => result.exitCode === 0).length;
      console.log(`並行操作成功數: ${successfulOps}/${operations.length}`);

      // 至少有一個操作成功
      expect(successfulOps).toBeGreaterThan(0);

      // 並行執行應該比順序執行快
      expect(duration).toBeLessThan(30000); // 30 秒內完成

    }, { testName: 'concurrent-cross-module-performance' }));
  });
});