import { EventEmitter } from 'events';
import { WatchOptions, FileWatcherEventListener } from './types.js';
/**
 * 檔案監控器
 * 基於 chokidar 提供檔案變更監控功能
 */
export declare class FileWatcher extends EventEmitter {
    private watchers;
    private readonly defaultOptions;
    constructor();
    /**
     * 開始監控路徑
     */
    watch(watchPath: string, options?: WatchOptions): Promise<void>;
    /**
     * 設定事件處理器
     */
    private setupEventHandlers;
    /**
     * 轉換統計資訊格式
     */
    private convertStats;
    /**
     * 發送事件
     */
    private emitEvent;
    /**
     * 停止監控特定路徑
     */
    unwatch(watchPath: string): Promise<void>;
    /**
     * 新增監控路徑到現有 watcher
     */
    add(watchPath: string, filePath: string): Promise<void>;
    /**
     * 關閉所有監控
     */
    close(): Promise<void>;
    /**
     * 獲取當前監控的路徑
     */
    getWatched(): Record<string, string[]>;
    /**
     * 檢查是否正在監控
     */
    isWatching(): boolean;
    /**
     * 獲取監控路徑列表
     */
    getWatchedPaths(): string[];
    /**
     * 添加事件監聽器 (覆寫 EventEmitter 方法以提供型別安全)
     */
    on(event: 'change', listener: FileWatcherEventListener): this;
    /**
     * 移除事件監聽器 (覆寫 EventEmitter 方法以提供型別安全)
     */
    off(event: 'change', listener: FileWatcherEventListener): this;
    /**
     * 添加一次性事件監聽器
     */
    once(event: 'change', listener: FileWatcherEventListener): this;
    /**
     * 暫停監控（但不關閉 watcher）
     */
    pause(): void;
    /**
     * 恢復監控
     */
    resume(): void;
    /**
     * 設定去抖動延遲
     */
    setDebounceDelay(delay: number): void;
    /**
     * 獲取監控統計資訊
     */
    getStats(): {
        watcherCount: number;
        watchedPaths: number;
        totalWatchedFiles: number;
    };
}
//# sourceMappingURL=file-watcher.d.ts.map