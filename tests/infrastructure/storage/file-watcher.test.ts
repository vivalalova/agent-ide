import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileChangeEvent } from '../../../src/infrastructure/storage/types';

// Mock chokidar
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  off: vi.fn().mockReturnThis(),
  close: vi.fn().mockResolvedValue(undefined),
  add: vi.fn(),
  unwatch: vi.fn(),
  getWatched: vi.fn().mockReturnValue({}),
};

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => mockWatcher),
  },
}));

// 在 mock 之後 import FileWatcher
import { FileWatcher } from '../../../src/infrastructure/storage/file-watcher';

describe('FileWatcher Fixed Tests', () => {
  let watcher: FileWatcher;
  let mockEventHandlers: { [key: string]: Function[] } = {};

  beforeEach(() => {
    // 重設 mock
    vi.clearAllMocks();
    mockEventHandlers = {};
    
    // 設定 mock 行為
    mockWatcher.on.mockImplementation((event: string, handler: Function) => {
      if (!mockEventHandlers[event]) {
        mockEventHandlers[event] = [];
      }
      mockEventHandlers[event].push(handler);
      return mockWatcher;
    });

    watcher = new FileWatcher();
  });

  afterEach(async () => {
    await watcher.close();
  });

  describe('基本監控功能', () => {
    it('應該能夠建立 FileWatcher 實例', () => {
      expect(watcher).toBeInstanceOf(FileWatcher);
    });

    it('應該能夠開始監控', async () => {
      // Arrange
      const watchPath = '/test';
      
      // Mock ready event
      mockWatcher.on.mockImplementation((event: string, handler: Function) => {
        if (!mockEventHandlers[event]) {
          mockEventHandlers[event] = [];
        }
        mockEventHandlers[event].push(handler);
        
        if (event === 'ready') {
          // 立即觸發 ready 事件
          setTimeout(() => handler(), 0);
        }
        return mockWatcher;
      });

      // Act & Assert
      await expect(watcher.watch(watchPath)).resolves.not.toThrow();
      
      // 驗證 chokidar.watch 被調用
      const chokidar = await import('chokidar');
      expect(chokidar.default.watch).toHaveBeenCalledWith(watchPath, expect.any(Object));
    });

    it('應該能夠添加事件監聽器', () => {
      // Arrange
      const listener = vi.fn();

      // Act
      watcher.on('change', listener);

      // Assert
      expect(watcher.listenerCount('change')).toBe(1);
    });

    it('應該能夠移除事件監聽器', () => {
      // Arrange
      const listener = vi.fn();
      watcher.on('change', listener);

      // Act
      watcher.off('change', listener);

      // Assert
      expect(watcher.listenerCount('change')).toBe(0);
    });

    it('應該能夠關閉監控', async () => {
      // Arrange
      const watchPath = '/test';
      mockWatcher.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 0);
        }
        return mockWatcher;
      });
      
      await watcher.watch(watchPath);

      // Act
      await watcher.close();

      // Assert
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe('事件處理', () => {
    it('應該能夠處理檔案事件', async () => {
      // Arrange
      const events: FileChangeEvent[] = [];
      watcher.on('change', (event) => {
        events.push(event);
      });

      const watchPath = '/test';
      
      // Mock event handlers
      let allHandler: Function;
      mockWatcher.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 0);
        } else if (event === 'all') {
          allHandler = handler;
        }
        return mockWatcher;
      });

      await watcher.watch(watchPath);

      // Act - 模擬檔案變更事件
      if (allHandler) {
        allHandler('add', '/test/file.txt', { isFile: () => true, size: 100 });
        allHandler('change', '/test/file.txt', { isFile: () => true, size: 150 });
        allHandler('unlink', '/test/file.txt');
      }

      // Assert
      // 過濾掉 ready 事件，只檢查檔案相關事件
      const fileEvents = events.filter(e => e.type !== 'ready');
      expect(fileEvents).toHaveLength(3);
      expect(fileEvents[0].type).toBe('add');
      expect(fileEvents[0].path).toBe('/test/file.txt');
      expect(fileEvents[1].type).toBe('change');
      expect(fileEvents[2].type).toBe('unlink');
    });
  });

  describe('監控狀態', () => {
    it('應該能夠檢查是否正在監控', async () => {
      // Arrange
      expect(watcher.isWatching()).toBe(false);

      mockWatcher.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 0);
        }
        return mockWatcher;
      });

      // Act
      await watcher.watch('/test');

      // Assert
      expect(watcher.isWatching()).toBe(true);
    });

    it('應該能夠獲取監控統計資訊', async () => {
      // Arrange
      mockWatcher.getWatched.mockReturnValue({
        '/test': ['file1.txt', 'file2.txt'],
        '/test/sub': ['file3.txt']
      });

      mockWatcher.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'ready') {
          setTimeout(() => handler(), 0);
        }
        return mockWatcher;
      });

      await watcher.watch('/test');

      // Act
      const stats = watcher.getStats();

      // Assert
      expect(stats.watcherCount).toBeGreaterThan(0);
      expect(stats.totalWatchedFiles).toBe(3);
    });
  });
});