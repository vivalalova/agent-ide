/**
 * Application State 模組
 *
 * 提供完整的狀態管理解決方案，包括：
 * - 會話狀態管理
 * - 應用程式全域狀態
 * - 統一的狀態管理器
 * - 不可變狀態更新
 * - 狀態持久化支援
 * - 時間旅行除錯支援
 */
export { SessionState, type SessionOptions, type OperationRecord, type SessionContext, type SessionStateData } from './session-state.js';
export { ApplicationState, type Environment, type ModuleState, type CacheStats, type PerformanceMetrics, type ApplicationStateData, type StateSummary } from './application-state.js';
export { StateManager, type StateSnapshot, type StateManagerStats, type HealthCheck, type StateEvent } from './state-manager.js';
//# sourceMappingURL=index.d.ts.map