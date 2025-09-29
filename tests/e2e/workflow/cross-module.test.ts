import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { CLIRunner } from '../helpers/cli-runner';
import { MCPClient } from '../helpers/mcp-client';
import { ProjectManager } from '../helpers/project-manager';
import { withMemoryOptimization } from '../../test-utils/memory-optimization';

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
    const fixturesPath = join(process.cwd(), 'tests/e2e/fixtures/typescript');
    testProjectPath = await projectManager.copyProject(fixturesPath, tempDir);

    await mcpClient.connect();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    await mcpClient.disconnect();
  });

  describe('Indexing + Search + Analysis 整合', () => {
    it('應該能執行完整的程式碼分析工作流程', withMemoryOptimization(async () => {
      // 模組 1: Indexing - 建立程式碼索引
      const indexResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.ts', '--exclude', 'node_modules/**']
      });

      expect(indexResult.exitCode).toBe(0);
      expect(indexResult.stdout).toContain('索引建立完成');

      // 模組 2: Search - 搜尋複雜函式
      const searchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'async.*throws.*Promise', '--format', 'json']
      });

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 模組 3: Analysis - 分析搜尋到的複雜函式
      const complexFunction = searchData.results[0];
      const analysisResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: [
          'complexity',
          '--file', complexFunction.file,
          '--line', complexFunction.line.toString(),
          '--format', 'json'
        ]
      });

      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.complexity).toBeGreaterThan(0);

      // 驗證工作流程產生有意義的結果
      expect(analysisData.suggestions).toBeDefined();
      if (analysisData.complexity > 10) {
        expect(analysisData.suggestions).toContain('consider-refactoring');
      }
    }, { testName: 'indexing-search-analysis-workflow' }));

    it('應該能進行語義搜尋和結構化分析', withMemoryOptimization(async () => {
      // 建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 語義搜尋：找到使用者管理相關的程式碼
      const semanticResult = await mcpClient.callTool('code_search', {
        path: testProjectPath,
        query: 'user authentication validation',
        type: 'semantic',
        maxResults: 10
      });

      expect(semanticResult.success).toBe(true);
      expect(semanticResult.data.results).toHaveLength.greaterThan(0);

      // 結構化分析：分析找到的檔案結構
      const userServiceFile = semanticResult.data.results.find(r =>
        r.file.includes('user-service')
      );

      if (userServiceFile) {
        const structureResult = await cliRunner.runCommand(['analyze'], {
          cwd: testProjectPath,
          args: [
            'structure',
            '--file', userServiceFile.file,
            '--format', 'json'
          ]
        });

        expect(structureResult.exitCode).toBe(0);
        const structureData = JSON.parse(structureResult.stdout);
        expect(structureData.classes).toHaveLength.greaterThan(0);
        expect(structureData.methods).toHaveLength.greaterThan(0);
      }
    }, { testName: 'semantic-search-structure-analysis' }));
  });

  describe('Dependency + Move + Rename 整合', () => {
    it('應該能安全地重構程式碼結構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 模組 1: Dependency - 分析依賴關係
      const depsResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--file', 'src/core/user-service.ts', '--format', 'json']
      });

      expect(depsResult.exitCode).toBe(0);
      const depsData = JSON.parse(depsResult.stdout);
      expect(depsData.dependencies).toBeDefined();

      // 記錄原始依賴關係
      const originalDependencies = depsData.dependencies['src/core/user-service.ts'];

      // 模組 2: Move - 移動檔案到新位置
      const moveResult = await cliRunner.runCommand(['move'], {
        cwd: testProjectPath,
        args: [
          '--from', 'src/core/user-service.ts',
          '--to', 'src/services/user-service.ts',
          '--update-imports'
        ]
      });

      expect(moveResult.exitCode).toBe(0);
      expect(moveResult.stdout).toContain('檔案移動完成');

      // 模組 3: Rename - 重新命名類別
      const renameResult = await cliRunner.runCommand(['rename'], {
        cwd: testProjectPath,
        args: [
          '--symbol', 'UserService',
          '--new-name', 'UserManager',
          '--confirm'
        ]
      });

      expect(renameResult.exitCode).toBe(0);
      expect(renameResult.stdout).toContain('重新命名完成');

      // 驗證：重新分析依賴關係確保完整性
      const verifyDepsResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--format', 'json']
      });

      expect(verifyDepsResult.exitCode).toBe(0);
      const verifyDepsData = JSON.parse(verifyDepsResult.stdout);

      // 驗證新位置的檔案存在於依賴圖中
      const newFileNode = verifyDepsData.nodes.find(n =>
        n.id.includes('src/services/user-service.ts')
      );
      expect(newFileNode).toBeDefined();

      // 驗證沒有破壞的依賴關係
      expect(verifyDepsData.brokenDependencies || []).toHaveLength(0);
    }, { testName: 'dependency-move-rename-workflow' }));

    it('應該能處理複雜的重構場景', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 創建複雜的重構場景：移動多個相關檔案
      const filesToMove = [
        { from: 'src/types/config.ts', to: 'src/shared/types/config.ts' },
        { from: 'src/utils/logger.ts', to: 'src/shared/utils/logger.ts' }
      ];

      for (const file of filesToMove) {
        // 分析移動前的依賴
        const preMoveDeps = await cliRunner.runCommand(['deps'], {
          cwd: testProjectPath,
          args: ['--file', file.from, '--format', 'json']
        });

        expect(preMoveDeps.exitCode).toBe(0);

        // 執行移動
        const moveResult = await cliRunner.runCommand(['move'], {
          cwd: testProjectPath,
          args: [
            '--from', file.from,
            '--to', file.to,
            '--update-imports'
          ]
        });

        expect(moveResult.exitCode).toBe(0);
      }

      // 驗證所有依賴關係仍然正確
      const finalDepsResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--check-integrity', '--format', 'json']
      });

      expect(finalDepsResult.exitCode).toBe(0);
      const finalDepsData = JSON.parse(finalDepsResult.stdout);
      expect(finalDepsData.integrityCheck.passed).toBe(true);
    }, { testName: 'complex-refactoring-scenario' }));
  });

  describe('Analysis + Refactor + Search 整合', () => {
    it('應該能基於分析結果執行智能重構', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 模組 1: Analysis - 找到複雜度高的函式
      const complexityResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['complexity', '--threshold', '8', '--format', 'json']
      });

      expect(complexityResult.exitCode).toBe(0);
      const complexityData = JSON.parse(complexityResult.stdout);

      const complexFunction = complexityData.files
        .flatMap(f => f.functions || [])
        .find(fn => fn.complexity > 8);

      if (complexFunction) {
        // 模組 2: Refactor - 提取複雜函式的部分邏輯
        const refactorResult = await cliRunner.runCommand(['refactor'], {
          cwd: testProjectPath,
          args: [
            'extract-function',
            '--file', complexFunction.file,
            '--start-line', (complexFunction.startLine + 2).toString(),
            '--end-line', (complexFunction.endLine - 2).toString(),
            '--function-name', 'extractedLogic'
          ]
        });

        expect(refactorResult.exitCode).toBe(0);

        // 模組 3: Search - 驗證重構結果
        const searchResult = await cliRunner.runCommand(['search'], {
          cwd: testProjectPath,
          args: ['--query', 'extractedLogic', '--format', 'json']
        });

        expect(searchResult.exitCode).toBe(0);
        const searchData = JSON.parse(searchResult.stdout);
        expect(searchData.results).toHaveLength.greaterThan(0);

        // 驗證：重新分析複雜度是否降低
        const newComplexityResult = await cliRunner.runCommand(['analyze'], {
          cwd: testProjectPath,
          args: [
            'complexity',
            '--file', complexFunction.file,
            '--format', 'json'
          ]
        });

        expect(newComplexityResult.exitCode).toBe(0);
        const newComplexityData = JSON.parse(newComplexityResult.stdout);

        // 重構後的函式複雜度應該降低
        const refactoredFunction = newComplexityData.functions.find(fn =>
          fn.name === complexFunction.name
        );

        if (refactoredFunction) {
          expect(refactoredFunction.complexity).toBeLessThan(complexFunction.complexity);
        }
      }
    }, { testName: 'analysis-refactor-search-workflow' }));

    it('應該能識別和修復設計模式問題', withMemoryOptimization(async () => {
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 分析設計模式
      const patternsResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['patterns', '--include-antipatterns', '--format', 'json']
      });

      expect(patternsResult.exitCode).toBe(0);
      const patternsData = JSON.parse(patternsResult.stdout);

      // 如果發現反模式，嘗試修復
      if (patternsData.antipatterns && patternsData.antipatterns.length > 0) {
        const antipattern = patternsData.antipatterns[0];

        // 使用重構工具修復反模式
        const fixResult = await cliRunner.runCommand(['refactor'], {
          cwd: testProjectPath,
          args: [
            'fix-pattern',
            '--file', antipattern.file,
            '--pattern', antipattern.type,
            '--strategy', 'recommended'
          ]
        });

        expect(fixResult.exitCode).toBe(0);

        // 驗證修復結果
        const verifyResult = await cliRunner.runCommand(['analyze'], {
          cwd: testProjectPath,
          args: [
            'patterns',
            '--file', antipattern.file,
            '--format', 'json'
          ]
        });

        expect(verifyResult.exitCode).toBe(0);
        const verifyData = JSON.parse(verifyResult.stdout);

        // 該反模式應該已被修復
        const remainingAntipatterns = verifyData.antipatterns || [];
        const fixedAntipattern = remainingAntipatterns.find(ap =>
          ap.file === antipattern.file && ap.type === antipattern.type
        );
        expect(fixedAntipattern).toBeUndefined();
      }
    }, { testName: 'pattern-analysis-fix-workflow' }));
  });

  describe('全模組整合工作流程', () => {
    it('應該能執行完整的程式碼品質改善流程', withMemoryOptimization(async () => {
      // 階段 1: 全面索引和基礎分析
      console.log('階段 1: 全面索引和基礎分析');

      // Indexing 模組
      const indexResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.ts', '--comprehensive']
      });
      expect(indexResult.exitCode).toBe(0);

      // Dependency 模組 - 分析整體架構
      const archResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--analyze-architecture', '--format', 'json']
      });
      expect(archResult.exitCode).toBe(0);

      // Analysis 模組 - 全面品質分析
      const qualityResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['quality', '--comprehensive', '--format', 'json']
      });
      expect(qualityResult.exitCode).toBe(0);

      const qualityData = JSON.parse(qualityResult.stdout);
      const initialScore = qualityData.overallScore;

      console.log(`初始品質分數: ${initialScore}`);

      // 階段 2: 識別和修復問題
      console.log('階段 2: 識別和修復問題');

      // 尋找需要重構的程式碼
      const issuesResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['issues', '--severity', 'medium', '--format', 'json']
      });
      expect(issuesResult.exitCode).toBe(0);

      const issuesData = JSON.parse(issuesResult.stdout);
      console.log(`發現 ${issuesData.issues.length} 個問題`);

      // 修復最嚴重的問題
      const criticalIssues = issuesData.issues
        .filter(issue => issue.severity === 'high' || issue.severity === 'medium')
        .slice(0, 3); // 修復前 3 個問題

      for (const issue of criticalIssues) {
        if (issue.type === 'complexity') {
          // Refactor 模組 - 降低複雜度
          const refactorResult = await cliRunner.runCommand(['refactor'], {
            cwd: testProjectPath,
            args: [
              'reduce-complexity',
              '--file', issue.file,
              '--function', issue.target
            ]
          });
          expect(refactorResult.exitCode).toBe(0);
        } else if (issue.type === 'naming') {
          // Rename 模組 - 改善命名
          const renameResult = await cliRunner.runCommand(['rename'], {
            cwd: testProjectPath,
            args: [
              '--symbol', issue.target,
              '--suggest-name',
              '--confirm'
            ]
          });
          expect(renameResult.exitCode).toBe(0);
        } else if (issue.type === 'structure') {
          // Move 模組 - 重組結構
          const moveResult = await cliRunner.runCommand(['move'], {
            cwd: testProjectPath,
            args: [
              '--reorganize',
              '--file', issue.file,
              '--strategy', 'recommended'
            ]
          });
          expect(moveResult.exitCode).toBe(0);
        }
      }

      // 階段 3: 驗證改善結果
      console.log('階段 3: 驗證改善結果');

      // 重新索引以反映變更
      await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--incremental']
      });

      // Search 模組 - 驗證修復的程式碼
      const verifySearchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'TODO|FIXME|HACK', '--format', 'json']
      });
      expect(verifySearchResult.exitCode).toBe(0);

      // 重新評估品質
      const finalQualityResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['quality', '--comprehensive', '--format', 'json']
      });
      expect(finalQualityResult.exitCode).toBe(0);

      const finalQualityData = JSON.parse(finalQualityResult.stdout);
      const finalScore = finalQualityData.overallScore;

      console.log(`最終品質分數: ${finalScore}`);

      // 驗證品質有所改善
      expect(finalScore).toBeGreaterThanOrEqual(initialScore);

      // 最終架構檢查
      const finalArchResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--check-integrity', '--format', 'json']
      });
      expect(finalArchResult.exitCode).toBe(0);

      const finalArchData = JSON.parse(finalArchResult.stdout);
      expect(finalArchData.integrityCheck.passed).toBe(true);
      expect(finalArchData.integrityCheck.violations).toHaveLength(0);

    }, { testName: 'complete-quality-improvement-workflow' }));

    it('應該能處理大型重構專案', withMemoryOptimization(async () => {
      // 建立複雜的專案結構
      const additionalFiles = [
        'src/controllers/user-controller.ts',
        'src/controllers/product-controller.ts',
        'src/models/product.ts',
        'src/models/order.ts',
        'src/repositories/user-repository.ts',
        'src/repositories/product-repository.ts'
      ];

      for (const filePath of additionalFiles) {
        await projectManager.createFile(
          join(testProjectPath, filePath),
          `// Generated file for testing\nexport class ${filePath.split('/').pop()?.replace('.ts', '').replace(/[-_]/g, '')} {}`
        );
      }

      // 完整索引
      await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--include', '**/*.ts']
      });

      // 大型重構：重組整個專案結構
      const restructureResult = await cliRunner.runCommand(['move'], {
        cwd: testProjectPath,
        args: [
          '--reorganize-project',
          '--strategy', 'domain-driven',
          '--preview'
        ]
      });

      expect(restructureResult.exitCode).toBe(0);
      expect(restructureResult.stdout).toContain('重組計畫');

      // 確認重組計畫合理
      const restructurePlan = restructureResult.stdout;
      expect(restructurePlan).toContain('src/domains/');
      expect(restructurePlan).toContain('移動檔案');

      // 應用重組
      const applyResult = await cliRunner.runCommand(['move'], {
        cwd: testProjectPath,
        args: [
          '--reorganize-project',
          '--strategy', 'domain-driven',
          '--confirm'
        ]
      });

      expect(applyResult.exitCode).toBe(0);

      // 驗證重組結果
      const verifyResult = await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--check-integrity', '--format', 'json']
      });

      expect(verifyResult.exitCode).toBe(0);
      const verifyData = JSON.parse(verifyResult.stdout);
      expect(verifyData.integrityCheck.passed).toBe(true);

      // 最終品質檢查
      const qualityCheckResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['architecture', '--format', 'json']
      });

      expect(qualityCheckResult.exitCode).toBe(0);
      const qualityData = JSON.parse(qualityCheckResult.stdout);
      expect(qualityData.architectureScore).toBeGreaterThan(7); // 架構分數應該 > 7

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
      expect(indexResult.stderr).toContain('警告'); // 但應該有警告

      // 搜尋階段 - 應該跳過有問題的檔案
      const searchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'broken', '--format', 'json']
      });

      expect(searchResult.exitCode).toBe(0);

      // 分析階段 - 應該報告檔案問題
      const analysisResult = await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['errors', '--format', 'json']
      });

      expect(analysisResult.exitCode).toBe(0);
      const analysisData = JSON.parse(analysisResult.stdout);
      expect(analysisData.syntaxErrors).toHaveLength.greaterThan(0);

      const brokenFileError = analysisData.syntaxErrors.find(err =>
        err.file.includes('broken.ts')
      );
      expect(brokenFileError).toBeDefined();
    }, { testName: 'cross-module-error-handling' }));

    it('應該能從部分失敗中恢復', withMemoryOptimization(async () => {
      // 先建立正常的索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      // 破壞一個檔案
      const corruptFile = join(testProjectPath, 'src/core/database.ts');
      const originalContent = await projectManager.readFile(corruptFile);

      await projectManager.createFile(corruptFile, 'corrupted content {{{');

      // 嘗試更新索引 - 應該部分成功
      const updateResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--incremental']
      });

      expect(updateResult.exitCode).toBe(0);

      // 搜尋仍然應該能找到其他檔案的內容
      const searchResult = await cliRunner.runCommand(['search'], {
        cwd: testProjectPath,
        args: ['--query', 'UserService', '--format', 'json']
      });

      expect(searchResult.exitCode).toBe(0);
      const searchData = JSON.parse(searchResult.stdout);
      expect(searchData.results).toHaveLength.greaterThan(0);

      // 修復檔案
      await projectManager.createFile(corruptFile, originalContent);

      // 重新索引應該完全成功
      const fixResult = await cliRunner.runCommand(['index'], {
        cwd: testProjectPath,
        args: ['--incremental']
      });

      expect(fixResult.exitCode).toBe(0);
      expect(fixResult.stderr).not.toContain('錯誤');
    }, { testName: 'partial-failure-recovery' }));
  });

  describe('效能和記憶體管理', () => {
    it('跨模組操作應該有效管理記憶體', withMemoryOptimization(async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 執行記憶體密集的跨模組操作
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const afterIndexMemory = process.memoryUsage().heapUsed;

      await cliRunner.runCommand(['analyze'], {
        cwd: testProjectPath,
        args: ['comprehensive']
      });

      const afterAnalysisMemory = process.memoryUsage().heapUsed;

      await cliRunner.runCommand(['deps'], {
        cwd: testProjectPath,
        args: ['--detailed']
      });

      const finalMemory = process.memoryUsage().heapUsed;

      // 記憶體增長應該是合理的
      const totalGrowth = finalMemory - initialMemory;
      expect(totalGrowth).toBeLessThan(500 * 1024 * 1024); // < 500MB

      // 模擬垃圾回收
      if (global.gc) {
        global.gc();
      }

      const afterGCMemory = process.memoryUsage().heapUsed;

      // 垃圾回收後記憶體應該顯著減少
      expect(afterGCMemory).toBeLessThan(finalMemory);

    }, { testName: 'cross-module-memory-management' }));

    it('並行跨模組操作應該保持效能', withMemoryOptimization(async () => {
      // 先建立索引
      await cliRunner.runCommand(['index'], { cwd: testProjectPath });

      const startTime = Date.now();

      // 並行執行多個跨模組操作
      const operations = await Promise.all([
        cliRunner.runCommand(['search'], {
          cwd: testProjectPath,
          args: ['--query', 'class.*Service']
        }),
        cliRunner.runCommand(['analyze'], {
          cwd: testProjectPath,
          args: ['complexity']
        }),
        cliRunner.runCommand(['deps'], {
          cwd: testProjectPath,
          args: ['--format', 'json']
        }),
        mcpClient.callTool('code_search', {
          path: testProjectPath,
          query: 'interface'
        }),
        mcpClient.callTool('code_analyze', {
          path: testProjectPath,
          type: 'quality'
        })
      ]);

      const duration = Date.now() - startTime;

      // 所有操作都應該成功
      operations.forEach((result, index) => {
        if (index < 3) {
          // CLI 操作
          expect(result.exitCode).toBe(0);
        } else {
          // MCP 操作
          expect(result.success).toBe(true);
        }
      });

      // 並行執行應該比順序執行快
      expect(duration).toBeLessThan(30000); // 30 秒內完成

    }, { testName: 'concurrent-cross-module-performance' }));
  });
});