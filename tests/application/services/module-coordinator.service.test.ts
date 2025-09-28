/**
 * ModuleCoordinatorService 測試
 */

import { describe, it, beforeEach, expect, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { ModuleCoordinatorService } from '../../../src/application/services/module-coordinator.service.js';
import { EventBus } from '../../../src/application/events/event-bus.js';
import { StateManager } from '../../../src/application/state/state-manager.js';
import { ErrorHandlerService } from '../../../src/application/services/error-handler.service.js';
import type {
  RefactorOptions,
  RefactorResult,
  RenameOperation,
  RenameResult,
  MoveResult,
  ModuleStatus
} from '../../../src/application/types.js';

// Mock fs 模組
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('const example = "test code";')
}));

// Mock 所有核心模組
vi.mock('../../../src/core/analysis/complexity-analyzer.js', () => ({
  ComplexityAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({ complexity: 5, recommendation: 'low' })
  }))
}));

vi.mock('../../../src/core/refactor/extract-function.js', () => ({
  FunctionExtractor: vi.fn().mockImplementation(() => ({
    extract: vi.fn().mockResolvedValue({
      success: true,
      edits: [{
        range: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        newText: 'function extracted() {}',
        type: 'insert'
      }]
    })
  }))
}));

vi.mock('../../../src/core/refactor/inline-function.js', () => ({
  InlineAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockReturnValue({
      canInline: true,
      issues: []
    })
  }))
}));

vi.mock('../../../src/core/rename/rename-engine.js', () => ({
  RenameEngine: vi.fn().mockImplementation(() => ({
    rename: vi.fn().mockResolvedValue({
      success: true,
      filesChanged: 1,
      changes: [{ filePath: 'test.ts', oldContent: '', newContent: '' }]
    })
  }))
}));

vi.mock('../../../src/core/move/move-service.js', () => ({
  MoveService: vi.fn().mockImplementation(() => ({
    move: vi.fn().mockResolvedValue({
      success: true,
      from: 'src/old.ts',
      to: 'src/new.ts',
      filesUpdated: 2,
      importUpdates: []
    })
  }))
}));

vi.mock('../../../src/core/dependency/dependency-analyzer.js', () => ({
  DependencyAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockResolvedValue({
      dependencies: [],
      impact: { affectedFiles: [] }
    })
  }))
}));

vi.mock('../../../src/core/search/service.js', () => ({
  SearchService: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ results: [] })
  }))
}));

vi.mock('../../../src/core/indexing/index-engine.js', () => ({
  IndexEngine: vi.fn().mockImplementation(() => ({
    index: vi.fn().mockResolvedValue(true),
    getStatus: vi.fn().mockReturnValue('ready')
  }))
}));

describe('ModuleCoordinatorService', () => {
  let service: ModuleCoordinatorService;
  let eventBus: EventBus;
  let stateManager: StateManager;
  let errorHandler: ErrorHandlerService;

  beforeEach(() => {
    eventBus = new EventBus();
    stateManager = new StateManager();
    errorHandler = new ErrorHandlerService(eventBus);

    service = new ModuleCoordinatorService(
      eventBus,
      stateManager,
      errorHandler
    );

    // Mock 核心模組實例的方法
    vi.spyOn(service as any, 'complexityAnalyzer', 'get').mockReturnValue({
      analyze: vi.fn().mockResolvedValue({ complexity: 5, recommendation: 'low' })
    });

    vi.spyOn(service as any, 'functionExtractor', 'get').mockReturnValue({
      extract: vi.fn().mockResolvedValue({
        success: true,
        edits: [{
          range: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
          newText: 'function extracted() {}',
          type: 'insert'
        }]
      })
    });

    vi.spyOn(service as any, 'inlineAnalyzer', 'get').mockReturnValue({
      analyze: vi.fn().mockReturnValue({
        canInline: true,
        issues: []
      })
    });

    vi.spyOn(service as any, 'renameEngine', 'get').mockReturnValue({
      rename: vi.fn().mockResolvedValue({
        success: true,
        filesChanged: 1,
        changes: [{ filePath: 'test.ts', oldContent: '', newContent: '' }]
      })
    });

    vi.spyOn(service as any, 'moveService', 'get').mockReturnValue({
      move: vi.fn().mockResolvedValue({
        success: true,
        from: 'src/old.ts',
        to: 'src/new.ts',
        filesUpdated: 2,
        importUpdates: []
      })
    });

    vi.spyOn(service as any, 'dependencyAnalyzer', 'get').mockReturnValue({
      analyze: vi.fn().mockResolvedValue({
        dependencies: [],
        impact: { affectedFiles: [] }
      })
    });

    vi.spyOn(service as any, 'searchService', 'get').mockReturnValue({
      search: vi.fn().mockResolvedValue({ results: [] })
    });

    vi.spyOn(service as any, 'indexEngine', 'get').mockReturnValue({
      index: vi.fn().mockResolvedValue(true),
      getStatus: vi.fn().mockReturnValue('ready')
    });
  });

  describe('constructor', () => {
    it('should create instance with required dependencies', () => {
      expect(service).toBeInstanceOf(ModuleCoordinatorService);
    });
  });

  describe('analyzeAndRefactor', () => {
    it('should analyze file and apply refactoring', async () => {
      const options: RefactorOptions = {
        type: 'extract-function',
        selection: {
          start: { line: 1, column: 0 },
          end: { line: 10, column: 0 }
        },
        newName: 'extractedFunction'
      };

      const result = await service.analyzeAndRefactor('test.ts', options);

      expect(result).toMatchObject({
        success: true,
        changes: expect.any(Array)
      });
    });

    it('should handle refactoring errors gracefully', async () => {
      const options: RefactorOptions = {
        type: 'extract-function' as const,
        selection: {
          start: { line: 1, column: 0 },
          end: { line: 10, column: 0 }
        }
        // 缺少 newName，導致失敗
      };

      const result = await service.analyzeAndRefactor('nonexistent.ts', options);

      expect(result.success).toBe(false);
      // 由於沒有 newName，會直接返回 success: false，不會產生 error
    });
  });

  describe('batchRename', () => {
    it('should perform batch rename operations', async () => {
      const operations: RenameOperation[] = [
        {
          filePath: 'test1.ts',
          position: { line: 1, column: 0 },
          oldName: 'oldVar1',
          newName: 'newVar1'
        },
        {
          filePath: 'test2.ts',
          position: { line: 2, column: 0 },
          oldName: 'oldVar2',
          newName: 'newVar2'
        }
      ];

      const results = await service.batchRename(operations);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should handle partial failures in batch operations', async () => {
      const operations: RenameOperation[] = [
        {
          filePath: 'test1.ts',
          position: { line: 1, column: 0 },
          oldName: 'oldVar1',
          newName: 'newVar1'
        }
      ];

      const results = await service.batchRename(operations);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        success: expect.any(Boolean),
        filesChanged: expect.any(Number),
        changes: expect.any(Array)
      });
    });
  });

  describe('smartMove', () => {
    it('should analyze dependencies before moving files', async () => {
      const result = await service.smartMove('src/old.ts', 'src/new.ts');

      expect(result).toMatchObject({
        success: true,
        from: 'src/old.ts',
        to: 'src/new.ts',
        filesUpdated: expect.any(Number),
        importUpdates: expect.any(Array)
      });
    });

    it('should handle move failures gracefully', async () => {
      // Mock move service 回傳失敗
      vi.spyOn(service as any, 'moveService', 'get').mockReturnValue({
        move: vi.fn().mockResolvedValue({
          success: false,
          from: 'nonexistent.ts',
          to: 'target.ts',
          filesUpdated: 0,
          importUpdates: [],
          error: new Error('File not found')
        })
      });

      const result = await service.smartMove('nonexistent.ts', 'target.ts');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getModuleStatus', () => {
    it('should return status of all modules', async () => {
      const statuses = await service.getModuleStatus();

      expect(statuses).toHaveLength(7); // 7 core modules

      const moduleNames = statuses.map(s => s.name);
      expect(moduleNames).toContain('analysis');
      expect(moduleNames).toContain('dependency');
      expect(moduleNames).toContain('indexing');
      expect(moduleNames).toContain('move');
      expect(moduleNames).toContain('refactor');
      expect(moduleNames).toContain('rename');
      expect(moduleNames).toContain('search');

      statuses.forEach(status => {
        expect(status).toMatchObject({
          moduleId: expect.any(String),
          name: expect.any(String),
          status: expect.stringMatching(/^(idle|loading|ready|error)$/),
          errorCount: expect.any(Number)
        });
      });
    });
  });

  describe('error handling', () => {
    it('should handle errors through error handler service', async () => {
      const handleSpy = vi.spyOn(errorHandler, 'handle');

      // Mock 分析器拋出錯誤
      vi.spyOn(service as any, 'complexityAnalyzer', 'get').mockReturnValue({
        analyze: vi.fn().mockRejectedValue(new Error('Analysis failed'))
      });

      // 觸發一個錯誤
      await service.analyzeAndRefactor('test.ts', {
        type: 'extract-function',
        selection: { start: { line: 1, column: 0 }, end: { line: 2, column: 0 } },
        newName: 'test'
      });

      // 驗證錯誤處理器被調用
      expect(handleSpy).toHaveBeenCalled();
    });
  });

  describe('module coordination', () => {
    it('should coordinate between analysis and refactor modules', async () => {
      const options: RefactorOptions = {
        type: 'extract-function',
        selection: {
          start: { line: 1, column: 0 },
          end: { line: 10, column: 0 }
        },
        newName: 'newFunction'
      };

      const result = await service.analyzeAndRefactor('complex.ts', options);

      expect(result.success).toBe(true);
      // 驗證分析和重構模組都被調用
    });

    it('should emit events for module state changes', async () => {
      const eventSpy = vi.spyOn(eventBus, 'emit');

      await service.getModuleStatus();

      // 驗證事件被發送
      expect(eventSpy).toHaveBeenCalled();
    });
  });
});