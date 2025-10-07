/**
 * 記憶體監控和自動清理工具
 *
 * 用於監控記憶體使用情況並自動清理資源
 */
/**
 * 記憶體使用統計
 */
export interface MemoryStats {
    used: number;
    total: number;
    external: number;
    heapUsed: number;
    heapTotal: number;
    usagePercent: number;
}
/**
 * 可清理資源的介面
 */
export interface Disposable {
    dispose(): Promise<void> | void;
}
/**
 * 記憶體監控器
 */
export declare class MemoryMonitor {
    private static instance;
    private disposables;
    private monitoring;
    private monitoringInterval;
    private readonly thresholdPercent;
    private readonly cleanupInterval;
    constructor(thresholdPercent?: number, cleanupInterval?: number);
    /**
     * 取得單例實例
     */
    static getInstance(): MemoryMonitor;
    /**
     * 註冊可清理的資源
     */
    register(disposable: Disposable): void;
    /**
     * 取消註冊資源
     */
    unregister(disposable: Disposable): void;
    /**
     * 開始監控記憶體
     */
    startMonitoring(): void;
    /**
     * 停止監控記憶體
     */
    stopMonitoring(): void;
    /**
     * 取得記憶體使用統計
     */
    getMemoryStats(): MemoryStats;
    /**
     * 檢查記憶體使用量並觸發清理
     */
    private checkMemoryUsage;
    /**
     * 手動清理所有註冊的資源
     */
    cleanup(): Promise<void>;
    /**
     * 強制執行垃圾回收
     */
    forceGarbageCollection(): void;
    /**
     * 銷毀監控器
     */
    destroy(): void;
}
/**
 * 記憶體使用監控裝飾器
 */
export declare function withMemoryMonitoring<T extends Disposable>(target: T): T;
/**
 * 取得格式化的記憶體使用報告
 */
export declare function getFormattedMemoryReport(): string;
//# sourceMappingURL=memory-monitor.d.ts.map