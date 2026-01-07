/**
 * FileLock - 跨 Process 檔案鎖機制
 * 使用檔案鎖 + 輪詢確保同一專案同時只有一個變更類命令執行
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

import type { LockOptions, LockInfo, LockResult } from './types.js';
import { LOCK_DEFAULTS } from './types.js';

/**
 * 檔案鎖管理器
 */
export class FileLock {
  private readonly lockDir: string;
  private readonly projectHash: string;
  private readonly projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = path.resolve(projectPath);
    this.lockDir = path.join(os.homedir(), '.config', 'agent-ide', LOCK_DEFAULTS.LOCK_DIR);
    this.projectHash = this.computeProjectHash(this.projectPath);
  }

  /**
   * 取得鎖檔案路徑
   */
  get lockFilePath(): string {
    return path.join(this.lockDir, `${this.projectHash}.lock`);
  }

  /**
   * 嘗試取得鎖
   */
  async acquire(options: Omit<LockOptions, 'projectPath'>): Promise<LockResult> {
    const pollInterval = options.pollInterval ?? LOCK_DEFAULTS.POLL_INTERVAL;
    const timeout = options.timeout ?? LOCK_DEFAULTS.TIMEOUT;
    const staleTimeout = options.staleTimeout ?? LOCK_DEFAULTS.STALE_TIMEOUT;

    // 確保鎖目錄存在
    await this.ensureLockDir();

    const startTime = Date.now();

    while (true) {
      const result = await this.tryAcquire(options.command, staleTimeout);
      if (result.acquired) {
        return result;
      }

      // 檢查是否超時
      if (Date.now() - startTime >= timeout) {
        return {
          acquired: false,
          release: async () => {},
          holder: result.holder
        };
      }

      // 等待後重試
      await this.sleep(pollInterval);
    }
  }

  /**
   * 嘗試一次取得鎖（不等待）
   */
  async tryAcquire(command: string, staleTimeout: number = LOCK_DEFAULTS.STALE_TIMEOUT): Promise<LockResult> {
    // 確保鎖目錄存在
    await this.ensureLockDir();

    // 檢查現有鎖
    const existingLock = await this.readLockFile();

    if (existingLock) {
      // 檢查是否為 stale lock
      const isStale = await this.isLockStale(existingLock, staleTimeout);

      if (isStale) {
        // 清理 stale lock
        await this.removeLockFile();
      } else {
        // 鎖被其他 process 持有
        return {
          acquired: false,
          release: async () => {},
          holder: existingLock
        };
      }
    }

    // 嘗試建立鎖
    const lockInfo: LockInfo = {
      pid: process.pid,
      acquiredAt: Date.now(),
      command,
      projectPath: this.projectPath
    };

    const created = await this.createLockFile(lockInfo);

    if (created) {
      return {
        acquired: true,
        release: () => this.release(),
        staleLockCleared: existingLock !== null
      };
    }

    // 競爭失敗，重新讀取持有者資訊
    const currentHolder = await this.readLockFile();
    return {
      acquired: false,
      release: async () => {},
      holder: currentHolder ?? undefined
    };
  }

  /**
   * 釋放鎖
   */
  async release(): Promise<void> {
    const lockInfo = await this.readLockFile();

    // 只有持有者可以釋放鎖
    if (lockInfo && lockInfo.pid === process.pid) {
      await this.removeLockFile();
    }
  }

  /**
   * 強制清理鎖（僅用於測試或緊急情況）
   */
  async forceRelease(): Promise<void> {
    await this.removeLockFile();
  }

  /**
   * 計算專案路徑的 hash（SHA-256 前 16 字元）
   */
  private computeProjectHash(projectPath: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(projectPath);
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * 確保鎖目錄存在
   */
  private async ensureLockDir(): Promise<void> {
    try {
      await fs.mkdir(this.lockDir, { recursive: true });
    } catch (error) {
      // 目錄已存在是正常的
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 讀取鎖檔案
   */
  private async readLockFile(): Promise<LockInfo | null> {
    try {
      const content = await fs.readFile(this.lockFilePath, 'utf-8');
      return JSON.parse(content) as LockInfo;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * 建立鎖檔案（原子操作）
   */
  private async createLockFile(lockInfo: LockInfo): Promise<boolean> {
    try {
      // 使用 O_EXCL 確保原子建立（檔案已存在會失敗）
      const content = JSON.stringify(lockInfo, null, 2);
      await fs.writeFile(this.lockFilePath, content, { flag: 'wx' });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        return false;
      }
      throw error;
    }
  }

  /**
   * 移除鎖檔案
   */
  private async removeLockFile(): Promise<void> {
    try {
      await fs.unlink(this.lockFilePath);
    } catch (error) {
      // 檔案不存在是正常的
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 檢查鎖是否為 stale（持有者 process 不存在或超時）
   */
  private async isLockStale(lockInfo: LockInfo, staleTimeout: number): Promise<boolean> {
    // 1. 檢查時間是否超過 stale timeout
    const elapsed = Date.now() - lockInfo.acquiredAt;
    if (elapsed >= staleTimeout) {
      return true;
    }

    // 2. 檢查 PID 是否存活
    if (!this.isProcessAlive(lockInfo.pid)) {
      return true;
    }

    return false;
  }

  /**
   * 檢查 process 是否存活
   */
  private isProcessAlive(pid: number): boolean {
    try {
      // 發送 signal 0 不會實際殺死 process，但會檢查 process 是否存在
      process.kill(pid, 0);
      return true;
    } catch {
      // ESRCH: process 不存在
      // EPERM: 沒有權限（但 process 存在）
      return false;
    }
  }

  /**
   * 等待指定時間
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
