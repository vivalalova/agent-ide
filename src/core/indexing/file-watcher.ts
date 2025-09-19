/**
 * 檔案監控器實作
 * 監控檔案系統變更並觸發增量索引更新
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import type { FSWatcher } from 'fs';
import type { IndexEngine } from './index-engine';

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
export class FileWatcher extends EventEmitter {
  private readonly indexEngine: IndexEngine;
  private watcher: FSWatcher | null = null;
  private isWatching = false;
  private isPaused = false;
  private pendingChanges = new Map<string, BatchChangeItem>();
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceTime: number;

  constructor(indexEngine: IndexEngine, options?: { debounceTime?: number }) {
    super();
    this.indexEngine = indexEngine;
    this.debounceTime = options?.debounceTime ?? 300; // 300ms debounce
  }

  /**
   * 開始監控檔案變更
   */
  async start(): Promise<void> {
    if (this.isWatching) {
      return;
    }

    const config = this.indexEngine.getConfig();
    
    try {
      // 使用原生 fs.watch，在實際環境中可能需要使用 chokidar 等更強大的監控庫
      const { watch } = await import('fs');
      
      this.watcher = watch(
        config.workspacePath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename || this.isPaused) {
            return;
          }

          const filePath = `${config.workspacePath}/${filename}`;
          
          // 判斷變更類型
          let changeType: FileChangeType = 'change';
          if (eventType === 'rename') {
            // 需要進一步檢查是新增還是刪除
            fs.access(filePath)
              .then(() => {
                changeType = 'add';
                this.queueChange(filePath, changeType);
              })
              .catch(() => {
                changeType = 'unlink';
                this.queueChange(filePath, changeType);
              });
          } else {
            this.queueChange(filePath, changeType);
          }
        }
      );

      this.isWatching = true;
      this.emit('started');
      
    } catch (error) {
      this.emit('error', new Error(`啟動檔案監控失敗: ${error}`));
      throw error;
    }
  }

  /**
   * 停止監控檔案變更
   */
  async stop(): Promise<void> {
    if (!this.isWatching) {
      return;
    }

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 處理剩餘的變更
    await this.processPendingChanges();

    this.isWatching = false;
    this.emit('stopped');
  }

  /**
   * 暫停監控
   */
  pause(): void {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * 恢復監控
   */
  resume(): void {
    this.isPaused = false;
    this.emit('resumed');
  }

  /**
   * 手動處理檔案變更事件
   */
  async handleFileChange(filePath: string, changeType: FileChangeType): Promise<void> {
    const event: FileChangeEvent = {
      filePath,
      type: changeType,
      timestamp: new Date()
    };

    try {
      await this.processFileChange(filePath, changeType);
      
      event.error = undefined;
      this.emit('fileChanged', event);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      event.error = errorMessage;
      
      this.emit('error', new Error(`處理檔案變更失敗 ${filePath}: ${errorMessage}`));
      this.emit('fileChanged', event);
    }
  }

  /**
   * 批次處理檔案變更
   */
  async handleBatchChanges(
    changes: BatchChangeItem[], 
    options?: BatchProcessOptions
  ): Promise<void> {
    const maxConcurrency = options?.maxConcurrency ?? 4;
    const chunks = this.createChunks(changes, maxConcurrency);
    
    for (const chunk of chunks) {
      const promises = chunk.map(change => 
        this.handleFileChange(change.filePath, change.type)
      );
      
      await Promise.allSettled(promises);
    }
  }

  /**
   * 將變更加入佇列（帶防抖動）
   */
  private queueChange(filePath: string, changeType: FileChangeType): void {
    // 檢查檔案是否應該被索引
    const config = this.indexEngine.getConfig();
    if (!this.shouldProcessFile(filePath, config)) {
      return;
    }

    // 更新待處理變更
    this.pendingChanges.set(filePath, { filePath, type: changeType });

    // 重設防抖動計時器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.debounceTime);
  }

  /**
   * 處理待處理的變更
   */
  private async processPendingChanges(): Promise<void> {
    if (this.pendingChanges.size === 0) {
      return;
    }

    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();

    await this.handleBatchChanges(changes);
  }

  /**
   * 處理單一檔案變更
   */
  private async processFileChange(filePath: string, changeType: FileChangeType): Promise<void> {
    switch (changeType) {
      case 'add':
      case 'change':
        try {
          // 檢查檔案是否存在
          await fs.access(filePath);
          
          if (this.indexEngine.isIndexed(filePath)) {
            await this.indexEngine.updateFile(filePath);
          } else {
            await this.indexEngine.indexFile(filePath);
          }
        } catch (error) {
          // 檔案可能在處理過程中被刪除
          if (this.indexEngine.isIndexed(filePath)) {
            await this.indexEngine.removeFile(filePath);
          }
        }
        break;

      case 'unlink':
        if (this.indexEngine.isIndexed(filePath)) {
          await this.indexEngine.removeFile(filePath);
        }
        break;

      case 'addDir':
        // 新增目錄時，索引其中的檔案
        try {
          await this.indexEngine.indexDirectory(filePath);
        } catch (error) {
          // 目錄可能不存在或無法存取
        }
        break;

      case 'unlinkDir':
        // 刪除目錄時，移除其中所有檔案的索引
        const allFiles = this.indexEngine.getAllIndexedFiles();
        const filesToRemove = allFiles.filter(f => 
          f.filePath.startsWith(filePath + '/')
        );
        
        for (const file of filesToRemove) {
          await this.indexEngine.removeFile(file.filePath);
        }
        break;

      default:
        throw new Error(`不支援的檔案變更類型: ${changeType}`);
    }
  }

  /**
   * 檢查檔案是否應該被處理
   */
  private shouldProcessFile(filePath: string, config: any): boolean {
    // 檢查副檔名
    const extension = filePath.substring(filePath.lastIndexOf('.'));
    if (!config.includeExtensions.includes(extension)) {
      return false;
    }

    // 檢查排除模式
    for (const pattern of config.excludePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 簡單的檔案模式匹配
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // 簡化實作，實際環境中可能需要更強大的 glob 匹配
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');
    
    const regex = new RegExp(regexPattern);
    return regex.test(filePath);
  }

  /**
   * 將陣列分割成指定大小的塊
   */
  private createChunks<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    
    return chunks;
  }

  /**
   * 取得監控狀態
   */
  getStatus(): {
    isWatching: boolean;
    isPaused: boolean;
    pendingChangesCount: number;
  } {
    return {
      isWatching: this.isWatching,
      isPaused: this.isPaused,
      pendingChangesCount: this.pendingChanges.size
    };
  }

  /**
   * 強制處理所有待處理的變更
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    await this.processPendingChanges();
  }
}