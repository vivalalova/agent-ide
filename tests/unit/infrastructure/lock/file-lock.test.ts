/**
 * FileLock 單元測試
 * 測試跨 Process 檔案鎖機制
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { FileLock, LOCK_DEFAULTS } from '@infrastructure/lock/index.js';

describe('FileLock', () => {
  let tempDir: string;
  let projectPath: string;

  beforeEach(async () => {
    // 建立唯一的臨時目錄作為模擬專案
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ide-lock-test-'));
    projectPath = tempDir;
  });

  afterEach(async () => {
    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理錯誤
    }

    // 清理鎖目錄中的測試鎖檔案
    const lockDir = path.join(os.homedir(), '.config', 'agent-ide', LOCK_DEFAULTS.LOCK_DIR);
    try {
      const files = await fs.readdir(lockDir);
      for (const file of files) {
        if (file.endsWith('.lock')) {
          try {
            await fs.unlink(path.join(lockDir, file));
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      // 目錄可能不存在
    }
  });

  // ==========================================================================
  // 基本功能
  // ==========================================================================

  describe('基本功能', () => {
    it('應該成功取得鎖', async () => {
      const lock = new FileLock(projectPath);
      const result = await lock.acquire({ command: 'test' });

      expect(result.acquired).toBe(true);
      expect(typeof result.release).toBe('function');

      await result.release();
    });

    it('應該在釋放後可以再次取得鎖', async () => {
      const lock = new FileLock(projectPath);

      // 第一次取得
      const result1 = await lock.acquire({ command: 'test1' });
      expect(result1.acquired).toBe(true);
      await result1.release();

      // 第二次取得
      const result2 = await lock.acquire({ command: 'test2' });
      expect(result2.acquired).toBe(true);
      await result2.release();
    });

    it('應該正確計算專案 hash（不同路徑產生不同 hash）', async () => {
      const lock1 = new FileLock('/path/to/project1');
      const lock2 = new FileLock('/path/to/project2');

      expect(lock1.lockFilePath).not.toBe(lock2.lockFilePath);
    });

    it('應該對相同路徑產生相同 hash', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      expect(lock1.lockFilePath).toBe(lock2.lockFilePath);
    });
  });

  // ==========================================================================
  // 競爭處理
  // ==========================================================================

  describe('競爭處理', () => {
    it('應該在鎖被持有時等待', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      // 第一個 lock 取得鎖
      const result1 = await lock1.acquire({ command: 'first' });
      expect(result1.acquired).toBe(true);

      // 第二個 lock 應該在等待後超時
      const result2 = await lock2.acquire({
        command: 'second',
        timeout: 200,
        pollInterval: 50
      });

      expect(result2.acquired).toBe(false);
      expect(result2.holder).toBeDefined();
      expect(result2.holder?.command).toBe('first');
      expect(result2.holder?.pid).toBe(process.pid);

      await result1.release();
    });

    it('應該在鎖被釋放後成功取得', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      // 第一個 lock 取得鎖
      const result1 = await lock1.acquire({ command: 'first' });
      expect(result1.acquired).toBe(true);

      // 啟動第二個 lock 的等待（在背景）
      const lock2Promise = lock2.acquire({
        command: 'second',
        timeout: 2000,
        pollInterval: 50
      });

      // 稍後釋放第一個鎖
      await new Promise(resolve => setTimeout(resolve, 100));
      await result1.release();

      // 第二個 lock 應該成功
      const result2 = await lock2Promise;
      expect(result2.acquired).toBe(true);

      await result2.release();
    });

    it('應該回傳持有者資訊當無法取得鎖', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      const result1 = await lock1.acquire({ command: 'holder-command' });

      const result2 = await lock2.tryAcquire('requester-command');

      expect(result2.acquired).toBe(false);
      expect(result2.holder).toBeDefined();
      expect(result2.holder?.command).toBe('holder-command');
      expect(result2.holder?.pid).toBe(process.pid);
      expect(result2.holder?.projectPath).toBe(path.resolve(projectPath));

      await result1.release();
    });
  });

  // ==========================================================================
  // Stale Lock 處理
  // ==========================================================================

  describe('Stale Lock 處理', () => {
    it('應該清理過期的鎖（超過 stale timeout）', async () => {
      const lock = new FileLock(projectPath);

      // 手動建立一個過期的鎖檔案
      const lockDir = path.join(os.homedir(), '.config', 'agent-ide', LOCK_DEFAULTS.LOCK_DIR);
      await fs.mkdir(lockDir, { recursive: true });

      const staleLockInfo = {
        pid: process.pid,
        acquiredAt: Date.now() - 400_000, // 400 秒前（超過預設 300 秒）
        command: 'stale-command',
        projectPath: path.resolve(projectPath)
      };
      await fs.writeFile(lock.lockFilePath, JSON.stringify(staleLockInfo));

      // 應該能夠清理 stale lock 並取得新鎖
      const result = await lock.acquire({ command: 'new-command' });

      expect(result.acquired).toBe(true);
      expect(result.staleLockCleared).toBe(true);

      await result.release();
    });

    it('應該清理不存在 PID 的鎖', async () => {
      const lock = new FileLock(projectPath);

      // 手動建立一個不存在 PID 的鎖檔案
      const lockDir = path.join(os.homedir(), '.config', 'agent-ide', LOCK_DEFAULTS.LOCK_DIR);
      await fs.mkdir(lockDir, { recursive: true });

      const deadPidLockInfo = {
        pid: 999999999, // 幾乎不可能存在的 PID
        acquiredAt: Date.now(),
        command: 'dead-process-command',
        projectPath: path.resolve(projectPath)
      };
      await fs.writeFile(lock.lockFilePath, JSON.stringify(deadPidLockInfo));

      // 應該能夠清理並取得新鎖
      const result = await lock.acquire({ command: 'new-command' });

      expect(result.acquired).toBe(true);
      expect(result.staleLockCleared).toBe(true);

      await result.release();
    });

    it('不應該清理有效的鎖', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      // 正常取得鎖
      const result1 = await lock1.acquire({ command: 'valid' });

      // 嘗試取得應該失敗（鎖是有效的）
      const result2 = await lock2.tryAcquire('challenger');

      expect(result2.acquired).toBe(false);
      expect(result2.staleLockCleared).toBeUndefined();

      await result1.release();
    });
  });

  // ==========================================================================
  // 強制釋放
  // ==========================================================================

  describe('強制釋放', () => {
    it('forceRelease 應該移除鎖檔案', async () => {
      const lock = new FileLock(projectPath);

      await lock.acquire({ command: 'test' });
      await lock.forceRelease();

      // 應該能夠立即取得新鎖
      const result = await lock.tryAcquire('new');
      expect(result.acquired).toBe(true);

      await result.release();
    });

    it('release 基於 PID 檢查持有者', async () => {
      // 註：同一 process 中的不同 FileLock 實例共享相同 PID
      // 因此在同一 process 中無法區分不同實例
      // 這個測試驗證 release 會檢查 PID
      const lock = new FileLock(projectPath);

      // 取得鎖
      const result = await lock.acquire({ command: 'owner' });
      expect(result.acquired).toBe(true);

      // 驗證持有者 PID 是當前 process
      const lockInfo = JSON.parse(
        await fs.readFile(lock.lockFilePath, 'utf-8')
      );
      expect(lockInfo.pid).toBe(process.pid);

      // 釋放鎖
      await result.release();

      // 確認鎖已被釋放
      const exists = await fs.access(lock.lockFilePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });

  // ==========================================================================
  // 超時處理
  // ==========================================================================

  describe('超時處理', () => {
    it('應該在超時後返回失敗', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      await lock1.acquire({ command: 'blocker' });

      const startTime = Date.now();
      const result = await lock2.acquire({
        command: 'waiter',
        timeout: 300,
        pollInterval: 50
      });
      const elapsed = Date.now() - startTime;

      expect(result.acquired).toBe(false);
      expect(elapsed).toBeGreaterThanOrEqual(250); // 允許一些誤差
      expect(elapsed).toBeLessThan(500);

      await lock1.release();
    });

    it('應該使用預設超時值', async () => {
      const lock = new FileLock(projectPath);

      // 驗證預設值已正確設定
      expect(LOCK_DEFAULTS.TIMEOUT).toBe(60_000);
      expect(LOCK_DEFAULTS.POLL_INTERVAL).toBe(100);
      expect(LOCK_DEFAULTS.STALE_TIMEOUT).toBe(300_000);

      const result = await lock.acquire({ command: 'test' });
      expect(result.acquired).toBe(true);
      await result.release();
    });
  });

  // ==========================================================================
  // 邊界情況
  // ==========================================================================

  describe('邊界情況', () => {
    it('應該處理鎖檔案被意外刪除的情況', async () => {
      const lock = new FileLock(projectPath);

      const result = await lock.acquire({ command: 'test' });
      expect(result.acquired).toBe(true);

      // 意外刪除鎖檔案
      await fs.unlink(lock.lockFilePath);

      // 釋放應該不會拋錯
      await expect(result.release()).resolves.not.toThrow();
    });

    it('應該處理多次釋放的情況', async () => {
      const lock = new FileLock(projectPath);

      const result = await lock.acquire({ command: 'test' });
      expect(result.acquired).toBe(true);

      // 第一次釋放
      await result.release();

      // 第二次釋放應該不會拋錯
      await expect(result.release()).resolves.not.toThrow();
    });

    it('forceRelease 應該處理不存在的鎖檔案', async () => {
      const lock = new FileLock(projectPath);

      // 在沒有鎖的情況下 forceRelease 不應該拋錯
      await expect(lock.forceRelease()).resolves.not.toThrow();
    });

    it('應該處理路徑包含空格的專案', async () => {
      const pathWithSpaces = path.join(tempDir, 'path with spaces');
      await fs.mkdir(pathWithSpaces, { recursive: true });

      const lock = new FileLock(pathWithSpaces);
      const result = await lock.acquire({ command: 'test' });

      expect(result.acquired).toBe(true);
      await result.release();
    });

    it('應該處理路徑包含中文的專案', async () => {
      const pathWithChinese = path.join(tempDir, '中文專案路徑');
      await fs.mkdir(pathWithChinese, { recursive: true });

      const lock = new FileLock(pathWithChinese);
      const result = await lock.acquire({ command: 'test' });

      expect(result.acquired).toBe(true);
      await result.release();
    });

    it('tryAcquire 應該不等待直接返回', async () => {
      const lock1 = new FileLock(projectPath);
      const lock2 = new FileLock(projectPath);

      await lock1.acquire({ command: 'blocker' });

      const startTime = Date.now();
      const result = await lock2.tryAcquire('challenger');
      const elapsed = Date.now() - startTime;

      expect(result.acquired).toBe(false);
      expect(elapsed).toBeLessThan(100); // 應該幾乎立即返回

      await lock1.release();
    });
  });

  // ==========================================================================
  // 多專案隔離
  // ==========================================================================

  describe('多專案隔離', () => {
    it('不同專案的鎖應該互相獨立', async () => {
      const project1 = path.join(tempDir, 'project1');
      const project2 = path.join(tempDir, 'project2');
      await fs.mkdir(project1, { recursive: true });
      await fs.mkdir(project2, { recursive: true });

      const lock1 = new FileLock(project1);
      const lock2 = new FileLock(project2);

      // 兩個專案應該能夠同時取得各自的鎖
      const result1 = await lock1.acquire({ command: 'project1-command' });
      const result2 = await lock2.acquire({ command: 'project2-command' });

      expect(result1.acquired).toBe(true);
      expect(result2.acquired).toBe(true);

      await result1.release();
      await result2.release();
    });
  });
});
