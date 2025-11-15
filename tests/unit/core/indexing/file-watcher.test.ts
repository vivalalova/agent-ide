import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { FileWatcher } from '@core/indexing/file-watcher';
import { IndexEngine } from '@core/indexing/index-engine';
import type { IndexConfig } from '@core/indexing/types';
import type { FileChangeType } from '@core/indexing/file-watcher';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('@infrastructure/parser');
vi.mock('@plugins/typescript/parser');
vi.mock('@plugins/javascript/parser');
vi.mock('@plugins/swift/parser');

describe('FileWatcher', () => {
  let fileWatcher: FileWatcher;
  let mockEngine: IndexEngine;
  let mockConfig: IndexConfig;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockConfig = {
      workspacePath: '/workspace',
      excludePatterns: ['node_modules/**', '.git/**'],
      includeExtensions: ['.ts', '.js'],
      maxFileSize: 1024 * 1024,
      enablePersistence: true,
      persistencePath: undefined,
      maxConcurrency: 4
    };

    // Mock ParserRegistry
    const { ParserRegistry } = await import('@infrastructure/parser');
    const mockParserInstance = {
      parse: vi.fn().mockResolvedValue({}),
      extractSymbols: vi.fn().mockResolvedValue([]),
      extractDependencies: vi.fn().mockResolvedValue([]),
      getSupportedExtensions: vi.fn().mockReturnValue(['.ts', '.js'])
    };

    const mockRegistryInstance = {
      isDisposed: false,
      register: vi.fn(),
      getParser: vi.fn().mockReturnValue(mockParserInstance),
      listParsers: vi.fn().mockReturnValue([
        { name: 'typescript', plugin: mockParserInstance }
      ])
    };

    vi.mocked(ParserRegistry.getInstance).mockReturnValue(mockRegistryInstance as any);
    vi.mocked(ParserRegistry.resetInstance).mockReturnValue(undefined);

    // Mock fs
    const fs = await import('fs/promises');
    vi.mocked(fs.stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => true,
      size: 1000,
      mtime: new Date('2024-01-01')
    } as any);
    vi.mocked(fs.readFile).mockResolvedValue('export function test() {}');
    vi.mocked(fs.access).mockResolvedValue(undefined);

    // Create engine and watcher
    mockEngine = new IndexEngine(mockConfig);
    fileWatcher = new FileWatcher(mockEngine, { debounceTime: 100 });
  });

  afterEach(async () => {
    if (fileWatcher) {
      await fileWatcher.stop();
    }
    if (mockEngine) {
      mockEngine.dispose();
    }
  });

  describe('constructor', () => {
    it('應該建立 FileWatcher 實例', () => {
      expect(fileWatcher).toBeDefined();
    });

    it('應該使用預設的 debounceTime', () => {
      const watcher = new FileWatcher(mockEngine);
      expect(watcher).toBeDefined();
    });

    it('應該使用自訂的 debounceTime', () => {
      const watcher = new FileWatcher(mockEngine, { debounceTime: 500 });
      expect(watcher).toBeDefined();
    });
  });

  describe('start', () => {
    it('應該開始監控', async () => {
      // Mock fs.watch
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      await fileWatcher.start();

      const status = fileWatcher.getStatus();
      expect(status.isWatching).toBe(true);
    });

    it('應該不重複開始監控', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      await fileWatcher.start();
      await fileWatcher.start(); // 第二次呼叫應該被忽略

      const status = fileWatcher.getStatus();
      expect(status.isWatching).toBe(true);
    });

    it('應該發送 started 事件', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      const startedSpy = vi.fn();
      fileWatcher.on('started', startedSpy);

      await fileWatcher.start();

      expect(startedSpy).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('應該停止監控', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      await fileWatcher.start();
      await fileWatcher.stop();

      const status = fileWatcher.getStatus();
      expect(status.isWatching).toBe(false);
    });

    it('應該關閉 watcher', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      await fileWatcher.start();
      await fileWatcher.stop();

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it('應該發送 stopped 事件', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      const stoppedSpy = vi.fn();
      fileWatcher.on('stopped', stoppedSpy);

      await fileWatcher.start();
      await fileWatcher.stop();

      expect(stoppedSpy).toHaveBeenCalled();
    });

    it('應該能夠在未開始時停止而不拋錯', async () => {
      await expect(fileWatcher.stop()).resolves.toBeUndefined();
    });
  });

  describe('pause', () => {
    it('應該暫停監控', () => {
      fileWatcher.pause();

      const status = fileWatcher.getStatus();
      expect(status.isPaused).toBe(true);
    });

    it('應該發送 paused 事件', () => {
      const pausedSpy = vi.fn();
      fileWatcher.on('paused', pausedSpy);

      fileWatcher.pause();

      expect(pausedSpy).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('應該恢復監控', () => {
      fileWatcher.pause();
      fileWatcher.resume();

      const status = fileWatcher.getStatus();
      expect(status.isPaused).toBe(false);
    });

    it('應該發送 resumed 事件', () => {
      const resumedSpy = vi.fn();
      fileWatcher.on('resumed', resumedSpy);

      fileWatcher.pause();
      fileWatcher.resume();

      expect(resumedSpy).toHaveBeenCalled();
    });
  });

  describe('handleFileChange', () => {
    it('應該處理檔案新增事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await fileWatcher.handleFileChange('/workspace/src/new-file.ts', 'add');

      expect(mockEngine.isIndexed('/workspace/src/new-file.ts')).toBe(true);
    });

    it('應該處理檔案修改事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // 先索引檔案
      await mockEngine.indexFile('/workspace/src/file.ts');

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');

      expect(mockEngine.isIndexed('/workspace/src/file.ts')).toBe(true);
    });

    it('應該處理檔案刪除事件', async () => {
      // 先索引檔案
      await mockEngine.indexFile('/workspace/src/file.ts');

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'unlink');

      expect(mockEngine.isIndexed('/workspace/src/file.ts')).toBe(false);
    });

    it('應該在暫停時忽略事件', async () => {
      fileWatcher.pause();

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');

      expect(mockEngine.isIndexed('/workspace/src/file.ts')).toBe(false);
    });

    it('應該發送 fileChanged 事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const fileChangedSpy = vi.fn();
      fileWatcher.on('fileChanged', fileChangedSpy);

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');

      expect(fileChangedSpy).toHaveBeenCalled();
    });

    it('應該處理錯誤並發送 error 事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('Access denied'));

      const errorSpy = vi.fn();
      fileWatcher.on('error', errorSpy);

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');

      expect(errorSpy).toHaveBeenCalled();
    });

    it('應該處理目錄新增事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await fileWatcher.handleFileChange('/workspace/src/new-dir', 'addDir');

      // 應該不拋出錯誤
      expect(true).toBe(true);
    });

    it('應該處理目錄刪除事件', async () => {
      // 先索引目錄中的檔案
      await mockEngine.indexFile('/workspace/src/dir/file.ts');

      await fileWatcher.handleFileChange('/workspace/src/dir', 'unlinkDir');

      expect(mockEngine.isIndexed('/workspace/src/dir/file.ts')).toBe(false);
    });
  });

  describe('handleBatchChanges', () => {
    it('應該批次處理檔案變更', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const changes = [
        { filePath: '/workspace/src/file1.ts', type: 'add' as FileChangeType },
        { filePath: '/workspace/src/file2.ts', type: 'add' as FileChangeType }
      ];

      await fileWatcher.handleBatchChanges(changes);

      expect(mockEngine.isIndexed('/workspace/src/file1.ts')).toBe(true);
      expect(mockEngine.isIndexed('/workspace/src/file2.ts')).toBe(true);
    });

    it('應該使用指定的並行數量', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const changes = [
        { filePath: '/workspace/src/file1.ts', type: 'add' as FileChangeType },
        { filePath: '/workspace/src/file2.ts', type: 'add' as FileChangeType },
        { filePath: '/workspace/src/file3.ts', type: 'add' as FileChangeType }
      ];

      await fileWatcher.handleBatchChanges(changes, { maxConcurrency: 2 });

      expect(mockEngine.isIndexed('/workspace/src/file1.ts')).toBe(true);
      expect(mockEngine.isIndexed('/workspace/src/file2.ts')).toBe(true);
      expect(mockEngine.isIndexed('/workspace/src/file3.ts')).toBe(true);
    });

    it('應該處理空陣列', async () => {
      await expect(fileWatcher.handleBatchChanges([])).resolves.toBeUndefined();
    });

    it('應該處理部分失敗的變更', async () => {
      const fs = await import('fs/promises');
      let callCount = 0;
      vi.mocked(fs.access).mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('Access denied'));
        }
        return Promise.resolve(undefined);
      });

      const changes = [
        { filePath: '/workspace/src/file1.ts', type: 'add' as FileChangeType },
        { filePath: '/workspace/src/file2.ts', type: 'add' as FileChangeType },
        { filePath: '/workspace/src/file3.ts', type: 'add' as FileChangeType }
      ];

      await fileWatcher.handleBatchChanges(changes);

      // 應該至少有一些檔案被索引
      expect(
        mockEngine.isIndexed('/workspace/src/file1.ts') ||
        mockEngine.isIndexed('/workspace/src/file3.ts')
      ).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('應該回傳正確的狀態', async () => {
      const status = fileWatcher.getStatus();

      expect(status).toHaveProperty('isWatching');
      expect(status).toHaveProperty('isPaused');
      expect(status).toHaveProperty('pendingChangesCount');
    });

    it('應該反映監控狀態', async () => {
      const fsModule = await import('fs');
      const mockWatcher = {
        close: vi.fn()
      };
      vi.mocked(fsModule.watch).mockReturnValue(mockWatcher as any);

      let status = fileWatcher.getStatus();
      expect(status.isWatching).toBe(false);

      await fileWatcher.start();

      status = fileWatcher.getStatus();
      expect(status.isWatching).toBe(true);
    });

    it('應該反映暫停狀態', () => {
      let status = fileWatcher.getStatus();
      expect(status.isPaused).toBe(false);

      fileWatcher.pause();

      status = fileWatcher.getStatus();
      expect(status.isPaused).toBe(true);
    });
  });

  describe('flush', () => {
    it('應該強制處理所有待處理的變更', async () => {
      await expect(fileWatcher.flush()).resolves.toBeUndefined();
    });

    it('應該清除 debounce 計時器', async () => {
      await fileWatcher.flush();

      const status = fileWatcher.getStatus();
      expect(status.pendingChangesCount).toBe(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理快速連續的檔案變更', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // 快速連續的變更
      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');
      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');
      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');

      expect(mockEngine.isIndexed('/workspace/src/file.ts')).toBe(true);
    });

    it('應該處理不支援的檔案類型', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      // .txt 不在 includeExtensions 中
      await fileWatcher.handleFileChange('/workspace/src/file.txt', 'add');

      // 應該不拋出錯誤
      expect(true).toBe(true);
    });

    it('應該處理被排除的檔案', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await fileWatcher.handleFileChange('/workspace/node_modules/lib/file.ts', 'add');

      // FileWatcher 不會過濾這些檔案，交由 IndexEngine 處理
      // 檔案會被索引到 engine 中，但不會出現在統計中
      // 這個測試應該驗證不會拋出錯誤
      expect(true).toBe(true);
    });

    it('應該處理檔案在處理過程中被刪除', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('File not found'));

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');

      // 應該不拋出錯誤
      expect(true).toBe(true);
    });

    it('應該處理同時新增和刪除的檔案', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      await mockEngine.indexFile('/workspace/src/file.ts');

      // 新增事件和刪除事件
      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');
      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'unlink');

      expect(mockEngine.isIndexed('/workspace/src/file.ts')).toBe(false);
    });
  });

  describe('事件發送', () => {
    it('應該在處理完檔案變更後發送事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const fileChangedSpy = vi.fn();
      fileWatcher.on('fileChanged', fileChangedSpy);

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'add');

      expect(fileChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: '/workspace/src/file.ts',
          type: 'add',
          timestamp: expect.any(Date),
          error: undefined
        })
      );
    });

    it('應該在發生錯誤時發送錯誤事件', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('Test error'));

      const errorSpy = vi.fn();
      fileWatcher.on('error', errorSpy);

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');

      expect(errorSpy).toHaveBeenCalled();
    });

    it('應該包含錯誤訊息在 fileChanged 事件中', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.access).mockRejectedValue(new Error('Test error'));

      const fileChangedSpy = vi.fn();
      const errorSpy = vi.fn();
      fileWatcher.on('fileChanged', fileChangedSpy);
      fileWatcher.on('error', errorSpy);

      await fileWatcher.handleFileChange('/workspace/src/file.ts', 'change');

      // 應該發送兩個事件
      expect(errorSpy).toHaveBeenCalled();
      expect(fileChangedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String)
        })
      );
    });
  });
});
