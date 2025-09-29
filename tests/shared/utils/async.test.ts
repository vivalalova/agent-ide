import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sleep,
  retry,
  timeout,
  debounce,
  throttle,
  parallel,
  sequential,
  race,
  queue,
  batch
} from '../../../src/shared/utils/async';

describe('異步工具函式', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sleep', () => {
    it('應該延遲指定時間', async () => {
      const promise = sleep(1000);

      vi.advanceTimersByTime(500);
      expect(promise).not.toHaveProperty('resolved');

      vi.advanceTimersByTime(500);
      await expect(promise).resolves.toBeUndefined();
    });

    it('應該處理零延遲', async () => {
      const promise = sleep(0);
      vi.advanceTimersByTime(0);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('retry', () => {
    it('應該在成功時立即返回', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockResolvedValue('success');

      const result = await retry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('應該重試失敗的函式', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('second'))
        .mockResolvedValue('success');

      const result = await retry(fn, { maxAttempts: 3, delay: 10 }); // 使用較短的延遲
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('應該在達到最大重試次數後拋出錯誤', async () => {
      vi.useRealTimers();
      const error = new Error('persistent error');
      const fn = vi.fn().mockRejectedValue(error);

      await expect(retry(fn, { maxAttempts: 2, delay: 10 })).rejects.toThrow('persistent error');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('應該使用指數退避策略', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('first'))
        .mockRejectedValueOnce(new Error('second'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxAttempts: 3,
        delay: 10,
        exponentialBackoff: true
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('timeout', () => {
    it('應該在超時前返回結果', async () => {
      vi.useRealTimers();
      const fn = async () => {
        await sleep(10);
        return 'success';
      };

      const result = await timeout(fn(), 100);
      expect(result).toBe('success');
    });

    it('應該在超時後拋出錯誤', async () => {
      vi.useRealTimers();
      const fn = async () => {
        await sleep(100);
        return 'success';
      };

      await expect(timeout(fn(), 10)).rejects.toThrow('Operation timed out after 10ms');
    });

    it('應該使用自定義錯誤訊息', async () => {
      vi.useRealTimers();
      const fn = async () => {
        await sleep(100);
        return 'success';
      };

      await expect(timeout(fn(), 10, 'Custom timeout error')).rejects.toThrow('Custom timeout error');
    });
  });

  describe('debounce', () => {
    it('應該延遲執行函式', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('應該取消先前的執行', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn();
      vi.advanceTimersByTime(50);
      debouncedFn(); // 重置計時器

      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('應該傳遞最後一次調用的參數', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('third');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('應該支援立即執行', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 100, true);

      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(1);

      debouncedFn();
      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(1); // 後續調用被忽略

      vi.advanceTimersByTime(100);
      debouncedFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('throttle', () => {
    it('應該限制函式執行頻率', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1);

      throttledFn();
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(1); // 被限制

      vi.advanceTimersByTime(100);
      throttledFn();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('應該傳遞第一次調用的參數', () => {
      const fn = vi.fn();
      const throttledFn = throttle(fn, 100);

      throttledFn('first');
      throttledFn('second');
      throttledFn('third');

      expect(fn).toHaveBeenCalledWith('first');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('parallel', () => {
    it('應該並行執行所有任務', async () => {
      vi.useRealTimers(); // 使用真實計時器以測試並行執行

      const task1 = () => sleep(100).then(() => 'task1');
      const task2 = () => sleep(150).then(() => 'task2');
      const task3 = () => sleep(50).then(() => 'task3');

      const start = Date.now();
      const results = await parallel([task1, task2, task3]);
      const duration = Date.now() - start;

      expect(results).toEqual(['task1', 'task2', 'task3']);
      expect(duration).toBeLessThan(200); // 應該接近最長任務的時間
    });

    it('應該處理空陣列', async () => {
      const results = await parallel([]);
      expect(results).toEqual([]);
    });

    it('應該在任何任務失敗時拋出錯誤', async () => {
      const task1 = () => Promise.resolve('success');
      const task2 = () => Promise.reject(new Error('failed'));
      const task3 = () => Promise.resolve('success');

      await expect(parallel([task1, task2, task3])).rejects.toThrow('failed');
    });
  });

  describe('sequential', () => {
    it('應該順序執行所有任務', async () => {
      vi.useRealTimers();

      const results: string[] = [];
      const task1 = () => sleep(50).then(() => { results.push('task1'); return 'task1'; });
      const task2 = () => sleep(50).then(() => { results.push('task2'); return 'task2'; });
      const task3 = () => sleep(50).then(() => { results.push('task3'); return 'task3'; });

      const start = Date.now();
      const finalResults = await sequential([task1, task2, task3]);
      const duration = Date.now() - start;

      expect(finalResults).toEqual(['task1', 'task2', 'task3']);
      expect(results).toEqual(['task1', 'task2', 'task3']); // 確保順序執行
      expect(duration).toBeGreaterThan(140); // 應該接近所有任務時間的總和
    });

    it('應該處理空陣列', async () => {
      const results = await sequential([]);
      expect(results).toEqual([]);
    });

    it('應該在任務失敗時停止執行', async () => {
      const task1 = vi.fn(() => Promise.resolve('task1'));
      const task2 = vi.fn(() => Promise.reject(new Error('failed')));
      const task3 = vi.fn(() => Promise.resolve('task3'));

      await expect(sequential([task1, task2, task3])).rejects.toThrow('failed');

      expect(task1).toHaveBeenCalled();
      expect(task2).toHaveBeenCalled();
      expect(task3).not.toHaveBeenCalled(); // 不應執行後續任務
    });
  });

  describe('race', () => {
    it('應該返回最快完成的任務結果', async () => {
      vi.useRealTimers();

      const task1 = () => sleep(100).then(() => 'task1');
      const task2 = () => sleep(50).then(() => 'task2');
      const task3 = () => sleep(150).then(() => 'task3');

      const result = await race([task1, task2, task3]);
      expect(result).toBe('task2');
    });

    it('應該處理空陣列', async () => {
      const result = await race([]);
      expect(result).toBeUndefined();
    });

    it('應該在最快任務失敗時拋出錯誤', async () => {
      vi.useRealTimers();

      const task1 = () => sleep(100).then(() => 'task1');
      const task2 = () => sleep(50).then(() => Promise.reject(new Error('failed')));

      await expect(race([task1, task2])).rejects.toThrow('failed');
    });
  });

  describe('queue', () => {
    it('應該限制並行數量', async () => {
      vi.useRealTimers();

      let activeCount = 0;
      let maxActiveCount = 0;

      const createTask = (id: number) => async () => {
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);
        await sleep(50);
        activeCount--;
        return `task${id}`;
      };

      const tasks = Array.from({ length: 5 }, (_, i) => createTask(i + 1));
      const results = await queue(tasks, 2); // 最多並行 2 個

      expect(results).toEqual(['task1', 'task2', 'task3', 'task4', 'task5']);
      expect(maxActiveCount).toBe(2);
    });

    it('應該處理空陣列', async () => {
      const results = await queue([], 2);
      expect(results).toEqual([]);
    });

    it('應該處理單個任務', async () => {
      const task = () => Promise.resolve('single');
      const results = await queue([task], 2);
      expect(results).toEqual(['single']);
    });
  });

  describe('batch', () => {
    it('應該分批處理任務', async () => {
      vi.useRealTimers();

      let processedBatches = 0;
      const processor = async (items: number[]) => {
        processedBatches++;
        return items.map(x => x * 2);
      };

      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = await batch(items, processor, { batchSize: 3 });

      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      expect(processedBatches).toBe(4); // 3 + 3 + 3 + 1
    });

    it('應該支援並行批次處理', async () => {
      vi.useRealTimers();

      const processor = async (items: number[]) => {
        await sleep(50);
        return items.map(x => x * 2);
      };

      const items = [1, 2, 3, 4, 5, 6];
      const start = Date.now();
      const results = await batch(items, processor, {
        batchSize: 2,
        concurrency: 2
      });
      const duration = Date.now() - start;

      expect(results).toEqual([2, 4, 6, 8, 10, 12]);
      expect(duration).toBeLessThan(200); // 兩個批次並行，應該比順序快
    });

    it('應該處理空陣列', async () => {
      const processor = async (items: number[]) => items;
      const results = await batch([], processor, { batchSize: 3 });
      expect(results).toEqual([]);
    });

    it('應該處理小於批次大小的項目', async () => {
      const processor = async (items: number[]) => items.map(x => x * 2);
      const results = await batch([1, 2], processor, { batchSize: 5 });
      expect(results).toEqual([2, 4]);
    });
  });
});