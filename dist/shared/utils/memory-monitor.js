/**
 * 記憶體監控和自動清理工具
 *
 * 用於監控記憶體使用情況並自動清理資源
 */
/**
 * 記憶體監控器
 */
export class MemoryMonitor {
    static instance = null;
    disposables = new Set();
    monitoring = false;
    monitoringInterval = null;
    thresholdPercent;
    cleanupInterval;
    constructor(thresholdPercent = 80, cleanupInterval = 30000) {
        this.thresholdPercent = thresholdPercent;
        this.cleanupInterval = cleanupInterval;
    }
    /**
     * 取得單例實例
     */
    static getInstance() {
        if (!MemoryMonitor.instance) {
            MemoryMonitor.instance = new MemoryMonitor();
        }
        return MemoryMonitor.instance;
    }
    /**
     * 註冊可清理的資源
     */
    register(disposable) {
        this.disposables.add(disposable);
    }
    /**
     * 取消註冊資源
     */
    unregister(disposable) {
        this.disposables.delete(disposable);
    }
    /**
     * 開始監控記憶體
     */
    startMonitoring() {
        if (this.monitoring) {
            return;
        }
        this.monitoring = true;
        this.monitoringInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, this.cleanupInterval);
    }
    /**
     * 停止監控記憶體
     */
    stopMonitoring() {
        this.monitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    }
    /**
     * 取得記憶體使用統計
     */
    getMemoryStats() {
        const usage = process.memoryUsage();
        return {
            used: usage.rss,
            total: usage.rss + usage.heapTotal,
            external: usage.external,
            heapUsed: usage.heapUsed,
            heapTotal: usage.heapTotal,
            usagePercent: (usage.heapUsed / usage.heapTotal) * 100
        };
    }
    /**
     * 檢查記憶體使用量並觸發清理
     */
    async checkMemoryUsage() {
        const stats = this.getMemoryStats();
        if (stats.usagePercent > this.thresholdPercent) {
            console.warn(`記憶體使用率過高: ${stats.usagePercent.toFixed(2)}%，開始清理...`);
            await this.cleanup();
            // 清理後再次檢查
            const afterStats = this.getMemoryStats();
            console.log(`清理後記憶體使用率: ${afterStats.usagePercent.toFixed(2)}%`);
        }
    }
    /**
     * 手動清理所有註冊的資源
     */
    async cleanup() {
        const disposableArray = Array.from(this.disposables);
        // 並行清理所有資源
        await Promise.allSettled(disposableArray.map(async (disposable) => {
            try {
                await disposable.dispose();
            }
            catch (error) {
                console.warn('清理資源時發生錯誤:', error);
            }
        }));
        // 觸發垃圾回收（如果可用）
        this.forceGarbageCollection();
    }
    /**
     * 強制執行垃圾回收
     */
    forceGarbageCollection() {
        if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
            // 進行多次垃圾回收以確保完全清理
            for (let i = 0; i < 3; i++) {
                global.gc();
            }
        }
        else if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
            // 在測試環境中嘗試強制 GC
            if (typeof global !== 'undefined' && 'gc' in global && typeof global.gc === 'function') {
                for (let i = 0; i < 3; i++) {
                    global.gc();
                }
            }
        }
    }
    /**
     * 銷毀監控器
     */
    destroy() {
        this.stopMonitoring();
        this.disposables.clear();
        MemoryMonitor.instance = null;
    }
}
/**
 * 記憶體使用監控裝飾器
 */
export function withMemoryMonitoring(target) {
    const monitor = MemoryMonitor.getInstance();
    monitor.register(target);
    return target;
}
/**
 * 取得格式化的記憶體使用報告
 */
export function getFormattedMemoryReport() {
    const stats = MemoryMonitor.getInstance().getMemoryStats();
    return `
記憶體使用報告:
- 堆記憶體使用: ${formatBytes(stats.heapUsed)}
- 堆記憶體總量: ${formatBytes(stats.heapTotal)}
- 外部記憶體: ${formatBytes(stats.external)}
- 總記憶體使用: ${formatBytes(stats.used)}
- 使用率: ${stats.usagePercent.toFixed(2)}%
  `.trim();
}
/**
 * 格式化位元組數為可讀格式
 */
function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) {
        return '0 Bytes';
    }
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}
//# sourceMappingURL=memory-monitor.js.map