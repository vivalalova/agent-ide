/**
 * 記憶體優化工具 - 用於 E2E 測試中的記憶體管理和優化
 */

export interface MemoryStats {
  used: number;
  total: number;
  external: number;
  heapUsed: number;
  heapTotal: number;
}

export interface MemoryOptimizationOptions {
  forceGC?: boolean;
  logMemoryUsage?: boolean;
  maxHeapSize?: number;
  cleanupInterval?: number;
}

/**
 * 取得當前記憶體使用統計
 */
export function getMemoryStats(): MemoryStats {
  const memUsage = process.memoryUsage();
  return {
    used: memUsage.rss,
    total: memUsage.rss + memUsage.external,
    external: memUsage.external,
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal
  };
}

/**
 * 執行垃圾回收（如果可用）
 */
export function forceGarbageCollection(): void {
  if (global.gc) {
    global.gc();
  } else {
    console.warn('垃圾回收不可用，請使用 --expose-gc 標誌啟動 Node.js');
  }
}

/**
 * 記錄記憶體使用情況
 */
export function logMemoryUsage(label = '記憶體使用'): MemoryStats {
  const stats = getMemoryStats();
  const heapUsedMB = (stats.heapUsed / 1024 / 1024).toFixed(1);
  const totalMB = (stats.total / 1024 / 1024).toFixed(1);

  console.log(`${label}: ${heapUsedMB}MB heap used, ${totalMB}MB total`);
  return stats;
}

/**
 * 檢查記憶體使用是否超出限制
 */
export function checkMemoryLimit(maxMB: number): boolean {
  const stats = getMemoryStats();
  const usedMB = stats.heapUsed / 1024 / 1024;

  if (usedMB > maxMB) {
    console.warn(`記憶體使用 ${usedMB.toFixed(1)}MB 超出限制 ${maxMB}MB`);
    return false;
  }

  return true;
}

/**
 * 等待一段時間讓垃圾回收完成
 */
export async function waitForGC(ms = 100): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 記憶體優化包裝器 - 在測試前後進行記憶體管理
 */
export function withMemoryOptimization<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  options: MemoryOptimizationOptions = {}
): (...args: T) => Promise<R> {
  const {
    forceGC = true,
    logMemoryUsage: shouldLog = false,
    maxHeapSize = 500, // MB
    cleanupInterval = 0
  } = options;

  return async (...args: T): Promise<R> => {
    // 測試前的記憶體優化
    if (forceGC) {
      forceGarbageCollection();
      await waitForGC();
    }

    if (shouldLog) {
      logMemoryUsage('測試開始前');
    }

    let result: R;
    let cleanupTimer: NodeJS.Timeout | undefined;

    try {
      // 設定定期清理（如果啟用）
      if (cleanupInterval > 0) {
        cleanupTimer = setInterval(() => {
          if (forceGC) {
            forceGarbageCollection();
          }
          checkMemoryLimit(maxHeapSize);
        }, cleanupInterval);
      }

      // 執行測試
      result = await fn(...args);

      // 檢查記憶體使用
      if (!checkMemoryLimit(maxHeapSize)) {
        console.warn('測試執行期間記憶體使用超出限制');
      }

    } finally {
      // 清理定期清理器
      if (cleanupTimer) {
        clearInterval(cleanupTimer);
      }

      // 測試後的記憶體清理
      if (forceGC) {
        forceGarbageCollection();
        await waitForGC();
      }

      if (shouldLog) {
        logMemoryUsage('測試完成後');
      }
    }

    return result;
  };
}

/**
 * 批次記憶體優化 - 用於大量測試的記憶體管理
 */
export class BatchMemoryOptimizer {
  private testCount = 0;
  private maxHeapSize: number;
  private batchSize: number;
  private forceGC: boolean;

  constructor(options: {
    maxHeapSize?: number;
    batchSize?: number;
    forceGC?: boolean;
  } = {}) {
    this.maxHeapSize = options.maxHeapSize || 500;
    this.batchSize = options.batchSize || 10;
    this.forceGC = options.forceGC !== false;
  }

  /**
   * 在每個測試前呼叫
   */
  async beforeTest(): Promise<void> {
    this.testCount++;

    // 每 N 個測試後強制清理
    if (this.testCount % this.batchSize === 0) {
      if (this.forceGC) {
        forceGarbageCollection();
        await waitForGC();
      }

      if (!checkMemoryLimit(this.maxHeapSize)) {
        console.warn(`批次測試 ${this.testCount} 記憶體使用超出限制`);
      }
    }
  }

  /**
   * 在測試完成後呼叫
   */
  async afterTest(): Promise<void> {
    // 可以在這裡添加測試後的清理邏輯
  }

  /**
   * 重置計數器
   */
  reset(): void {
    this.testCount = 0;
  }

  /**
   * 取得統計資訊
   */
  getStats(): { testCount: number; memoryStats: MemoryStats } {
    return {
      testCount: this.testCount,
      memoryStats: getMemoryStats()
    };
  }
}

/**
 * 記憶體洩漏檢測器
 */
export class MemoryLeakDetector {
  private baseline: MemoryStats | null = null;
  private threshold: number;

  constructor(thresholdMB = 50) {
    this.threshold = thresholdMB * 1024 * 1024; // 轉換為 bytes
  }

  /**
   * 設定基準記憶體使用量
   */
  setBaseline(): void {
    forceGarbageCollection();
    this.baseline = getMemoryStats();
  }

  /**
   * 檢查是否有記憶體洩漏
   */
  checkLeak(): { hasLeak: boolean; increase: number; stats: MemoryStats } {
    if (!this.baseline) {
      throw new Error('必須先呼叫 setBaseline() 設定基準');
    }

    forceGarbageCollection();
    const current = getMemoryStats();
    const increase = current.heapUsed - this.baseline.heapUsed;
    const hasLeak = increase > this.threshold;

    if (hasLeak) {
      const increaseMB = (increase / 1024 / 1024).toFixed(1);
      const thresholdMB = (this.threshold / 1024 / 1024).toFixed(1);
      console.warn(`偵測到可能的記憶體洩漏: 增加 ${increaseMB}MB (閾值: ${thresholdMB}MB)`);
    }

    return {
      hasLeak,
      increase,
      stats: current
    };
  }

  /**
   * 重置基準
   */
  reset(): void {
    this.baseline = null;
  }
}

// 導出預設實例
export const defaultMemoryOptimizer = new BatchMemoryOptimizer();
export const defaultLeakDetector = new MemoryLeakDetector();