/**
 * Parser Worker Pool
 * 使用 Tinypool 管理多執行緒 AST 解析
 */

import { cpus } from 'os';
import { fileURLToPath } from 'url';
import * as path from 'path';
import Tinypool from 'tinypool';
import type { ParseTask, ParseResult, WorkerPoolOptions } from './types.js';
import { getErrorMessage } from '@shared/errors/index.js';

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
  private readonly parserModulePaths: readonly string[];
  private disposed = false;

  constructor(options?: WorkerPoolOptions) {
    const maxThreads = options?.maxThreads ?? Math.max(1, cpus().length - 1);
    const minThreads = options?.minThreads ?? 1;
    this.parserModulePaths = options?.parserModulePaths ?? [];

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

    // 並行執行所有任務；worker 級失敗（crash、parser module 載入失敗等）逐檔隔離成該檔 parse error，
    // 與單執行緒路徑逐檔 try/catch 對稱，不讓單一檔讓整批 reject。
    // pool 已釋放（dispose/cancel 造成的 reject）則原樣拋出，不得降格成 parse error 寫回索引。
    const results = await Promise.all(
      tasks.map(async (task): Promise<ParseResult> => {
        try {
          return await (this.pool.run(this.withParserModules(task)) as Promise<ParseResult>);
        } catch (error) {
          if (this.disposed) {
            throw error;
          }
          return {
            filePath: task.filePath,
            symbols: [],
            dependencies: [],
            errors: [`worker 解析失敗: ${getErrorMessage(error)}`]
          };
        }
      })
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

    return this.pool.run(this.withParserModules(task)) as Promise<ParseResult>;
  }

  private withParserModules(task: ParseTask): ParseTask {
    if (this.parserModulePaths.length === 0) {
      return task;
    }

    return {
      ...task,
      parserModulePaths: [
        ...new Set([
          ...(task.parserModulePaths ?? []),
          ...this.parserModulePaths
        ])
      ]
    };
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
