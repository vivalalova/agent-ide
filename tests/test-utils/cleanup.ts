/**
 * 測試清理工具
 * 提供記憶體和資源清理的統一介面
 */

export class TestCleanup {
  private static resources: (() => Promise<void> | void)[] = [];
  
  /**
   * 註冊需要清理的資源
   */
  static register(cleanup: () => Promise<void> | void): void {
    this.resources.push(cleanup);
  }
  
  /**
   * 清理所有註冊的資源
   */
  static async cleanupAll(): Promise<void> {
    const cleanupPromises = this.resources.map(async (cleanup) => {
      try {
        await cleanup();
      } catch (error) {
        console.warn('清理資源時發生錯誤:', error);
      }
    });
    
    await Promise.all(cleanupPromises);
    this.resources.length = 0;
    
    // 強制垃圾回收（如果可用）
    if (global.gc) {
      global.gc();
    }
  }
  
  /**
   * 清理 Node.js 模組快取
   */
  static clearModuleCache(pattern?: RegExp): void {
    Object.keys(require.cache).forEach(key => {
      if (!pattern || pattern.test(key)) {
        delete require.cache[key];
      }
    });
  }
  
  /**
   * 清理全域變數
   */
  static clearGlobals(): void {
    // 清理測試期間可能設定的全域變數
    const globalKeys = Object.keys(global);
    globalKeys.forEach(key => {
      if (key.startsWith('test_') || key.startsWith('mock_')) {
        delete (global as any)[key];
      }
    });
  }
  
  /**
   * 記憶體使用量報告
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }
  
  /**
   * 記錄記憶體使用量
   */
  static logMemoryUsage(label?: string): void {
    const usage = this.getMemoryUsage();
    const prefix = label ? `[${label}] ` : '';
    
    console.log(`${prefix}記憶體使用量:`);
    console.log(`  RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Used: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Heap Total: ${(usage.heapTotal / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  External: ${(usage.external / 1024 / 1024).toFixed(2)} MB`);
  }
}

/**
 * 測試記憶體監控器
 */
export class TestMemoryMonitor {
  private startUsage: NodeJS.MemoryUsage;
  private testName: string;
  
  constructor(testName: string) {
    this.testName = testName;
    this.startUsage = process.memoryUsage();
  }
  
  /**
   * 檢查記憶體洩漏
   */
  checkMemoryLeak(thresholdMB = 50): boolean {
    const currentUsage = process.memoryUsage();
    const heapDiff = (currentUsage.heapUsed - this.startUsage.heapUsed) / 1024 / 1024;
    
    if (heapDiff > thresholdMB) {
      console.warn(`[${this.testName}] 可能的記憶體洩漏: ${heapDiff.toFixed(2)} MB`);
      return true;
    }
    
    return false;
  }
  
  /**
   * 獲取記憶體增長
   */
  getMemoryGrowth(): {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  } {
    const currentUsage = process.memoryUsage();
    
    return {
      rss: (currentUsage.rss - this.startUsage.rss) / 1024 / 1024,
      heapUsed: (currentUsage.heapUsed - this.startUsage.heapUsed) / 1024 / 1024,
      heapTotal: (currentUsage.heapTotal - this.startUsage.heapTotal) / 1024 / 1024,
      external: (currentUsage.external - this.startUsage.external) / 1024 / 1024
    };
  }
}

/**
 * 大型測試的記憶體優化 helper
 */
export function withMemoryOptimization<T>(
  testFn: (...args: any[]) => Promise<T> | T,
  options: {
    cleanup?: boolean;
    gc?: boolean;
    monitor?: boolean;
    testName?: string;
  } = {}
): (...args: any[]) => Promise<T> {
  return async (...args: any[]) => {
    const {
      cleanup = true,
      gc = true,
      monitor = false,
      testName = 'unknown'
    } = options;

    let memoryMonitor: TestMemoryMonitor | undefined;

    if (monitor) {
      memoryMonitor = new TestMemoryMonitor(testName);
    }

    try {
      const result = await testFn(...args);

      if (cleanup) {
        // 積極清理所有資源
        await TestCleanup.cleanupAll();

        // 清理 ParserRegistry
        try {
          const { ParserRegistry } = require('../../src/infrastructure/parser/registry');
          ParserRegistry.resetInstance();
        } catch (error) {
          // 忽略錯誤
        }

        // 清理 SessionManager 實例
        try {
          if (typeof global !== 'undefined' && (global as any).__test_session_managers) {
            for (const manager of (global as any).__test_session_managers) {
              if (manager && typeof manager.destroy === 'function') {
                manager.destroy();
              }
            }
            (global as any).__test_session_managers.length = 0;
          }
        } catch (error) {
          // 忽略錯誤
        }
      }

      if (gc && global.gc) {
        // 多次垃圾回收以確保清理
        for (let i = 0; i < 3; i++) {
          global.gc();
        }
      }

      if (memoryMonitor) {
        memoryMonitor.checkMemoryLeak();
      }

      return result;
    } catch (error) {
      if (cleanup) {
        await TestCleanup.cleanupAll();

        // 錯誤情況下也要清理
        try {
          const { ParserRegistry } = require('../../src/infrastructure/parser/registry');
          ParserRegistry.resetInstance();
        } catch (cleanupError) {
          // 忽略清理錯誤
        }
      }
      throw error;
    }
  };
}