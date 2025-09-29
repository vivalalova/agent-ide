import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CLIRunner } from '../helpers/cli-runner';
import { MCPClient } from '../helpers/mcp-client';
import { ProjectManager } from '../helpers/project-manager';
import { withMemoryOptimization } from '../../test-utils/memory-optimization';

/**
 * JavaScript 專案 E2E 測試
 * 測試真實 JavaScript ES Module 專案的完整工作流程
 */
describe('JavaScript 專案 E2E 測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-js-'));

    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 複製 JavaScript 測試專案
    const fixturesPath = join(process.cwd(), 'tests/e2e/fixtures/javascript');
    testProjectPath = await projectManager.copyProject(fixturesPath, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('ES Module 索引建立', () => {
    it('應該能正確索引 ES Module 專案', withMemoryOptimization(async () => {
      const result = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.js', '--exclude', 'node_modules/**']
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('索引建立完成');

      // 驗證 ES Module 的 import/export
      const searchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'import.*from', '--format', 'json']
      });

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證找到 ES Module import
      const importResult = searchData.results.find(r =>
        r.content.includes("import") && r.content.includes(".js")
      );
      expect(importResult).toBeDefined();
    }, { testName: 'javascript-es-modules' }));

    it('應該能處理動態 import', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'await import', '--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);

      // 如果專案中有動態 import，應該能找到
      if (searchData.results.length > 0) {
        expect(searchData.results[0].content).toContain('import(');
      }
    }, { testName: 'javascript-dynamic-import' }));

    it('應該能識別 JavaScript class 定義', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'class UserController', '--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      const classResult = searchData.results[0];
      expect(classResult.content).toContain('class UserController');
      expect(classResult.file).toContain('user-controller.js');
    }, { testName: 'javascript-class-detection' }));
  });

  describe('JavaScript 依賴關係分析', () => {
    it('應該能分析 ES Module 依賴關係', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const depsData = JSON.parse(result.stdout);

      expect(depsData).toHaveProperty('nodes');
      expect(depsData).toHaveProperty('edges');
      expect(depsData.nodes).toHaveLength.greaterThan(0);

      // 驗證 JavaScript 檔案的依賴關係
      const indexNode = depsData.nodes.find(n => n.id.includes('index.js'));
      expect(indexNode).toBeDefined();

      // 驗證 ES Module 的 import 關係
      const importEdge = depsData.edges.find(e =>
        e.source.includes('index.js') && e.target.includes('.js')
      );
      expect(importEdge).toBeDefined();
    }, { testName: 'javascript-dependencies' }));

    it('應該能檢測 CommonJS 和 ES Module 混合使用', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 搜尋可能的 CommonJS 用法
      const cjsResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'require\\(', '--format', 'json']
      });

      // 搜尋 ES Module 用法
      const esmResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'import.*from', '--format', 'json']
      });

      expect(cjsResult.exitCode).toBe(0);
      expect(esmResult.exitCode).toBe(0);

      const cjsData = JSON.parse(cjsResult.stdout);
      const esmData = JSON.parse(esmResult.stdout);

      // ES Module 專案應該主要使用 import/export
      expect(esmData.results.length).toBeGreaterThan(cjsData.results.length);
    }, { testName: 'javascript-module-types' }));
  });

  describe('JavaScript 程式碼重新命名', () => {
    it('應該能重新命名 JavaScript class', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename'], {
        cwd: testProjectPath,
        args: [
          '--symbol', 'UserController',
          '--new-name', 'UserService',
          '--preview'
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽變更');
      expect(result.stdout).toContain('class UserController');
      expect(result.stdout).toContain('class UserService');
    }, { testName: 'javascript-rename-class' }));

    it('應該能重新命名函式並更新所有引用', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename'], {
        cwd: testProjectPath,
        args: [
          '--symbol', 'createUser',
          '--new-name', 'addUser',
          '--preview'
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('createUser');
      expect(result.stdout).toContain('addUser');

      // 驗證 async 函式的重新命名
      if (result.stdout.includes('async')) {
        expect(result.stdout).toContain('async addUser');
      }
    }, { testName: 'javascript-rename-function' }));
  });

  describe('JavaScript 程式碼重構', () => {
    it('應該能提取 JavaScript async 函式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor'], {
        cwd: testProjectPath,
        args: [
          'extract-function',
          '--file', 'src/controllers/user-controller.js',
          '--start-line', '40',
          '--end-line', '60',
          '--function-name', 'validateUserData'
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重構完成');

      // 驗證提取的 async 函式
      expect(result.stdout).toContain('async function validateUserData');
    }, { testName: 'javascript-extract-async' }));

    it('應該能處理 JavaScript 的複雜物件解構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor'], {
        cwd: testProjectPath,
        args: [
          'extract-function',
          '--file', 'src/controllers/user-controller.js',
          '--start-line', '100',
          '--end-line', '120',
          '--function-name', 'processUserProfile'
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('processUserProfile');
    }, { testName: 'javascript-destructuring' }));
  });

  describe('JavaScript 程式碼分析', () => {
    it('應該能分析 JavaScript 程式碼複雜度', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['complexity', '--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const analysisData = JSON.parse(result.stdout);

      expect(analysisData).toHaveProperty('files');
      expect(analysisData).toHaveProperty('summary');
      expect(analysisData.summary.averageComplexity).toBeGreaterThan(0);

      // 驗證 JavaScript 特定的複雜度計算
      const userControllerFile = analysisData.files.find(f =>
        f.path.includes('user-controller.js')
      );
      expect(userControllerFile).toBeDefined();
      expect(userControllerFile.complexity).toBeGreaterThan(0);
    }, { testName: 'javascript-complexity' }));

    it('應該能檢測 JavaScript 最佳實踐', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['best-practices', '--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const practicesData = JSON.parse(result.stdout);

      expect(practicesData).toHaveProperty('issues');
      expect(practicesData).toHaveProperty('recommendations');

      // 檢查 ES Module 使用建議
      const moduleRecommendation = practicesData.recommendations.find(r =>
        r.type === 'es-modules'
      );
      if (moduleRecommendation) {
        expect(moduleRecommendation.status).toBe('good');
      }
    }, { testName: 'javascript-best-practices' }));

    it('應該能檢測 async/await 模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['patterns', '--pattern', 'async-await', '--format', 'json']
      });

      expect(result.exitCode).toBe(0);
      const patternsData = JSON.parse(result.stdout);

      expect(patternsData.patterns).toContain('async-functions');
      expect(patternsData.patterns).toContain('promise-usage');

      // 驗證 async/await 使用統計
      expect(patternsData.statistics.asyncFunctions).toBeGreaterThan(0);
    }, { testName: 'javascript-async-patterns' }));
  });

  describe('JavaScript 檔案移動', () => {
    it('應該能移動 JavaScript 檔案並更新 ES Module import', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['move'], {
        cwd: testProjectPath,
        args: [
          '--from', 'src/controllers/user-controller.js',
          '--to', 'src/services/user-service.js',
          '--update-imports'
        ]
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('檔案移動完成');

      // 驗證 import 路徑更新
      const searchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'from.*services/user-service', '--format', 'json']
      });

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);
    }, { testName: 'javascript-move-file' }));
  });

  describe('JavaScript 錯誤處理測試', () => {
    it('應該能處理語法錯誤的 JavaScript 檔案', withMemoryOptimization(async () => {
      // 先建立有語法錯誤的檔案
      await projectManager.createFile(
        join(testProjectPath, 'src/broken.js'),
        'const broken = { invalid syntax here'
      );

      const result = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.js']
      });

      // 應該能處理錯誤檔案，但不會中斷整個索引過程
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('語法錯誤');
    }, { testName: 'javascript-syntax-errors' }));

    it('應該能處理不完整的 ES Module import', withMemoryOptimization(async () => {
      // 建立不完整的 import 檔案
      await projectManager.createFile(
        join(testProjectPath, 'src/incomplete.js'),
        'import { something } from'
      );

      const result = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      expect(result.exitCode).toBe(0);
      // 應該有錯誤警告但不會中斷
      expect(result.stderr).toContain('解析錯誤');
    }, { testName: 'javascript-incomplete-imports' }));
  });
});

/**
 * MCP JavaScript 專案測試
 */
describe('MCP JavaScript 專案測試', () => {
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-mcp-js-'));
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    const fixturesPath = join(process.cwd(), 'tests/e2e/fixtures/javascript');
    testProjectPath = await projectManager.copyProject(fixturesPath, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  it('應該能透過 MCP 索引 JavaScript 專案', withMemoryOptimization(async () => {
    const result = await mcpClient.callTool('code_index', {
      path: testProjectPath,
      include: ['**/*.js'],
      exclude: ['node_modules/**']
    });

    expect(result.success).toBe(true);
    expect(result.data.filesIndexed).toBeGreaterThan(0);
    expect(result.data.symbolsFound).toBeGreaterThan(0);

    // 驗證找到的符號包含 JavaScript class
    expect(result.data.symbols).toContain('UserController');
  }, { testName: 'mcp-javascript-index' }));

  it('應該能透過 MCP 搜尋 JavaScript ES Module', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_search', {
      path: testProjectPath,
      query: 'export class',
      type: 'text'
    });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength.greaterThan(0);

    const exportResult = result.data.results.find(r =>
      r.content.includes('export class')
    );
    expect(exportResult).toBeDefined();
  }, { testName: 'mcp-javascript-search' }));

  it('應該能透過 MCP 重新命名 JavaScript 符號', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_rename', {
      path: testProjectPath,
      symbol: 'Logger',
      newName: 'ApplicationLogger',
      preview: true
    });

    expect(result.success).toBe(true);
    expect(result.data.changes).toHaveLength.greaterThan(0);

    const loggerChange = result.data.changes.find(c =>
      c.content.includes('class Logger') || c.content.includes('class ApplicationLogger')
    );
    expect(loggerChange).toBeDefined();
  }, { testName: 'mcp-javascript-rename' }));
});

/**
 * JavaScript 專案效能測試
 */
describe('JavaScript 專案效能測試', () => {
  let cliRunner: CLIRunner;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-perf-js-'));
    cliRunner = new CLIRunner();

    const fixturesPath = join(process.cwd(), 'tests/e2e/fixtures/javascript');
    testProjectPath = await new ProjectManager().copyProject(fixturesPath, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('JavaScript 索引建立效能測試', withMemoryOptimization(async () => {
    const startTime = Date.now();

    const result = await cliRunner.runCommand(['index'], {
      cwd: testProjectPath,
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(8000); // JavaScript 解析應該比 TypeScript 快
  }, { testName: 'javascript-indexing-performance' }));

  it('JavaScript 搜尋效能測試', withMemoryOptimization(async () => {
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['search'], {
      cwd: testProjectPath,
      args: ['--query', 'async function']
    });

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(500); // 0.5 秒內完成
  }, { testName: 'javascript-search-performance' }));

  it('JavaScript 重構效能測試', withMemoryOptimization(async () => {
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['refactor'], {
      cwd: testProjectPath,
      args: [
        'extract-function',
        '--file', 'src/controllers/user-controller.js',
        '--start-line', '20',
        '--end-line', '40',
        '--function-name', 'testExtraction'
      ]
    });

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(2000); // 2 秒內完成
  }, { testName: 'javascript-refactor-performance' }));
});