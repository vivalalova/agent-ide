import { describe, it, expect } from 'vitest';
import {
  chunk,
  flatten,
  unique,
  difference,
  intersection,
  partition,
  groupBy,
  sortBy,
  shuffle,
  compact
} from '../../../src/shared/utils/array';

describe('陣列工具函式', () => {
  describe('chunk', () => {
    it('應該將陣列分塊', () => {
      expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
      expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    });

    it('應該處理空陣列', () => {
      expect(chunk([], 2)).toEqual([]);
    });

    it('應該處理無效的塊大小', () => {
      expect(chunk([1, 2, 3], 0)).toEqual([]);
      expect(chunk([1, 2, 3], -1)).toEqual([]);
    });

    it('應該處理大於陣列長度的塊大小', () => {
      expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]]);
    });
  });

  describe('flatten', () => {
    it('應該扁平化一層巢狀陣列', () => {
      expect(flatten([1, [2, 3], 4, [5, 6]])).toEqual([1, 2, 3, 4, 5, 6]);
      expect(flatten([['a', 'b'], ['c', 'd']])).toEqual(['a', 'b', 'c', 'd']);
    });

    it('應該扁平化多層巢狀陣列', () => {
      expect(flatten([1, [2, [3, 4]], 5])).toEqual([1, 2, 3, 4, 5]);
      expect(flatten([[[1]], [2, [3]]])).toEqual([1, 2, 3]);
    });

    it('應該處理空陣列', () => {
      expect(flatten([])).toEqual([]);
      expect(flatten([[], []])).toEqual([]);
    });

    it('應該處理已經扁平的陣列', () => {
      expect(flatten([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    });
  });

  describe('unique', () => {
    it('應該移除重複元素', () => {
      expect(unique([1, 2, 2, 3, 3, 3, 4])).toEqual([1, 2, 3, 4]);
      expect(unique(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    });

    it('應該使用自定義比較函式', () => {
      const objects = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Alice' },
        { id: 3, name: 'Charlie' }
      ];
      expect(unique(objects, obj => obj.id)).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
        { id: 3, name: 'Charlie' }
      ]);
    });

    it('應該處理空陣列', () => {
      expect(unique([])).toEqual([]);
    });

    it('應該處理無重複元素的陣列', () => {
      expect(unique([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    });
  });

  describe('difference', () => {
    it('應該返回差集', () => {
      expect(difference([1, 2, 3, 4], [2, 4])).toEqual([1, 3]);
      expect(difference(['a', 'b', 'c', 'd'], ['b', 'd'])).toEqual(['a', 'c']);
    });

    it('應該處理空陣列', () => {
      expect(difference([], [1, 2])).toEqual([]);
      expect(difference([1, 2, 3], [])).toEqual([1, 2, 3]);
      expect(difference([], [])).toEqual([]);
    });

    it('應該處理沒有差異的情況', () => {
      expect(difference([1, 2], [1, 2, 3])).toEqual([]);
    });
  });

  describe('intersection', () => {
    it('應該返回交集', () => {
      expect(intersection([1, 2, 3, 4], [2, 3, 5, 6])).toEqual([2, 3]);
      expect(intersection(['a', 'b', 'c'], ['b', 'c', 'd'])).toEqual(['b', 'c']);
    });

    it('應該處理空陣列', () => {
      expect(intersection([], [1, 2])).toEqual([]);
      expect(intersection([1, 2], [])).toEqual([]);
      expect(intersection([], [])).toEqual([]);
    });

    it('應該處理沒有交集的情況', () => {
      expect(intersection([1, 2], [3, 4])).toEqual([]);
    });
  });

  describe('partition', () => {
    it('應該分區陣列', () => {
      const [even, odd] = partition([1, 2, 3, 4, 5, 6], x => x % 2 === 0);
      expect(even).toEqual([2, 4, 6]);
      expect(odd).toEqual([1, 3, 5]);
    });

    it('應該處理空陣列', () => {
      const [truthy, falsy] = partition([], x => !!x);
      expect(truthy).toEqual([]);
      expect(falsy).toEqual([]);
    });

    it('應該處理全部符合條件的情況', () => {
      const [positive, nonPositive] = partition([1, 2, 3], x => x > 0);
      expect(positive).toEqual([1, 2, 3]);
      expect(nonPositive).toEqual([]);
    });

    it('應該處理全部不符合條件的情況', () => {
      const [negative, nonNegative] = partition([1, 2, 3], x => x < 0);
      expect(negative).toEqual([]);
      expect(nonNegative).toEqual([1, 2, 3]);
    });
  });

  describe('groupBy', () => {
    it('應該依照鍵值分組', () => {
      expect(groupBy(['alice', 'bob', 'charlie', 'david'], name => name.length)).toEqual({
        3: ['bob'],
        5: ['alice', 'david'],
        7: ['charlie']
      });
    });

    it('應該處理物件陣列', () => {
      const people = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
        { name: 'Charlie', age: 25 }
      ];
      expect(groupBy(people, person => person.age)).toEqual({
        25: [
          { name: 'Alice', age: 25 },
          { name: 'Charlie', age: 25 }
        ],
        30: [{ name: 'Bob', age: 30 }]
      });
    });

    it('應該處理空陣列', () => {
      expect(groupBy([], x => x)).toEqual({});
    });
  });

  describe('sortBy', () => {
    it('應該依照回調函式排序', () => {
      expect(sortBy([3, 1, 4, 1, 5], x => x)).toEqual([1, 1, 3, 4, 5]);
      expect(sortBy(['apple', 'pie', 'a'], str => str.length)).toEqual(['a', 'pie', 'apple']);
    });

    it('應該處理物件陣列', () => {
      const people = [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Charlie', age: 35 }
      ];
      expect(sortBy(people, person => person.age)).toEqual([
        { name: 'Bob', age: 25 },
        { name: 'Alice', age: 30 },
        { name: 'Charlie', age: 35 }
      ]);
    });

    it('應該處理空陣列', () => {
      expect(sortBy([], x => x)).toEqual([]);
    });
  });

  describe('shuffle', () => {
    it('應該洗牌陣列', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = shuffle([...original]);

      // 檢查長度相同
      expect(shuffled).toHaveLength(original.length);

      // 檢查包含相同元素
      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('應該處理空陣列', () => {
      expect(shuffle([])).toEqual([]);
    });

    it('應該處理單元素陣列', () => {
      expect(shuffle([1])).toEqual([1]);
    });

    it('應該處理兩元素陣列', () => {
      const result = shuffle([1, 2]);
      expect(result).toHaveLength(2);
      expect(result).toContain(1);
      expect(result).toContain(2);
    });
  });

  describe('compact', () => {
    it('應該移除假值', () => {
      expect(compact([0, 1, false, 2, '', 3, null, 4, undefined, 5, NaN])).toEqual([1, 2, 3, 4, 5]);
      expect(compact(['', 'hello', 0, 'world', false])).toEqual(['hello', 'world']);
    });

    it('應該保留真值', () => {
      expect(compact([1, 2, 3, 'hello', true, {}])).toEqual([1, 2, 3, 'hello', true, {}]);
    });

    it('應該處理空陣列', () => {
      expect(compact([])).toEqual([]);
    });

    it('應該處理全部為假值的陣列', () => {
      expect(compact([null, undefined, false, 0, '', NaN])).toEqual([]);
    });
  });
});