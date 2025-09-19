import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import { 
  WatchOptions, 
  FileChangeEvent, 
  FileWatcherEventListener,
  FileStats 
} from './types';

/**
 * 檔案監控器
 * 基於 chokidar 提供檔案變更監控功能
 */
export class FileWatcher extends EventEmitter {
  private watchers = new Map<string, FSWatcher>();
  private readonly defaultOptions: WatchOptions = {
    persistent: true,
    recursive: true,
    ignoreInitial: true,
    followSymlinks: false,
    atomic: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 100,
    },
  };

  constructor() {
    super();
    this.setMaxListeners(100); // 增加最大監聽器數量
  }

  /**
   * 開始監控路徑
   */
  async watch(watchPath: string, options: WatchOptions = {}): Promise<void> {
    if (this.watchers.has(watchPath)) {
      // 已經在監控此路徑
      return;
    }

    const mergedOptions = { ...this.defaultOptions, ...options };
    
    try {
      const watcher = chokidar.watch(watchPath, {
        persistent: mergedOptions.persistent,
        ignored: mergedOptions.ignored,
        ignoreInitial: mergedOptions.ignoreInitial,
        followSymlinks: mergedOptions.followSymlinks,
        cwd: mergedOptions.cwd,
        usePolling: mergedOptions.usePolling,
        interval: mergedOptions.interval,
        binaryInterval: mergedOptions.binaryInterval,
        alwaysStat: mergedOptions.alwaysStat,
        depth: mergedOptions.depth,
        awaitWriteFinish: mergedOptions.awaitWriteFinish,
        ignorePermissionErrors: mergedOptions.ignorePermissionErrors,
        atomic: mergedOptions.atomic,
      });

      // 設定事件處理器
      this.setupEventHandlers(watcher, watchPath);

      // 儲存 watcher 實例
      this.watchers.set(watchPath, watcher);

      // 等待 watcher 準備完成
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Watch timeout for path: ${watchPath}`));
        }, 5000);

        watcher.on('ready', () => {
          clearTimeout(timeout);
          this.emitEvent({
            type: 'ready',
            path: watchPath,
          });
          resolve();
        });

        watcher.on('error', (error) => {
          clearTimeout(timeout);
          reject(error as Error);
        });
      });

    } catch (error) {
      const errorEvent: FileChangeEvent = {
        type: 'error',
        path: watchPath,
        error: error instanceof Error ? error : new Error(String(error)),
      };
      this.emitEvent(errorEvent);
      throw error;
    }
  }

  /**
   * 設定事件處理器
   */
  private setupEventHandlers(watcher: FSWatcher, watchPath: string): void {
    // 檔案/目錄事件
    watcher.on('all', (eventType, filePath, stats) => {
      const event: FileChangeEvent = {
        type: eventType as any,
        path: filePath,
        stats: stats ? this.convertStats(stats) : undefined,
      };
      this.emitEvent(event);
    });

    // 錯誤事件
    watcher.on('error', (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitEvent({
        type: 'error',
        path: watchPath,
        error,
      });
    });
  }

  /**
   * 轉換統計資訊格式
   */
  private convertStats(stats: any): FileStats {
    return {
      isFile: typeof stats.isFile === 'function' ? stats.isFile() : stats.isFile || false,
      isDirectory: typeof stats.isDirectory === 'function' ? stats.isDirectory() : stats.isDirectory || false,
      size: stats.size || 0,
      createdTime: stats.birthtime || new Date(),
      modifiedTime: stats.mtime || new Date(),
      accessedTime: stats.atime || new Date(),
      mode: stats.mode || 0,
      uid: stats.uid,
      gid: stats.gid,
    };
  }

  /**
   * 發送事件
   */
  private emitEvent(event: FileChangeEvent): void {
    this.emit('change', event);
  }

  /**
   * 停止監控特定路徑
   */
  async unwatch(watchPath: string): Promise<void> {
    const watcher = this.watchers.get(watchPath);
    if (!watcher) {
      return;
    }

    await watcher.unwatch(watchPath);
    this.watchers.delete(watchPath);
  }

  /**
   * 新增監控路徑到現有 watcher
   */
  async add(watchPath: string, filePath: string): Promise<void> {
    const watcher = this.watchers.get(watchPath);
    if (!watcher) {
      throw new Error(`No watcher found for path: ${watchPath}`);
    }

    watcher.add(filePath);
  }

  /**
   * 關閉所有監控
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.watchers.values()).map(watcher => 
      watcher.close()
    );

    await Promise.all(closePromises);
    this.watchers.clear();
    this.removeAllListeners();
  }

  /**
   * 獲取當前監控的路徑
   */
  getWatched(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    
    for (const [path, watcher] of Array.from(this.watchers.entries())) {
      const watched = watcher.getWatched();
      Object.assign(result, watched);
    }
    
    return result;
  }

  /**
   * 檢查是否正在監控
   */
  isWatching(): boolean {
    return this.watchers.size > 0;
  }

  /**
   * 獲取監控路徑列表
   */
  getWatchedPaths(): string[] {
    return Array.from(this.watchers.keys());
  }

  /**
   * 添加事件監聽器 (覆寫 EventEmitter 方法以提供型別安全)
   */
  on(event: 'change', listener: FileWatcherEventListener): this {
    return super.on(event, listener);
  }

  /**
   * 移除事件監聽器 (覆寫 EventEmitter 方法以提供型別安全)
   */
  off(event: 'change', listener: FileWatcherEventListener): this {
    return super.off(event, listener);
  }

  /**
   * 添加一次性事件監聽器
   */
  once(event: 'change', listener: FileWatcherEventListener): this {
    return super.once(event, listener);
  }

  /**
   * 暫停監控（但不關閉 watcher）
   */
  pause(): void {
    for (const watcher of Array.from(this.watchers.values())) {
      // chokidar 沒有直接的暫停方法，我們移除所有路徑
      const watched = watcher.getWatched();
      for (const dir of Object.keys(watched)) {
        for (const file of watched[dir]) {
          watcher.unwatch(`${dir}/${file}`);
        }
      }
    }
  }

  /**
   * 恢復監控
   */
  resume(): void {
    // 重新添加所有監控路徑
    const paths = this.getWatchedPaths();
    for (const path of paths) {
      const watcher = this.watchers.get(path);
      if (watcher) {
        watcher.add(path);
      }
    }
  }

  /**
   * 設定去抖動延遲
   */
  setDebounceDelay(delay: number): void {
    // 更新所有現有 watcher 的去抖動設定
    for (const watcher of Array.from(this.watchers.values())) {
      // chokidar 不支援動態修改 awaitWriteFinish，
      // 這裡只是示範介面，實際需要重建 watcher
      console.warn('動態修改去抖動延遲需要重建 watcher');
    }
  }

  /**
   * 獲取監控統計資訊
   */
  getStats(): {
    watcherCount: number;
    watchedPaths: number;
    totalWatchedFiles: number;
  } {
    const watched = this.getWatched();
    const totalFiles = Object.values(watched).reduce((sum, files) => sum + files.length, 0);

    return {
      watcherCount: this.watchers.size,
      watchedPaths: Object.keys(watched).length,
      totalWatchedFiles: totalFiles,
    };
  }
}