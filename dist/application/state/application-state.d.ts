/**
 * 應用程式全域狀態管理類別
 *
 * 負責管理應用程式的全域狀態，包括：
 * - 應用程式基本資訊（版本、環境等）
 * - 模組狀態管理
 * - 全域設定
 * - 快取統計
 * - 效能指標
 * - 狀態持久化和恢復
 */
export type Environment = 'development' | 'production' | 'test';
export interface ModuleState {
    /** 模組是否已載入 */
    isLoaded: boolean;
    /** 最後使用時間 */
    lastUsed: Date;
    /** 錯誤計數 */
    errorCount: number;
    /** 模組相關的元數據 */
    metadata: Record<string, unknown>;
}
export interface CacheStats {
    /** 快取命中次數 */
    hitCount: number;
    /** 快取未命中次數 */
    missCount: number;
    /** 快取總大小 */
    totalSize: number;
}
export interface PerformanceMetrics {
    /** 應用程式啟動時間 */
    startTime: Date;
    /** 總操作次數 */
    totalOperations: number;
    /** 平均回應時間 */
    averageResponseTime: number;
}
export interface ApplicationStateData {
    version: string;
    environment: Environment;
    isInitialized: boolean;
    moduleStates: Record<string, ModuleState>;
    globalSettings: Record<string, unknown>;
    cacheStats: CacheStats;
    performanceMetrics: PerformanceMetrics;
}
export interface StateSummary {
    version: string;
    environment: Environment;
    isInitialized: boolean;
    moduleCount: number;
    settingsCount: number;
    cacheHitRate: number;
    totalOperations: number;
    runtime: number;
}
export declare class ApplicationState {
    readonly version: string;
    readonly environment: Environment;
    readonly isInitialized: boolean;
    readonly moduleStates: Record<string, ModuleState>;
    readonly globalSettings: Record<string, unknown>;
    readonly cacheStats: CacheStats;
    readonly performanceMetrics: PerformanceMetrics;
    constructor(initialSettings?: Record<string, unknown>);
    /**
     * 從 JSON 數據建立 ApplicationState 實例
     */
    static fromJSON(data: Partial<ApplicationStateData>): ApplicationState;
    /**
     * 標記應用程式為已初始化
     */
    markInitialized(): ApplicationState;
    /**
     * 更新版本
     */
    updateVersion(version: string): ApplicationState;
    /**
     * 設定環境
     */
    setEnvironment(environment: Environment): ApplicationState;
    /**
     * 設定模組狀態
     */
    setModuleState(moduleId: string, state: ModuleState): ApplicationState;
    /**
     * 批次設定模組狀態
     */
    setModuleStates(states: Record<string, ModuleState>): ApplicationState;
    /**
     * 獲取模組狀態
     */
    getModuleState(moduleId: string): ModuleState | undefined;
    /**
     * 移除模組狀態
     */
    removeModuleState(moduleId: string): ApplicationState;
    /**
     * 更新全域設定
     */
    updateSettings(settings: Record<string, unknown>): ApplicationState;
    /**
     * 獲取設定值
     */
    getSetting(key: string): unknown;
    /**
     * 移除設定
     */
    removeSetting(key: string): ApplicationState;
    /**
     * 更新快取統計
     */
    updateCacheStats(stats: CacheStats): ApplicationState;
    /**
     * 增加快取命中次數
     */
    incrementCacheHit(): ApplicationState;
    /**
     * 增加快取未命中次數
     */
    incrementCacheMiss(): ApplicationState;
    /**
     * 計算快取命中率
     */
    getCacheHitRate(): number;
    /**
     * 更新效能指標
     */
    updatePerformanceMetrics(metrics: PerformanceMetrics): ApplicationState;
    /**
     * 記錄操作
     */
    recordOperation(responseTime: number): ApplicationState;
    /**
     * 獲取運行時間（毫秒）
     */
    getRuntime(): number;
    /**
     * 驗證狀態完整性
     */
    isValid(): boolean;
    /**
     * 獲取狀態摘要
     */
    getSummary(): StateSummary;
    /**
     * 重設所有狀態
     */
    reset(): ApplicationState;
    /**
     * 重設模組狀態
     */
    resetModuleStates(): ApplicationState;
    /**
     * 序列化為 JSON
     */
    toJSON(): ApplicationStateData;
    /**
     * 克隆狀態並應用變更（不可變更新）
     */
    private clone;
}
//# sourceMappingURL=application-state.d.ts.map