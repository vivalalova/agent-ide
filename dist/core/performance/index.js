/**
 * Performance 模組主入口
 * 匯出所有效能相關的類別和工具
 */
// 介面定義
export * from './interfaces.js';
// 核心組件
export * from './analyzer.js';
export * from './monitor.js';
export * from './cache-manager.js';
export * from './memory-manager.js';
// 預設實例
export { DefaultPerformanceAnalyzer, DEFAULT_PERFORMANCE_CONFIG } from './analyzer.js';
export { globalPerformanceMonitor, measureAsync, measureSync } from './monitor.js';
export { globalPerformanceCache, CacheStrategy } from './cache-manager.js';
export { globalMemoryManager, MemoryEventType } from './memory-manager.js';
//# sourceMappingURL=index.js.map