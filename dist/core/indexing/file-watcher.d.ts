/**
 * 檔案監控器實作
 * 監控檔案系統變更並觸發增量索引更新
 */
import { EventEmitter } from 'events';
import type { IndexEngine } from './index-engine.js';
/**
 * 檔案變更類型
 */
export type FileChangeType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
/**
 * 檔案變更事件
 */
export interface FileChangeEvent {
    filePath: string;
    type: FileChangeType;
    timestamp: Date;
    error?: string;
}
/**
 * 批次變更項目
 */
export interface BatchChangeItem {
    filePath: string;
    type: FileChangeType;
}
/**
 * 批次處理選項
 */
export interface BatchProcessOptions {
    maxConcurrency?: number;
    debounceTime?: number;
}
/**
 * 檔案監控器類別
 * 監控檔案系統變更並自動更新索引
 */
export declare class FileWatcher extends EventEmitter {
    private readonly indexEngine;
    private watcher;
    private isWatching;
    private isPaused;
    private pendingChanges;
    private debounceTimer;
    private readonly debounceTime;
    constructor(indexEngine: IndexEngine, options?: {
        debounceTime?: number;
    });
    /**
     * 開始監控檔案變更
     */
    start(): Promise<void>;
    /**
     * 停止監控檔案變更
     */
    stop(): Promise<void>;
    /**
     * 暫停監控
     */
    pause(): void;
    /**
     * 恢復監控
     */
    resume(): void;
    /**
     * 手動處理檔案變更事件
     */
    handleFileChange(filePath: string, changeType: FileChangeType): Promise<void>;
    /**
     * 批次處理檔案變更
     */
    handleBatchChanges(changes: BatchChangeItem[], options?: BatchProcessOptions): Promise<void>;
    /**
     * 將變更加入佇列（帶防抖動）
     */
    private queueChange;
    /**
     * 處理待處理的變更
     */
    private processPendingChanges;
    /**
     * 處理單一檔案變更
     */
    private processFileChange;
    /**
     * 檢查檔案是否應該被處理
     */
    private shouldProcessFile;
    /**
     * 簡單的檔案模式匹配
     */
    private matchesPattern;
    /**
     * 將陣列分割成指定大小的塊
     */
    private createChunks;
    /**
     * 取得監控狀態
     */
    getStatus(): {
        isWatching: boolean;
        isPaused: boolean;
        pendingChangesCount: number;
    };
    /**
     * 強制處理所有待處理的變更
     */
    flush(): Promise<void>;
}
//# sourceMappingURL=file-watcher.d.ts.map