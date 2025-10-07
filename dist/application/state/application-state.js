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
export class ApplicationState {
    version;
    environment;
    isInitialized;
    moduleStates;
    globalSettings;
    cacheStats;
    performanceMetrics;
    constructor(initialSettings = {}) {
        this.version = '1.0.0';
        this.environment = 'development';
        this.isInitialized = false;
        this.moduleStates = {};
        this.globalSettings = initialSettings;
        this.cacheStats = {
            hitCount: 0,
            missCount: 0,
            totalSize: 0
        };
        this.performanceMetrics = {
            startTime: new Date(),
            totalOperations: 0,
            averageResponseTime: 0
        };
    }
    /**
     * 從 JSON 數據建立 ApplicationState 實例
     */
    static fromJSON(data) {
        const instance = new ApplicationState(data.globalSettings);
        return Object.assign(Object.create(Object.getPrototypeOf(instance)), {
            ...instance,
            version: data.version || '1.0.0',
            environment: data.environment || 'development',
            isInitialized: data.isInitialized ?? false,
            moduleStates: data.moduleStates || {},
            globalSettings: data.globalSettings || {},
            cacheStats: data.cacheStats || instance.cacheStats,
            performanceMetrics: data.performanceMetrics ? {
                ...data.performanceMetrics,
                startTime: new Date(data.performanceMetrics.startTime)
            } : instance.performanceMetrics
        });
    }
    /**
     * 標記應用程式為已初始化
     */
    markInitialized() {
        return this.clone({
            isInitialized: true
        });
    }
    /**
     * 更新版本
     */
    updateVersion(version) {
        return this.clone({
            version
        });
    }
    /**
     * 設定環境
     */
    setEnvironment(environment) {
        return this.clone({
            environment
        });
    }
    /**
     * 設定模組狀態
     */
    setModuleState(moduleId, state) {
        return this.clone({
            moduleStates: {
                ...this.moduleStates,
                [moduleId]: state
            }
        });
    }
    /**
     * 批次設定模組狀態
     */
    setModuleStates(states) {
        return this.clone({
            moduleStates: {
                ...this.moduleStates,
                ...states
            }
        });
    }
    /**
     * 獲取模組狀態
     */
    getModuleState(moduleId) {
        return this.moduleStates[moduleId];
    }
    /**
     * 移除模組狀態
     */
    removeModuleState(moduleId) {
        const newModuleStates = { ...this.moduleStates };
        delete newModuleStates[moduleId];
        return this.clone({
            moduleStates: newModuleStates
        });
    }
    /**
     * 更新全域設定
     */
    updateSettings(settings) {
        return this.clone({
            globalSettings: {
                ...this.globalSettings,
                ...settings
            }
        });
    }
    /**
     * 獲取設定值
     */
    getSetting(key) {
        return this.globalSettings[key];
    }
    /**
     * 移除設定
     */
    removeSetting(key) {
        const newSettings = { ...this.globalSettings };
        delete newSettings[key];
        return this.clone({
            globalSettings: newSettings
        });
    }
    /**
     * 更新快取統計
     */
    updateCacheStats(stats) {
        return this.clone({
            cacheStats: stats
        });
    }
    /**
     * 增加快取命中次數
     */
    incrementCacheHit() {
        return this.clone({
            cacheStats: {
                ...this.cacheStats,
                hitCount: this.cacheStats.hitCount + 1
            }
        });
    }
    /**
     * 增加快取未命中次數
     */
    incrementCacheMiss() {
        return this.clone({
            cacheStats: {
                ...this.cacheStats,
                missCount: this.cacheStats.missCount + 1
            }
        });
    }
    /**
     * 計算快取命中率
     */
    getCacheHitRate() {
        const total = this.cacheStats.hitCount + this.cacheStats.missCount;
        if (total === 0) {
            return 0;
        }
        return this.cacheStats.hitCount / total;
    }
    /**
     * 更新效能指標
     */
    updatePerformanceMetrics(metrics) {
        return this.clone({
            performanceMetrics: metrics
        });
    }
    /**
     * 記錄操作
     */
    recordOperation(responseTime) {
        const currentTotal = this.performanceMetrics.totalOperations;
        const currentAverage = this.performanceMetrics.averageResponseTime;
        const newTotal = currentTotal + 1;
        const newAverage = (currentAverage * currentTotal + responseTime) / newTotal;
        return this.clone({
            performanceMetrics: {
                ...this.performanceMetrics,
                totalOperations: newTotal,
                averageResponseTime: newAverage
            }
        });
    }
    /**
     * 獲取運行時間（毫秒）
     */
    getRuntime() {
        return Date.now() - this.performanceMetrics.startTime.getTime();
    }
    /**
     * 驗證狀態完整性
     */
    isValid() {
        // 檢查基本屬性
        if (!this.version || typeof this.version !== 'string') {
            return false;
        }
        if (!['development', 'production', 'test'].includes(this.environment)) {
            return false;
        }
        // 檢查快取統計
        if (this.cacheStats.hitCount < 0 || this.cacheStats.missCount < 0 || this.cacheStats.totalSize < 0) {
            return false;
        }
        // 檢查效能指標
        if (this.performanceMetrics.totalOperations < 0 || this.performanceMetrics.averageResponseTime < 0) {
            return false;
        }
        return true;
    }
    /**
     * 獲取狀態摘要
     */
    getSummary() {
        return {
            version: this.version,
            environment: this.environment,
            isInitialized: this.isInitialized,
            moduleCount: Object.keys(this.moduleStates).length,
            settingsCount: Object.keys(this.globalSettings).length,
            cacheHitRate: this.getCacheHitRate(),
            totalOperations: this.performanceMetrics.totalOperations,
            runtime: this.getRuntime()
        };
    }
    /**
     * 重設所有狀態
     */
    reset() {
        return new ApplicationState();
    }
    /**
     * 重設模組狀態
     */
    resetModuleStates() {
        return this.clone({
            moduleStates: {}
        });
    }
    /**
     * 序列化為 JSON
     */
    toJSON() {
        return {
            version: this.version,
            environment: this.environment,
            isInitialized: this.isInitialized,
            moduleStates: this.moduleStates,
            globalSettings: this.globalSettings,
            cacheStats: this.cacheStats,
            performanceMetrics: this.performanceMetrics
        };
    }
    /**
     * 克隆狀態並應用變更（不可變更新）
     */
    clone(changes) {
        const instance = Object.create(Object.getPrototypeOf(this));
        return Object.assign(instance, {
            ...this,
            ...changes
        });
    }
}
//# sourceMappingURL=application-state.js.map