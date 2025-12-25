/**
 * Parser Worker Pool
 * 使用 Tinypool 管理多執行緒 AST 解析
 */

import { cpus } from 'os';
import { fileURLToPath } from 'url';
import * as path from 'path';
import Tinypool from 'tinypool';
import type { ParseTask, ParseResult, WorkerPoolOptions } from './types.js';

/**
 * 計算 worker 檔案路徑
 * 無論從 src（測試）或 dist（執行）呼叫，都指向 dist 目錄
 */
function getWorkerPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // 檢查是否在 dist 目錄（正常執行）
  if (currentDir.includes('/dist/')) {
    return path.join(currentDir, 'workers', 'parse-worker.js');
  }

  // 從 src 目錄呼叫（測試環境），指向 dist
  // src/infrastructure/worker-pool/ → dist/infrastructure/worker-pool/workers/
  const projectRoot = currentDir.replace(/\/src\/infrastructure\/worker-pool$/, '');
  return path.join(projectRoot, 'dist', 'infrastructure', 'worker-pool', 'workers', 'parse-worker.js');
}

/**
 * Parser Worker Pool
 * 管理 Worker 執行緒池，將 AST 解析分散到多個執行緒
 */
export class ParserWorkerPool {
  private pool: Tinypool;
  private disposed = false;

  constructor(options?: WorkerPoolOptions) {
    const maxThreads = options?.maxThreads ?? Math.max(1, cpus().length - 1);
    const minThreads = options?.minThreads ?? 1;

    this.pool = new Tinypool({
      filename: getWorkerPath(),
      maxThreads,
      minThreads
    });
  }

  /**
   * 批次解析多個檔案
   * @param tasks 解析任務列表
   * @returns 解析結果列表
   */
  async parseFiles(tasks: ParseTask[]): Promise<ParseResult[]> {
    if (this.disposed) {
      throw new Error('ParserWorkerPool 已被釋放');
    }

    if (tasks.length === 0) {
      return [];
    }

    // 並行執行所有任務
    const results = await Promise.all(
      tasks.map(task => this.pool.run(task) as Promise<ParseResult>)
    );

    return results;
  }

  /**
   * 解析單一檔案
   * @param task 解析任務
   * @returns 解析結果
   */
  async parseFile(task: ParseTask): Promise<ParseResult> {
    if (this.disposed) {
      throw new Error('ParserWorkerPool 已被釋放');
    }

    return this.pool.run(task) as Promise<ParseResult>;
  }

  /**
   * 取消所有待處理任務
   */
  cancelPendingTasks(): void {
    if (!this.disposed) {
      this.pool.cancelPendingTasks();
    }
  }

  /**
   * 重建所有 Worker（用於強制隔離）
   */
  async recycleWorkers(): Promise<void> {
    if (!this.disposed) {
      await this.pool.recycleWorkers();
    }
  }

  /**
   * 釋放 Worker Pool 資源
   */
  async destroy(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      await this.pool.destroy();
    }
  }

  /**
   * 檢查是否已釋放
   */
  get isDisposed(): boolean {
    return this.disposed;
  }
}

/**
 * 建立 ParserWorkerPool 實例
 */
export function createParserWorkerPool(options?: WorkerPoolOptions): ParserWorkerPool {
  return new ParserWorkerPool(options);
}
