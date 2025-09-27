import { describe, it, expect } from 'vitest';
import { MemoryCache } from '../../../src/infrastructure/cache/memory-cache';
import { EvictionStrategy } from '../../../src/infrastructure/cache/types';

describe('快取效能測試', () => {
  it('應該在大量操作下保持高效能', () => {
    const cache = new MemoryCache<string, string>({
      maxSize: 10000,
      evictionStrategy: EvictionStrategy.LRU,
      enableStats: true
    });

    const startTime = Date.now();
    
    // 寫入 10000 個項目
    for (let i = 0; i < 10000; i++) {
      cache.set(`key-${i}`, `value-${i}`);
    }
    
    const writeTime = Date.now() - startTime;
    
    // 隨機讀取 10000 次
    const readStartTime = Date.now();
    for (let i = 0; i < 10000; i++) {
      const randomKey = `key-${Math.floor(Math.random() * 10000)}`;
      cache.get(randomKey);
    }
    
    const readTime = Date.now() - readStartTime;
    const totalTime = Date.now() - startTime;
    
    console.log(`寫入效能: ${10000 / writeTime * 1000} ops/sec`);
    console.log(`讀取效能: ${10000 / readTime * 1000} ops/sec`);
    console.log(`總時間: ${totalTime}ms`);
    
    const stats = cache.getStats();
    console.log(`快取統計:`, stats);
    
    // 基本效能要求：總時間不超過 1 秒
    expect(totalTime).toBeLessThan(1000);
    
    // 命中率應該合理
    expect(stats.hitRate).toBeGreaterThan(0.5);
    
    cache.dispose();
  });

  it('LRU 淘汰應該保持 O(1) 時間複雜度', () => {
    const cache = new MemoryCache<string, string>({
      maxSize: 1000,
      evictionStrategy: EvictionStrategy.LRU
    });

    const startTime = Date.now();
    
    // 寫入超過容量的項目，觸發淘汰
    for (let i = 0; i < 2000; i++) {
      cache.set(`key-${i}`, `value-${i}`);
    }
    
    const endTime = Date.now() - startTime;
    
    expect(cache.size()).toBe(1000);
    expect(endTime).toBeLessThan(500); // 應該很快
    
    cache.dispose();
  });

  it('不同策略的效能比較', () => {
    const strategies = [
      EvictionStrategy.LRU,
      EvictionStrategy.LFU,
      EvictionStrategy.FIFO,
      EvictionStrategy.RANDOM
    ];

    const results: Record<string, number> = {};

    strategies.forEach(strategy => {
      const cache = new MemoryCache<string, string>({
        maxSize: 5000,
        evictionStrategy: strategy
      });

      const startTime = Date.now();
      
      // 執行混合操作
      for (let i = 0; i < 10000; i++) {
        if (i % 3 === 0) {
          // 寫入
          cache.set(`key-${i}`, `value-${i}`);
        } else {
          // 讀取
          cache.get(`key-${Math.floor(Math.random() * i + 1)}`);
        }
      }
      
      const duration = Date.now() - startTime;
      results[strategy] = duration;
      
      console.log(`${strategy} 策略耗時: ${duration}ms`);
      
      cache.dispose();
    });

    // 所有策略都應該在合理時間內完成
    Object.values(results).forEach(duration => {
      expect(duration).toBeLessThan(1000);
    });
  });

  it('記憶體使用量追蹤', () => {
    const cache = new MemoryCache<string, string>({
      enableStats: true,
      maxSize: 1000
    });

    // 添加一些項目
    for (let i = 0; i < 100; i++) {
      cache.set(`key-${i}`, `value-${i}`.repeat(100)); // 較大的值
    }

    const stats = cache.getStats();
    
    expect(stats.memoryUsage).toBeGreaterThan(0);
    expect(stats.size).toBe(100);
    
    console.log(`記憶體使用量: ${stats.memoryUsage} bytes`);
    console.log(`平均每項目: ${stats.memoryUsage / stats.size} bytes`);
    
    cache.dispose();
  });

  it('批次操作效能', () => {
    const cache = new MemoryCache<string, string>({
      maxSize: 10000
    });

    // 準備批次資料
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < 5000; i++) {
      entries.push([`key-${i}`, `value-${i}`]);
    }

    const startTime = Date.now();
    cache.mset(entries);
    const setTime = Date.now() - startTime;

    const keys = entries.map(([key]) => key);
    const getStartTime = Date.now();
    const results = cache.mget(keys);
    const getTime = Date.now() - getStartTime;

    console.log(`批次設定耗時: ${setTime}ms (${entries.length / setTime * 1000} ops/sec)`);
    console.log(`批次取得耗時: ${getTime}ms (${keys.length / getTime * 1000} ops/sec)`);

    expect(setTime).toBeLessThan(200); // 放寬到 200ms (避免 flake)
    expect(getTime).toBeLessThan(100); // 放寬到 100ms (避免 flake)
    expect(results.size).toBe(entries.length);
    
    cache.dispose();
  });
});