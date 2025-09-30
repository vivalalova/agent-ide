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
const FIXTURES_PATH = join(__dirname, '../fixtures/swift');

/**
 * Swift 專案 E2E 測試
 * 測試 Swift Package Manager 專案的完整工作流程
 */
describe('Swift 專案 E2E 測試', () => {
  let cliRunner: CLIRunner;
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-e2e-swift-'));

    cliRunner = new CLIRunner();
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    // 複製 Swift 測試專案
    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('Swift Package Manager 專案索引', () => {
    it('應該能正確索引 Swift 專案結構', withMemoryOptimization(async () => {
      const result = await cliRunner.runCommand(['index', '--extensions', '.swift', '--exclude', '.build/**'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('✅ 索引完成!');

      // 驗證 Swift 檔案索引
      const searchResult = await cliRunner.runCommand(['search', '--query', 'import Foundation', '--format', 'json'], {cwd: testProjectPath,});

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證找到 Swift import 語句
      const importResult = searchData.results.find(r =>
        r.content.includes('import Foundation')
      );
      expect(importResult).toBeDefined();
      expect(importResult.file).toContain('.swift');
    }, { testName: 'swift-package-indexing' }));

    it('應該能識別 Swift 協議和類別定義', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 搜尋協議定義
      const protocolResult = await cliRunner.runCommand(['search', '--query', 'protocol.*:', '--format', 'json'], {cwd: testProjectPath,});

      expect(protocolResult.exitCode).toBe(0);
      const protocolData = JSON.parse(protocolResult.stdout);
      expect(protocolData.results).toHaveLength.greaterThan(0);

      // 搜尋類別定義
      const classResult = await cliRunner.runCommand(['search', '--query', 'class.*:', '--format', 'json'], {cwd: testProjectPath,});

      expect(classResult.exitCode).toBe(0);
      const classData = JSON.parse(classResult.stdout);
      expect(classData.results).toHaveLength.greaterThan(0);

      // 驗證找到 User 類別
      const userClass = classData.results.find(r =>
        r.content.includes('class User')
      );
      expect(userClass).toBeDefined();
    }, { testName: 'swift-protocols-classes' }));

    it('應該能處理 Swift async/await 語法', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['search', '--query', 'async.*throws', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證 async/await 函式
      const asyncFunction = searchData.results.find(r =>
        r.content.includes('async') && r.content.includes('throws')
      );
      expect(asyncFunction).toBeDefined();
    }, { testName: 'swift-async-await' }));

    it('應該能識別 Swift Actor 定義', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['search', '--query', 'actor.*{', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const searchData = JSON.parse(result.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 驗證 UserService actor
      const actorResult = searchData.results.find(r =>
        r.content.includes('actor UserService')
      );
      expect(actorResult).toBeDefined();
    }, { testName: 'swift-actors' }));
  });

  describe('Swift 依賴關係分析', () => {
    it('應該能分析 Swift 模組依賴', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['deps', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const depsData = JSON.parse(result.stdout);

      expect(depsData).toHaveProperty('nodes');
      expect(depsData).toHaveProperty('edges');
      expect(depsData.nodes).toHaveLength.greaterThan(0);

      // 驗證 Swift 檔案依賴
      const userModelNode = depsData.nodes.find(n =>
        n.id.includes('User.swift')
      );
      expect(userModelNode).toBeDefined();

      // 驗證 Swift package 依賴
      const packageDeps = depsData.externalDependencies;
      expect(packageDeps).toContain('Foundation');
      expect(packageDeps).toContain('Crypto');
    }, { testName: 'swift-dependencies' }));

    it('應該能檢測 Swift Package Manager 依賴', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 分析 Package.swift 依賴
      const result = await cliRunner.runCommand(['deps', '--file', 'Package.swift', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const depsData = JSON.parse(result.stdout);

      // 驗證外部套件依賴
      expect(depsData.packageDependencies).toContain('swift-async-algorithms');
      expect(depsData.packageDependencies).toContain('swift-collections');
      expect(depsData.packageDependencies).toContain('swift-crypto');
    }, { testName: 'swift-package-dependencies' }));
  });

  describe('Swift 程式碼重新命名', () => {
    it('應該能重新命名 Swift struct', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename', '--symbol', 'UserProfile',
          '--new-name', 'UserProfileModel',
          '--preview'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('預覽變更');
      expect(result.stdout).toContain('struct UserProfile');
      expect(result.stdout).toContain('struct UserProfileModel');
    }, { testName: 'swift-rename-struct' }));

    it('應該能重新命名 Swift enum', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename', '--symbol', 'UserStatus',
          '--new-name', 'AccountStatus',
          '--preview'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('enum UserStatus');
      expect(result.stdout).toContain('enum AccountStatus');

      // 驗證 enum case 引用也會更新
      expect(result.stdout).toContain('AccountStatus.active');
    }, { testName: 'swift-rename-enum' }));

    it('應該能重新命名 Swift actor 方法', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['rename', '--symbol', 'createUser',
          '--new-name', 'addUser',
          '--preview'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('createUser');
      expect(result.stdout).toContain('addUser');

      // 驗證 async 函式的重新命名
      expect(result.stdout).toContain('async throws -> User');
    }, { testName: 'swift-rename-actor-method' }));
  });

  describe('Swift 程式碼重構', () => {
    it('應該能提取 Swift async 函式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor', 'extract-function',
          '--file', 'Sources/SwiftTestProject/Services/UserService.swift',
          '--start-line', '50',
          '--end-line', '70',
          '--function-name', 'validateUserInput'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重構完成');

      // 驗證提取的 async 函式
      expect(result.stdout).toContain('func validateUserInput');
      expect(result.stdout).toContain('async throws');
    }, { testName: 'swift-extract-async-function' }));

    it('應該能處理 Swift actor 方法的重構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor', 'extract-function',
          '--file', 'Sources/SwiftTestProject/Services/UserService.swift',
          '--start-line', '100',
          '--end-line', '120',
          '--function-name', 'processUserAnalytics'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('processUserAnalytics');

      // 驗證 actor isolation
      expect(result.stdout).toContain('private func processUserAnalytics');
    }, { testName: 'swift-actor-method-refactor' }));

    it('應該能重構 Swift TaskGroup 模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['refactor', 'extract-function',
          '--file', 'Sources/SwiftTestProject/Models/User.swift',
          '--start-line', '80',
          '--end-line', '100',
          '--function-name', 'calculateConcurrentScores'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('calculateConcurrentScores');
      expect(result.stdout).toContain('withTaskGroup');
    }, { testName: 'swift-taskgroup-refactor' }));
  });

  describe('Swift 程式碼分析', () => {
    it('應該能分析 Swift 程式碼複雜度', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'complexity', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const analysisData = JSON.parse(result.stdout);

      expect(analysisData).toHaveProperty('files');
      expect(analysisData).toHaveProperty('summary');
      expect(analysisData.summary.averageComplexity).toBeGreaterThan(0);

      // 驗證 Swift 檔案複雜度
      const userServiceFile = analysisData.files.find(f =>
        f.path.includes('UserService.swift')
      );
      expect(userServiceFile).toBeDefined();
      expect(userServiceFile.complexity).toBeGreaterThan(0);
    }, { testName: 'swift-complexity' }));

    it('應該能檢測 Swift 併發模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'patterns', '--pattern', 'concurrency', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const patternsData = JSON.parse(result.stdout);

      expect(patternsData.patterns).toContain('actor-usage');
      expect(patternsData.patterns).toContain('async-await');
      expect(patternsData.patterns).toContain('task-groups');

      // 驗證併發統計
      expect(patternsData.statistics.actorCount).toBeGreaterThan(0);
      expect(patternsData.statistics.asyncFunctions).toBeGreaterThan(0);
    }, { testName: 'swift-concurrency-patterns' }));

    it('應該能檢測 Swift 記憶體安全模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'memory-safety', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const safetyData = JSON.parse(result.stdout);

      expect(safetyData).toHaveProperty('sendableUsage');
      expect(safetyData).toHaveProperty('actorIsolation');
      expect(safetyData).toHaveProperty('dataRaceDetection');

      // 驗證 Sendable 協議使用
      expect(safetyData.sendableUsage.conformingTypes).toBeGreaterThan(0);
    }, { testName: 'swift-memory-safety' }));

    it('應該能分析 Swift API 設計模式', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['analyze', 'api-design', '--format', 'json'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      const apiData = JSON.parse(result.stdout);

      expect(apiData.patterns).toContain('protocol-oriented');
      expect(apiData.patterns).toContain('value-types');
      expect(apiData.patterns).toContain('error-handling');

      // 驗證 Swift API 設計指南遵循情況
      expect(apiData.swiftAPIGuidelines.naming).toBeGreaterThan(80); // 80% 以上符合命名規範
    }, { testName: 'swift-api-design' }));
  });

  describe('Swift 檔案移動', () => {
    it('應該能移動 Swift 檔案並更新 import', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const result = await cliRunner.runCommand(['move', '--from', 'Sources/SwiftTestProject/Models/User.swift',
          '--to', 'Sources/SwiftTestProject/Core/Models/User.swift',
          '--update-imports'], {cwd: testProjectPath,});

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('檔案移動完成');

      // 驗證 import 路徑更新（如果有模組內 import）
      const searchResult = await cliRunner.runCommand(['search', '--query', 'import.*SwiftTestProject', '--format', 'json'], {cwd: testProjectPath,});

      expect(searchResult.exitCode).toBe(0);
    }, { testName: 'swift-move-file' }));
  });

  describe('Swift 錯誤處理測試', () => {
    it('應該能處理 Swift 語法錯誤', withMemoryOptimization(async () => {
      // 建立有語法錯誤的 Swift 檔案
      await projectManager.createFile(
        join(testProjectPath, 'Sources/SwiftTestProject/Broken.swift'),
        'import Foundation\nstruct Broken {\n    let invalid syntax here\n}'
      );

      const result = await cliRunner.runCommand(['index', '--extensions', '.swift'], {cwd: testProjectPath,});

      // 應該能處理錯誤檔案但不中斷整個索引
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('語法錯誤');
    }, { testName: 'swift-syntax-errors' }));

    it('應該能處理不完整的 Swift package 定義', withMemoryOptimization(async () => {
      // 建立不完整的 Package.swift
      await projectManager.createFile(
        join(testProjectPath, 'Package-broken.swift'),
        'import PackageDescription\nlet package = Package('
      );

      const result = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath
      });

      expect(result.exitCode).toBe(0);
      // 應該有警告但不會中斷
      expect(result.stderr).toContain('解析錯誤');
    }, { testName: 'swift-incomplete-package' }));
  });
});

/**
 * MCP Swift 專案測試
 */
describe('MCP Swift 專案測試', () => {
  let mcpClient: MCPClient;
  let projectManager: ProjectManager;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-mcp-swift-'));
    mcpClient = new MCPClient();
    projectManager = new ProjectManager();

    testProjectPath = await projectManager.copyProject(FIXTURES_PATH, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  it('應該能透過 MCP 索引 Swift 專案', withMemoryOptimization(async () => {
    const result = await mcpClient.callTool('code_index', {
      path: testProjectPath,
      include: ['**/*.swift'],
      exclude: ['.build/**', '**/.build/**']
    });

    expect(result.success).toBe(true);
    expect(result.data.filesIndexed).toBeGreaterThan(0);
    expect(result.data.symbolsFound).toBeGreaterThan(0);

    // 驗證找到的符號包含 Swift 類型
    expect(result.data.symbols).toContain('User');
    expect(result.data.symbols).toContain('UserService');
  }, { testName: 'mcp-swift-index' }));

  it('應該能透過 MCP 搜尋 Swift 協議', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_search', {
      path: testProjectPath,
      query: 'protocol.*:',
      type: 'text'
    });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength.greaterThan(0);

    // 驗證找到協議定義
    const protocolResult = result.data.results.find(r =>
      r.content.includes('protocol') && r.content.includes(':')
    );
    expect(protocolResult).toBeDefined();
  }, { testName: 'mcp-swift-protocols' }));

  it('應該能透過 MCP 分析 Swift actor', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_analyze', {
      path: testProjectPath,
      type: 'actors'
    });

    expect(result.success).toBe(true);
    expect(result.data.actors).toHaveLength.greaterThan(0);

    // 驗證 actor 分析
    const userServiceActor = result.data.actors.find(a =>
      a.name === 'UserService'
    );
    expect(userServiceActor).toBeDefined();
    expect(userServiceActor.methods).toHaveLength.greaterThan(0);
  }, { testName: 'mcp-swift-actors' }));

  it('應該能透過 MCP 重新命名 Swift 符號', withMemoryOptimization(async () => {
    await mcpClient.callTool('code_index', { path: testProjectPath });

    const result = await mcpClient.callTool('code_rename', {
      path: testProjectPath,
      symbol: 'Theme',
      newName: 'AppTheme',
      preview: true
    });

    expect(result.success).toBe(true);
    expect(result.data.changes).toHaveLength.greaterThan(0);

    // 驗證 enum 重新命名
    const enumChange = result.data.changes.find(c =>
      c.content.includes('enum Theme') || c.content.includes('enum AppTheme')
    );
    expect(enumChange).toBeDefined();
  }, { testName: 'mcp-swift-rename' }));
});

/**
 * Swift 專案效能測試
 */
describe('Swift 專案效能測試', () => {
  let cliRunner: CLIRunner;
  let testProjectPath: string;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agent-ide-perf-swift-'));
    cliRunner = new CLIRunner();

    testProjectPath = await new ProjectManager().copyProject(FIXTURES_PATH, tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('Swift 索引建立效能測試', withMemoryOptimization(async () => {
    const startTime = Date.now();

    const result = await cliRunner.runCommand(['index'], {
      cwd: testProjectPath,
      timeout: 30000
    });

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(15000); // Swift 解析可能較慢
  }, { testName: 'swift-indexing-performance' }));

  it('Swift 搜尋效能測試', withMemoryOptimization(async () => {
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['search', '--query', 'actor UserService'], {cwd: testProjectPath,});

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(1000); // 1 秒內完成
  }, { testName: 'swift-search-performance' }));

  it('Swift 依賴分析效能測試', withMemoryOptimization(async () => {
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['deps', '--format', 'json'], {cwd: testProjectPath,});

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(5000); // 5 秒內完成
  }, { testName: 'swift-deps-performance' }));

  it('Swift 併發分析效能測試', withMemoryOptimization(async () => {
    await cliRunner.runCommand(['index'], { cwd: testProjectPath });

    const startTime = Date.now();

    const result = await cliRunner.runCommand(['analyze', 'concurrency', '--format', 'json'], {cwd: testProjectPath,});

    const duration = Date.now() - startTime;

    expect(result.exitCode).toBe(0);
    expect(duration).toBeLessThan(3000); // 3 秒內完成
  }, { testName: 'swift-concurrency-performance' }));
});