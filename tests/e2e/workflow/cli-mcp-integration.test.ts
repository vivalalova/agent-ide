import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CLIRunner } from '../helpers/cli-runner';
import { MCPClient } from '../helpers/mcp-client';
import { ProjectManager } from '../helpers/project-manager';
import { withMemoryOptimization } from '../../test-utils/memory-optimization';

/**
 * CLI + MCP 整合工作流程測試
 * 測試兩個介面的協作和資料一致性
 */
describe('CLI + MCP 整合工作流程測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-integration-'));

    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 使用 TypeScript 專案進行整合測試
    const fixturesPath = join(process.cwd(), 'tests/e2e/fixtures/typescript');
    testProjectPath = await projectManager.copyProject(fixturesPath, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('索引建立和同步', () => {
    it('CLI 建立的索引應該可以被 MCP 訪問', withMemoryOptimization(async () => {
      // 使用 CLI 建立索引
      const cliResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.ts']
      });

      expect(cliResult.exitCode).toBe(0);
      expect(cliResult.stdout).toContain('索引建立完成');

      // 使用 MCP 搜尋 CLI 建立的索引
      const mcpResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'UserService',
        type: 'symbol'
      });

      expect(mcpResult.success).toBe(true);
      expect(mcpResult.data.results).toHaveLength.greaterThan(0);

      // 驗證搜尋結果一致性
      const userServiceResult = mcpResult.data.results.find(r =>
        r.symbol === 'UserService'
      );
      expect(userServiceResult).toBeDefined();
      expect(userServiceResult.file).toContain('user-service.ts');
    }, { testName: 'cli-mcp-index-sync' }));

    it('MCP 建立的索引應該可以被 CLI 訪問', withMemoryOptimization(async () => {
      // 使用 MCP 建立索引
      const mcpResult = await mcpClient.callTool('code_index', {
        path: testProjectPath,
        include: ['**/*.ts'],
        exclude: ['node_modules/**']
      });

      expect(mcpResult.success).toBe(true);
      expect(mcpResult.data.filesIndexed).toBeGreaterThan(0);

      // 使用 CLI 搜尋 MCP 建立的索引
      const cliResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'DatabaseConnection', '--format', 'json']
      });

      expect(cliResult.exitCode).toBe(0);
      const searchData = JSON.parse(cliResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證找到相同的符號
      const dbResult = searchData.results.find(r =>
        r.content.includes('DatabaseConnection')
      );
      expect(dbResult).toBeDefined();
    }, { testName: 'mcp-cli-index-sync' }));

    it('索引增量更新應該在兩個介面間同步', withMemoryOptimization(async () => {
      // 先建立初始索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 建立新檔案
      const newFilePath = join(testProjectPath, 'src/utils/helpers.ts');
      await projectManager.createFile(newFilePath, `
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class UtilityHelper {
  static processData<T>(data: T[]): T[] {
    return data.filter(Boolean);
  }
}
`);

      // 使用 CLI 更新索引
      const cliUpdateResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--incremental']
      });

      expect(cliUpdateResult.exitCode).toBe(0);

      // 使用 MCP 搜尋新增的符號
      const mcpSearchResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'UtilityHelper',
        type: 'symbol'
      });

      expect(mcpSearchResult.success).toBe(true);
      expect(mcpSearchResult.data.results).toHaveLength.greaterThan(0);

      const helperResult = mcpSearchResult.data.results.find(r =>
        r.symbol === 'UtilityHelper'
      );
      expect(helperResult).toBeDefined();
      expect(helperResult.file).toContain('helpers.ts');
    }, { testName: 'incremental-index-sync' }));
  });

  describe('搜尋功能整合', () => {
    it('複雜搜尋工作流程：CLI → MCP → CLI', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 步驟 1: 使用 CLI 進行文字搜尋
      const textSearchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'async function', '--format', 'json']
      });

      expect(textSearchResult.exitCode).toBe(0);
      const textData = JSON.parse(textSearchResult.stdout);
      expect(textData.results).toHaveLength.greaterThan(0);

      // 步驟 2: 使用 MCP 進行語義搜尋
      const semanticResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'user management',
        type: 'semantic'
      });

      expect(semanticResult.success).toBe(true);
      expect(semanticResult.data.results).toHaveLength.greaterThan(0);

      // 步驟 3: 使用 CLI 進行結構化搜尋
      const structuredResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'class.*Service', '--type', 'structural', '--format', 'json']
      });

      expect(structuredResult.exitCode).toBe(0);
      const structuredData = JSON.parse(structuredResult.stdout);
      expect(structuredData.results).toHaveLength.greaterThan(0);

      // 驗證結果間的一致性
      const userServiceFound = structuredData.results.some(r =>
        r.content.includes('UserService')
      );
      expect(userServiceFound).toBe(true);
    }, { testName: 'complex-search-workflow' }));

    it('搜尋結果格式在兩個介面間應該一致', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const searchQuery = 'interface User';

      // CLI 搜尋
      const cliResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', searchQuery, '--format', 'json']
      });

      // MCP 搜尋
      const mcpResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: searchQuery,
        type: 'text'
      });

      expect(cliResult.exitCode).toBe(0);
      expect(mcpResult.success).toBe(true);

      const cliData = JSON.parse(cliResult.stdout);

      // 驗證結果結構一致性
      expect(cliData.results).toHaveLength.greaterThan(0);
      expect(mcpResult.data.results).toHaveLength.greaterThan(0);

      // 驗證相同的檔案被找到
      const cliFiles = new Set(cliData.results.map(r => r.file));
      const mcpFiles = new Set(mcpResult.data.results.map(r => r.file));

      const commonFiles = [...cliFiles].filter(file => mcpFiles.has(file));
      expect(commonFiles).toHaveLength.greaterThan(0);
    }, { testName: 'search-result-consistency' }));
  });

  describe('程式碼重構整合', () => {
    it('CLI 重新命名 → MCP 驗證 → CLI 確認', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 步驟 1: 使用 CLI 預覽重新命名
      const previewResult = await cliRunner.runCommand(['rename'], {
        cwd: testProjectPath,
        args: [
          '--symbol', 'User',
          '--new-name', 'UserModel',
          '--preview'
        ]
      });

      expect(previewResult.exitCode).toBe(0);
      expect(previewResult.stdout).toContain('預覽變更');

      // 步驟 2: 使用 MCP 驗證重新命名的影響範圍
      const impactResult = await mcpClient.callTool('code_analyze', {
        path: testProjectPath,
        type: 'symbol-usage',
        symbol: 'User'
      });

      expect(impactResult.success).toBe(true);
      expect(impactResult.data.usageCount).toBeGreaterThan(0);

      // 步驟 3: 使用 CLI 執行重新命名
      const renameResult = await cliRunner.runCommand(['rename'], {
        cwd: testProjectPath,
        args: [
          '--symbol', 'User',
          '--new-name', 'UserModel',
          '--confirm'
        ]
      });

      expect(renameResult.exitCode).toBe(0);
      expect(renameResult.stdout).toContain('重新命名完成');

      // 步驟 4: 使用 MCP 驗證重新命名結果
      const verifyResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'UserModel',
        type: 'symbol'
      });

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.data.results).toHaveLength.greaterThan(0);
    }, { testName: 'rename-cli-mcp-workflow' }));

    it('MCP 重構 → CLI 測試 → MCP 驗證', withMemoryOptimization(async () => {
      await mcpClient.callTool('code_index', { path: testProjectPath });

      // 步驟 1: 使用 MCP 執行函式提取
      const refactorResult = await mcpClient.callTool('code_refactor', {
        path: testProjectPath,
        type: 'extract-function',
        file: 'src/core/user-service.ts',
        startLine: 50,
        endLine: 70,
        functionName: 'validateUserInput'
      });

      expect(refactorResult.success).toBe(true);
      expect(refactorResult.data.changes).toHaveLength.greaterThan(0);

      // 步驟 2: 使用 CLI 執行語法檢查
      const syntaxResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['syntax', '--format', 'json']
      });

      expect(syntaxResult.exitCode).toBe(0);
      const syntaxData = JSON.parse(syntaxResult.stdout);
      expect(syntaxData.errors).toHaveLength(0); // 應該沒有語法錯誤

      // 步驟 3: 使用 MCP 驗證重構品質
      const qualityResult = await mcpClient.callTool('code_analyze', {
        path: testProjectPath,
        type: 'quality',
        file: 'src/core/user-service.ts'
      });

      expect(qualityResult.success).toBe(true);
      expect(qualityResult.data.score).toBeGreaterThan(7); // 品質分數應該 > 7
    }, { testName: 'refactor-mcp-cli-workflow' }));
  });

  describe('依賴關係分析整合', () => {
    it('CLI 依賴分析 → MCP 影響評估 → CLI 建議', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 步驟 1: 使用 CLI 分析依賴關係
      const depsResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--format', 'json']
      });

      expect(depsResult.exitCode).toBe(0);
      const depsData = JSON.parse(depsResult.stdout);
      expect(depsData.nodes).toHaveLength.greaterThan(0);

      // 步驟 2: 使用 MCP 評估變更影響
      const impactResult = await mcpClient.callTool('code_analyze', {
        path: testProjectPath,
        type: 'change-impact',
        file: 'src/core/database.ts'
      });

      expect(impactResult.success).toBe(true);
      expect(impactResult.data.affectedFiles).toHaveLength.greaterThan(0);

      // 步驟 3: 使用 CLI 生成重構建議
      const suggestionsResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['suggestions', '--focus', 'dependencies', '--format', 'json']
      });

      expect(suggestionsResult.exitCode).toBe(0);
      const suggestionsData = JSON.parse(suggestionsResult.stdout);
      expect(suggestionsData.suggestions).toHaveLength.greaterThan(0);
    }, { testName: 'dependency-analysis-workflow' }));

    it('循環依賴檢測和修復工作流程', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 步驟 1: 使用 CLI 檢測循環依賴
      const cycleResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--check-cycles', '--format', 'json']
      });

      expect(cycleResult.exitCode).toBe(0);
      const cycleData = JSON.parse(cycleResult.stdout);

      // 如果有循環依賴，進行修復
      if (cycleData.cycles && cycleData.cycles.length > 0) {
        // 步驟 2: 使用 MCP 分析循環依賴的詳細資訊
        const analysisResult = await mcpClient.callTool('code_analyze', {
          path: testProjectPath,
          type: 'circular-dependencies',
          cycles: cycleData.cycles
        });

        expect(analysisResult.success).toBe(true);

        // 步驟 3: 使用 CLI 應用修復建議
        const fixResult = await cliRunner.runCommand(['refactor'], {
          cwd: testProjectPath,
          args: [
            'fix-cycles',
            '--strategy', 'dependency-injection',
            '--preview'
          ]
        });

        expect(fixResult.exitCode).toBe(0);
      }

      // 驗證最終沒有循環依賴
      expect(cycleData.cycles || []).toHaveLength(0);
    }, { testName: 'circular-dependency-workflow' }));
  });

  describe('效能監控整合', () => {
    it('CLI 效能測試 → MCP 結果分析', withMemoryOptimization(async () => {
      // 步驟 1: 使用 CLI 執行效能測試
      const perfResult = await cliRunner.runCommand(['perf'], {
        cwd: testProjectPath,
        args: ['--operation', 'indexing', '--iterations', '3', '--format', 'json']
      });

      expect(perfResult.exitCode).toBe(0);
      const perfData = JSON.parse(perfResult.stdout);
      expect(perfData.iterations).toHaveLength(3);

      // 步驟 2: 使用 MCP 分析效能資料
      const analysisResult = await mcpClient.callTool('analyze_performance', {
        data: perfData,
        metrics: ['duration', 'memory', 'throughput']
      });

      expect(analysisResult.success).toBe(true);
      expect(analysisResult.data.summary).toBeDefined();

      // 驗證效能指標
      expect(analysisResult.data.summary.averageDuration).toBeGreaterThan(0);
      expect(analysisResult.data.summary.memoryUsage).toBeGreaterThan(0);
    }, { testName: 'performance-monitoring-workflow' }));

    it('記憶體使用量跨介面監控', withMemoryOptimization(async () => {
      // 初始記憶體狀態
      const initialMemory = process.memoryUsage();

      // 使用 CLI 執行大型操作
      await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*']
      });

      const cliMemory = process.memoryUsage();

      // 使用 MCP 執行複雜分析
      await mcpClient.callTool('code_analyze', {
        path: testProjectPath,
        type: 'comprehensive'
      });

      const mcpMemory = process.memoryUsage();

      // 驗證記憶體使用在合理範圍內
      const cliMemoryDiff = cliMemory.heapUsed - initialMemory.heapUsed;
      const mcpMemoryDiff = mcpMemory.heapUsed - cliMemory.heapUsed;

      expect(cliMemoryDiff).toBeLessThan(200 * 1024 * 1024); // < 200MB
      expect(mcpMemoryDiff).toBeLessThan(100 * 1024 * 1024); // < 100MB
    }, { testName: 'memory-usage-monitoring' }));
  });

  describe('錯誤處理和復原', () => {
    it('CLI 錯誤 → MCP 診斷 → CLI 修復', withMemoryOptimization(async () => {
      // 建立有問題的檔案
      const brokenFilePath = join(testProjectPath, 'src/broken.ts');
      await projectManager.createFile(brokenFilePath, 'const broken = { syntax error');

      // 步驟 1: CLI 嘗試操作失敗
      const cliResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      expect(cliResult.exitCode).toBe(0); // 應該繼續，但有警告
      expect(cliResult.stderr).toContain('語法錯誤');

      // 步驟 2: 使用 MCP 診斷問題
      const diagnosisResult = await mcpClient.callTool('diagnose_errors', {
        path: testProjectPath,
        errorType: 'syntax'
      });

      expect(diagnosisResult.success).toBe(true);
      expect(diagnosisResult.data.errors).toHaveLength.greaterThan(0);

      // 步驟 3: 使用 CLI 修復問題
      const fixResult = await cliRunner.runCommand(['fix'], {
        cwd: testProjectPath,
        args: ['--type', 'syntax', '--file', brokenFilePath]
      });

      expect(fixResult.exitCode).toBe(0);

      // 驗證修復結果
      const verifyResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      expect(verifyResult.exitCode).toBe(0);
      expect(verifyResult.stderr).not.toContain('語法錯誤');
    }, { testName: 'error-recovery-workflow' }));

    it('MCP 連接中斷恢復測試', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 斷開 MCP 連接
      await mcpClient.disconnect();

      // CLI 應該仍然可以工作
      const cliResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'UserService']
      });

      expect(cliResult.exitCode).toBe(0);

      // 重新連接 MCP
      await mcpClient.connect();

      // MCP 應該能夠讀取 CLI 建立的索引
      const mcpResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'UserService'
      });

      expect(mcpResult.success).toBe(true);
    }, { testName: 'mcp-reconnection-test' }));
  });

  describe('並行操作測試', () => {
    it('CLI 和 MCP 並行操作不應互相干擾', withMemoryOptimization(async () => {
      // 建立初始索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 並行執行 CLI 和 MCP 操作
      const [cliResult, mcpResult] = await Promise.all([
        cliRunner.runCommand(['analyze'], {
          cwd: testProjectPath,
          args: ['complexity', '--format', 'json']
        }),
        mcpClient.callTool('code_search', {
          path: testProjectPath,
          query: 'function',
          type: 'text'
        })
      ]);

      // 驗證兩個操作都成功
      expect(cliResult.exitCode).toBe(0);
      expect(mcpResult.success).toBe(true);

      // 驗證結果品質
      const cliData = JSON.parse(cliResult.stdout);
      expect(cliData.files).toHaveLength.greaterThan(0);
      expect(mcpResult.data.results).toHaveLength.greaterThan(0);
    }, { testName: 'concurrent-operations' }));

    it('高負載並行操作穩定性測試', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 並行執行多個操作
      const operations = [
        cliRunner.runCommand(['search'], { cwd: testProjectPath, args: ['--query', 'class'] }),
        cliRunner.runCommand(['deps'], { cwd: testProjectPath, args: ['--format', 'json'] }),
        mcpClient.callTool('code_search', { path: testProjectPath, query: 'interface' }),
        mcpClient.callTool('code_analyze', { path: testProjectPath, type: 'complexity' }),
        cliRunner.runCommand(['analyze'], { cwd: testProjectPath, args: ['patterns'] })
      ];

      const results = await Promise.allSettled(operations);

      // 驗證所有操作都成功或優雅失敗
      const failures = results.filter(r => r.status === 'rejected');
      expect(failures).toHaveLength(0);

      // 驗證成功的操作有合理的結果
      const successes = results.filter(r => r.status === 'fulfilled');
      expect(successes).toHaveLength(5);
    }, { testName: 'high-load-stability' }));
  });
});