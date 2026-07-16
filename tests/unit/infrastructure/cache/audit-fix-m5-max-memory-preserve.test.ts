/**
 * audit-fix M5 regression（先紅後綠）
 *
 * MemoryCache.set：同一 key 已有舊值時，若新 value 單筆超過 maxMemory，
 * 不得先 delete 舊值再拒絕寫入（應保留舊值或明確失敗且不丟舊值）。
 */

import { describe, it, expect, afterEach } from 'vitest';
import { MemoryCache } from '@infrastructure/cache/memory-cache.js';

describe('audit-fix M5：MemoryCache maxMemory 不得先刪後丟', () => {
  let cache: MemoryCache<string, string>;

  afterEach(() => {
    cache?.dispose();
  });

  it('M5：set 超大 value 被拒時，同 key 舊值必須仍可 get', () => {
    // maxMemory 很小：字串 length*2 計算 size
    cache = new MemoryCache<string, string>({
      maxSize: 10,
      maxMemory: 20, // 允許最多約 10 個 char
      enableStats: true
    });

    cache.set('k', 'ok'); // size = 4
    expect(cache.get('k')).toBe('ok');

    // 超大字串：遠超 maxMemory
    const huge = 'x'.repeat(100); // size = 200
    cache.set('k', huge);

    // Bug：set 先 delete(key) 再因 size>maxMemory return → 舊值被清掉
    expect(cache.get('k')).toBe('ok');
    expect(cache.has('k')).toBe(true);
  });
});
