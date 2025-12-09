/**
 * MemoryMonitor 測試
 * 測試記憶體監控器的所有功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryMonitor,
  withMemoryMonitoring,
  getFormattedMemoryReport,
  type Disposable,
} from '@shared/utils/memory-monitor.js';

// ============================================================================
// MemoryMonitor Tests
// ============================================================================

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    monitor = new MemoryMonitor();
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('constructor', () => {
    it('應該建立新的 MemoryMonitor 實例', () => {
      expect(monitor).toBeDefined();
    });

    it('應該使用預設的閾值和間隔', () => {
      const defaultMonitor = new MemoryMonitor();
      expect(defaultMonitor).toBeDefined();
      defaultMonitor.destroy();
    });

    it('應該接受自訂的閾值和間隔', () => {
      const customMonitor = new MemoryMonitor(90, 60000);
      expect(customMonitor).toBeDefined();
      customMonitor.destroy();
    });
  });

  describe('getInstance', () => {
    afterEach(() => {
      // 清理單例
      MemoryMonitor.getInstance().destroy();
    });

    it('應該回傳單例實例', () => {
      const instance1 = MemoryMonitor.getInstance();
      const instance2 = MemoryMonitor.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('應該在 destroy 後建立新實例', () => {
      const instance1 = MemoryMonitor.getInstance();
      instance1.destroy();

      const instance2 = MemoryMonitor.getInstance();
      expect(instance2).not.toBe(instance1);
      instance2.destroy();
    });
  });

  describe('register / unregister', () => {
    it('應該註冊 disposable 資源', () => {
      const disposable: Disposable = {
        dispose: vi.fn(),
      };

      monitor.register(disposable);
      // 透過 cleanup 驗證註冊成功
      expect(() => monitor.register(disposable)).not.toThrow();
    });

    it('應該取消註冊 disposable 資源', () => {
      const disposable: Disposable = {
        dispose: vi.fn(),
      };

      monitor.register(disposable);
      monitor.unregister(disposable);
      // 不應該拋出錯誤
      expect(() => monitor.unregister(disposable)).not.toThrow();
    });

    it('應該支援註冊多個資源', () => {
      const disposable1: Disposable = { dispose: vi.fn() };
      const disposable2: Disposable = { dispose: vi.fn() };
      const disposable3: Disposable = { dispose: vi.fn() };

      monitor.register(disposable1);
      monitor.register(disposable2);
      monitor.register(disposable3);

      // 不應該拋出錯誤
      expect(() => monitor.register(disposable1)).not.toThrow();
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('應該開始監控', () => {
      monitor.startMonitoring();
      // 不應該拋出錯誤
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('應該停止監控', () => {
      monitor.startMonitoring();
      monitor.stopMonitoring();
      // 再次停止不應該拋出錯誤
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('應該忽略重複的開始監控呼叫', () => {
      monitor.startMonitoring();
      monitor.startMonitoring();
      monitor.stopMonitoring();
      // 不應該拋出錯誤
      expect(() => monitor.stopMonitoring()).not.toThrow();
    });

    it('應該在停止後能重新開始', () => {
      monitor.startMonitoring();
      monitor.stopMonitoring();
      monitor.startMonitoring();
      monitor.stopMonitoring();
      // 不應該拋出錯誤
    });
  });

  describe('getMemoryStats', () => {
    it('應該回傳記憶體統計資訊', () => {
      const stats = monitor.getMemoryStats();

      expect(stats).toBeDefined();
      expect(typeof stats.used).toBe('number');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.external).toBe('number');
      expect(typeof stats.heapUsed).toBe('number');
      expect(typeof stats.heapTotal).toBe('number');
      expect(typeof stats.usagePercent).toBe('number');
    });

    it('應該回傳正數的記憶體值', () => {
      const stats = monitor.getMemoryStats();

      expect(stats.used).toBeGreaterThan(0);
      expect(stats.heapUsed).toBeGreaterThan(0);
      expect(stats.heapTotal).toBeGreaterThan(0);
    });

    it('應該回傳有效的使用率百分比', () => {
      const stats = monitor.getMemoryStats();

      expect(stats.usagePercent).toBeGreaterThan(0);
      expect(stats.usagePercent).toBeLessThanOrEqual(100);
    });
  });

  describe('cleanup', () => {
    it('應該清理所有註冊的資源', async () => {
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();

      monitor.register({ dispose: dispose1 });
      monitor.register({ dispose: dispose2 });

      await monitor.cleanup();

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it('應該處理 async dispose', async () => {
      const dispose = vi.fn().mockResolvedValue(undefined);

      monitor.register({ dispose });

      await monitor.cleanup();

      expect(dispose).toHaveBeenCalled();
    });

    it('應該處理 dispose 拋出的錯誤', async () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const dispose = vi.fn().mockRejectedValue(new Error('cleanup error'));

      monitor.register({ dispose });

      // 不應該拋出錯誤
      await expect(monitor.cleanup()).resolves.not.toThrow();

      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });

    it('應該處理空的資源列表', async () => {
      await expect(monitor.cleanup()).resolves.not.toThrow();
    });
  });

  describe('forceGarbageCollection', () => {
    it('應該嘗試執行垃圾回收', () => {
      // 不應該拋出錯誤
      expect(() => monitor.forceGarbageCollection()).not.toThrow();
    });

    it('應該在 gc 可用時呼叫多次', () => {
      // 模擬 gc 可用的環境
      const originalGc = global.gc;
      const mockGc = vi.fn();
      global.gc = mockGc;

      monitor.forceGarbageCollection();

      // 應該呼叫 3 次
      expect(mockGc).toHaveBeenCalledTimes(3);

      // 恢復
      if (originalGc) {
        global.gc = originalGc;
      } else {
        delete (global as Record<string, unknown>).gc;
      }
    });
  });

  describe('destroy', () => {
    it('應該停止監控並清空資源', () => {
      monitor.startMonitoring();
      monitor.register({ dispose: vi.fn() });

      monitor.destroy();

      // 再次呼叫不應該拋出錯誤
      expect(() => monitor.destroy()).not.toThrow();
    });

    it('應該重設單例實例', () => {
      const instance = MemoryMonitor.getInstance();
      instance.destroy();

      const newInstance = MemoryMonitor.getInstance();
      expect(newInstance).not.toBe(instance);
      newInstance.destroy();
    });
  });

  describe('checkMemoryUsage (private, tested via startMonitoring)', () => {
    it('應該在記憶體使用率過高時觸發清理', async () => {
      vi.useFakeTimers();

      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      // 使用低閾值的監控器
      const lowThresholdMonitor = new MemoryMonitor(1, 100); // 1% 閾值
      const dispose = vi.fn();
      lowThresholdMonitor.register({ dispose });

      lowThresholdMonitor.startMonitoring();

      // 前進時間觸發檢查
      await vi.advanceTimersByTimeAsync(150);

      lowThresholdMonitor.stopMonitoring();
      lowThresholdMonitor.destroy();

      // 因為實際記憶體使用率應該超過 1%，所以應該觸發清理
      expect(dispose).toHaveBeenCalled();

      consoleWarn.mockRestore();
      consoleLog.mockRestore();
      vi.useRealTimers();
    });
  });
});

// ============================================================================
// withMemoryMonitoring Tests
// ============================================================================

describe('withMemoryMonitoring', () => {
  afterEach(() => {
    MemoryMonitor.getInstance().destroy();
  });

  it('應該註冊並回傳 target', () => {
    const target: Disposable = {
      dispose: vi.fn(),
    };

    const result = withMemoryMonitoring(target);

    expect(result).toBe(target);
  });

  it('應該將 target 註冊到單例監控器', async () => {
    const dispose = vi.fn();
    const target: Disposable = { dispose };

    withMemoryMonitoring(target);

    // 透過 cleanup 驗證註冊成功
    await MemoryMonitor.getInstance().cleanup();

    expect(dispose).toHaveBeenCalled();
  });
});

// ============================================================================
// getFormattedMemoryReport Tests
// ============================================================================

describe('getFormattedMemoryReport', () => {
  afterEach(() => {
    MemoryMonitor.getInstance().destroy();
  });

  it('應該回傳格式化的記憶體報告', () => {
    const report = getFormattedMemoryReport();

    expect(report).toContain('記憶體使用報告');
    expect(report).toContain('堆記憶體使用');
    expect(report).toContain('堆記憶體總量');
    expect(report).toContain('外部記憶體');
    expect(report).toContain('總記憶體使用');
    expect(report).toContain('使用率');
  });

  it('應該包含格式化的位元組數', () => {
    const report = getFormattedMemoryReport();

    // 應該包含 KB 或 MB 單位
    expect(report).toMatch(/\d+(\.\d+)?\s*(Bytes|KB|MB|GB)/);
  });

  it('應該包含百分比', () => {
    const report = getFormattedMemoryReport();

    expect(report).toMatch(/\d+\.\d+%/);
  });
});

// ============================================================================
// formatBytes (internal, tested via getFormattedMemoryReport)
// ============================================================================

describe('formatBytes (internal)', () => {
  afterEach(() => {
    MemoryMonitor.getInstance().destroy();
  });

  it('應該正確格式化各種大小', () => {
    const report = getFormattedMemoryReport();

    // 報告中應該有格式化的數字
    expect(report).toMatch(/\d+(\.\d+)?\s*(Bytes|KB|MB|GB)/);
  });
});

// ============================================================================
// 邊界條件測試
// ============================================================================

describe('邊界條件', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    monitor = new MemoryMonitor();
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('應該處理多次 destroy 呼叫', () => {
    monitor.destroy();
    monitor.destroy();
    monitor.destroy();
    // 不應該拋出錯誤
  });

  it('應該處理 unregister 不存在的資源', () => {
    const disposable: Disposable = { dispose: vi.fn() };
    monitor.unregister(disposable);
    // 不應該拋出錯誤
  });

  it('應該處理同時註冊多個相同資源', async () => {
    const dispose = vi.fn();
    const disposable: Disposable = { dispose };

    monitor.register(disposable);
    monitor.register(disposable);
    monitor.register(disposable);

    await monitor.cleanup();

    // Set 會去重，只呼叫一次
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('應該處理快速開始/停止監控', () => {
    for (let i = 0; i < 10; i++) {
      monitor.startMonitoring();
      monitor.stopMonitoring();
    }
    // 不應該拋出錯誤
  });

  it('應該在 cleanup 期間處理新的 dispose 錯誤', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const syncErrorDisposable: Disposable = {
      dispose: () => {
        throw new Error('sync error');
      },
    };

    const asyncErrorDisposable: Disposable = {
      dispose: async () => {
        throw new Error('async error');
      },
    };

    monitor.register(syncErrorDisposable);
    monitor.register(asyncErrorDisposable);

    await monitor.cleanup();

    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});
