/**
 * audit-fix C7 regression（先紅後綠）
 *
 * getTransitiveDependencies 回傳陣列若與 cache 共享同一 reference，
 * 呼叫端 mutate 會污染 cache，後續查詢拿到被改過的內容。
 *
 * 現行：首次計算後 `setCacheWithEviction(..., result); return result;`
 * 回傳的就是 cache 內同一陣列（cache 命中時才 `[...cached]` 拷貝）。
 */
import { describe, expect, it } from 'vitest';
import { DependencyGraph } from '@core/foundations/dependency-graph/index.js';

describe('audit-fix C7：getTransitiveDependencies 回傳值 mutate 不得污染 cache', () => {
  it('第一次回傳陣列被 push 後，第二次查詢不得看到污染項目', () => {
    const graph = new DependencyGraph();
    graph.addNode('/a.ts');
    graph.addNode('/b.ts');
    graph.addNode('/c.ts');
    graph.addDependency('/a.ts', '/b.ts');
    graph.addDependency('/b.ts', '/c.ts');

    const first = graph.getTransitiveDependencies('/a.ts');
    expect(first).toEqual(expect.arrayContaining(['/b.ts', '/c.ts']));
    expect(first).toHaveLength(2);

    // 呼叫端誤 mutate
    first.push('/evil-pollution.ts');

    const second = graph.getTransitiveDependencies('/a.ts');
    expect(second).not.toContain('/evil-pollution.ts');
    expect(second).toEqual(expect.arrayContaining(['/b.ts', '/c.ts']));
    expect(second).toHaveLength(2);
  });

  it('回傳陣列與後續查詢結果不得是同一 reference（防共享）', () => {
    const graph = new DependencyGraph();
    graph.addNode('/x.ts');
    graph.addNode('/y.ts');
    graph.addDependency('/x.ts', '/y.ts');

    const a = graph.getTransitiveDependencies('/x.ts');
    const b = graph.getTransitiveDependencies('/x.ts');

    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
