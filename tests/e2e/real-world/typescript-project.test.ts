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
 * TypeScript 專案 E2E 測試
 * 測試真實 TypeScript 專案的完整工作流程
 */
describe('TypeScript 專案 E2E 測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    // 創建臨時目錄
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-ts-'));

    // 初始化測試工具
    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 複製 TypeScript 測試專案到臨時目錄
    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    // 連接 MCP 客戶端
    await mcpClient.connect();
  });

  afterEach(async () => {
    // 清理臨時目錄
    await rm(tempDir, { recursive: true, force: true });

    // 斷開 MCP 連接
    await mcpClient.disconnect();
  });

  describe('專案索引建立', () => {
    it('應該能成功建立 TypeScript 專案索引', withMemoryOptimization(async () => {
      const result = await cliRunner.runCommand(['index', '--extensions', '.ts', '--exclude', 'node_modules/**'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✅ 索引完成!');

      // 驗證索引內容
      const indexResult = await cliRunner.runCommand(['search', '--query', 'UserService', '--format', 'json'], {cwd: testProjectPath,});

      expect(indexResult.exitCode).toBe(0);
      const searchData = JSON.parse(indexResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);
      expect(searchData.results[0].file).toContain('user-service.ts');
    }, { testName: 'typescript-indexing' }));

    it('應該能處理複雜的 TypeScript 型別定義', withMemoryOptimization(async () => {
      // 先建立索引
      await cliRunner.runCommand(['index', '--extensions', '.ts'], {cwd: testProjectPath,});

      // 搜尋複雜型別
      const result = await cliRunner.runCommand(['search', '--query', 'ResponseResult', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證找到的型別定義
      const typeResult = searchData.results.find(r => r.file.includes('config.ts'));
      expect(typeResult).toBeDefined();
      expect(typeResult.content).toContain('ResponseResult<T = any>');
    }, { testName: 'typescript-types' }));

    it('應該能識別 TypeScript 路徑別名', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index', '--extensions', '.ts'], {cwd: testProjectPath,});

      // 搜尋使用路徑別名的 import
      const result = await cliRunner.runCommand(['search', '--query', '@core/', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證路徑別名解析
      const importResult = searchData.results.find(r =>
        r.content.includes("import") && r.content.includes("@core/")
      );
      expect(importResult).toBeDefined();
    }, { testName: 'typescript-path-aliases' }));
  });

  describe('依賴關係分析', () => {
    it('應該能分析 TypeScript 專案的依賴關係', withMemoryOptimization(async () => {
      // 先建立索引
      await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      // 分析依賴關係
      const result = await cliRunner.runCommand(['deps', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const depsData = JSON.parse(result.stdout);

      expect(depsData).toHaveProperty('nodes');
      expect(depsData).toHaveProperty('edges');
      expect(depsData.nodes).toHaveLength.greaterThan(0);

      // 驗證核心模組依賴
      const serverNode = depsData.nodes.find(n => n.id.includes('server.ts'));
      expect(serverNode).toBeDefined();

      // 檢查是否有循環依賴
      expect(depsData.cycles).toEqual([]);
    }, { testName: 'typescript-dependencies' }));

    it('應該能檢測複雜的模組依賴鏈', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 分析特定檔案的依賴
      const result = await cliRunner.runCommand(['deps', '--file', 'src/index.ts', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const depsData = JSON.parse(result.stdout);

      // 驗證 index.ts 依賴的模組
      const indexDeps = depsData.dependencies['src/index.ts'];
      expect(indexDeps).toContain('src/core/server.ts');
      expect(indexDeps).toContain('src/core/database.ts');
    }, { testName: 'typescript-dependency-chain' }));
  });

  describe('程式碼重新命名', () => {
    it('應該能重新命名 TypeScript 介面', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 重新命名 User 介面為 UserModel
      const result = await cliRunner.runCommand(['rename', '--symbol', 'User',
          '--new-name', 'UserModel',
          '--preview'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽變更');

      // 驗證預覽結果
      expect(result.stdout).toContain('interface User'); // 原始
      expect(result.stdout).toContain('interface UserModel'); // 新名稱
    }, { testName: 'typescript-rename-interface' }));

    it('應該能處理泛型型別的重新命名', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename', '--symbol', 'ResponseResult',
          '--new-name', 'ApiResponse',
          '--preview'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('ResponseResult<T = any>');
      expect(result.stdout).toContain('ApiResponse<T = any>');
    }, { testName: 'typescript-rename-generic' }));
  });

  describe('程式碼重構', () => {
    it('應該能提取複雜函式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 提取 createServer 函式中的中介軟體設定
      const result = await cliRunner.runCommand(['refactor', 'extract-function',
          '--file', 'src/core/server.ts',
          '--start-line', '25',
          '--end-line', '35',
          '--function-name', 'configureMiddleware'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重構完成');
    }, { testName: 'typescript-extract-function' }));

    it('應該能處理 async/await 函式的重構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor', 'extract-function',
          '--file', 'src/core/user-service.ts',
          '--start-line', '50',
          '--end-line', '70',
          '--function-name', 'validateUserInput'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('async function validateUserInput');
    }, { testName: 'typescript-async-refactor' }));
  });

  describe('程式碼分析', () => {
    it('應該能分析 TypeScript 程式碼複雜度', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const analysisData = JSON.parse(result.stdout);

      expect(analysisData).toHaveProperty('files');
      expect(analysisData).toHaveProperty('summary');
      expect(analysisData.summary.averageComplexity).toBeGreaterThan(0);

      // 驗證複雜函式的識別
      const complexFiles = analysisData.files.filter(f =>
        f.complexity > analysisData.summary.averageComplexity
      );
      expect(complexFiles).toHaveLength.greaterThan(0);
    }, { testName: 'typescript-complexity' }));

    it('應該能檢測死代碼', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'dead-code', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const deadCodeData = JSON.parse(result.stdout);

      expect(deadCodeData).toHaveProperty('deadFunctions');
      expect(deadCodeData).toHaveProperty('deadVariables');
      expect(Array.isArray(deadCodeData.deadFunctions)).toBe(true);
    }, { testName: 'typescript-dead-code' }));

    it('應該能分析 TypeScript 特定的模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'patterns', '--pattern', 'typescript', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const patternsData = JSON.parse(result.stdout);

      // 驗證 TypeScript 特定模式
      expect(patternsData.patterns).toContain('interface-usage');
      expect(patternsData.patterns).toContain('generic-types');
      expect(patternsData.patterns).toContain('enum-usage');
    }, { testName: 'typescript-patterns' }));
  });

  describe('檔案移動操作', () => {
    it('應該能移動 TypeScript 檔案並更新 import', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 移動 user-service.ts 到 services 目錄
      const result = await cliRunner.runCommand(['move', '--from', 'src/core/user-service.ts',
          '--to', 'src/services/user-service.ts',
          '--update-imports'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('檔案移動完成');

      // 驗證 import 路徑已更新
      const searchResult = await cliRunner.runCommand(['search', '--query', 'from.*services/user-service', '--format', 'json'], {cwd: testProjectPath,});

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);
    }, { testName: 'typescript-move-file' }));
  });
});

/**
 * MCP 介面 TypeScript 專案測試
 */
describe('MCP TypeScript 專案測試', () => {
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-mcp-ts-'));
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  it('應該能透過 MCP 建立 TypeScript 專案索引', withMemoryOptimization(async () => {
    const result = await mcpClient.callTool('code_index', {
      path: testProjectPath,
      include: ['**/*.ts'],
      exclude: ['node_modules/**']
    });

    expect(result.success).toBe(true);
    expect(result.data.filesIndexed).toBeGreaterThan(0);
    expect(result.data.symbolsFound).toBeGreaterThan(0);
  }, { testName: 'mcp-typescript-index' }));

  it('應該能透過 MCP 搜尋 TypeScript 程式碼', withMemoryOptimization(async () => {
    // 先建立索引
    await mcpClient.callTool('code_index', {
      path: testProjectPath,
      include: ['**/*.ts']
    });

    // 搜尋程式碼
    const result = await mcpClient.callTool('code_search', {
      path: testProjectPath,
      query: 'interface User',
      type: 'text'
    });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength.greaterThan(0);

    const userInterface = result.data.results.find(r =>
      r.content.includes('interface User')
    );
    expect(userInterface).toBeDefined();
  }, { testName: 'mcp-typescript-search' }));

  it('應該能透過 MCP 分析 TypeScript 程式碼', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_analyze', {
      path: testProjectPath,
      type: 'complexity'
    });

    expect(result.success).toBe(true);
    expect(result.data.summary).toBeDefined();
    expect(result.data.summary.averageComplexity).toBeGreaterThan(0);
  }, { testName: 'mcp-typescript-analyze' }));
});

/**
 * 效能基準測試
 */
describe('TypeScript 專案效能測試', () => {
  let cliRunner: CLIRunner;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-perf-ts-'));
    cliRunner = new CLIRunner();

    testProjectPath = await new ProjectManager().copyProject(FIXTURES_PATH, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('索引建立效能應該符合基準', withMemoryOptimization(async () => {
    const startTime = Date.now();

    const result = await cliRunner.runCommand(['index'], {
      cwd: testProjectPath,
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(10000); // 10 秒內完成
  }, { testName: 'typescript-indexing-performance' }));

  it('搜尋響應時間應該符合基準', withMemoryOptimization(async () => {
    // 先建立索引
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['search', '--query', 'UserService'], {cwd: testProjectPath,});

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(1000); // 1 秒內完成
  }, { testName: 'typescript-search-performance' }));
});