import { describe, it, expect } from 'vitest';
import {
  deepClone,
  deepMerge,
  pick,
  omit,
  isEmpty,
  isEqual,
  set,
  get,
  has,
  mapValues
} from '../../../src/shared/utils/object';

describe('物件工具函式', () => {
  describe('deepClone', () => {
    it('應該深度複製物件', () => {
      const original = {
        name: 'Alice',
        age: 30,
        address: {
          city: 'New York',
          country: 'USA'
        },
        hobbies: ['reading', 'swimming']
      };

      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.address).not.toBe(original.address);
      expect(cloned.hobbies).not.toBe(original.hobbies);
    });

    it('應該處理陣列', () => {
      const original = [1, { a: 2 }, [3, 4]];
      const cloned = deepClone(original);

      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned[1]).not.toBe(original[1]);
      expect(cloned[2]).not.toBe(original[2]);
    });

    it('應該處理基本型別', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(true)).toBe(true);
      expect(deepClone(null)).toBe(null);
      expect(deepClone(undefined)).toBe(undefined);
    });

    it('應該處理日期和正則表達式', () => {
      const date = new Date('2023-01-01');
      const regex = /test/gi;

      expect(deepClone(date)).toEqual(date);
      expect(deepClone(date)).not.toBe(date);
      expect(deepClone(regex)).toEqual(regex);
      expect(deepClone(regex)).not.toBe(regex);
    });

    it('應該處理循環引用', () => {
      const obj: any = { name: 'test' };
      obj.self = obj;

      const cloned = deepClone(obj);
      expect(cloned.name).toBe('test');
      expect(cloned.self).toBe(cloned);
      expect(cloned).not.toBe(obj);
    });
  });

  describe('deepMerge', () => {
    it('應該深度合併物件', () => {
      const target = {
        a: 1,
        b: {
          c: 2,
          d: 3
        }
      };

      const source = {
        b: {
          d: 4,
          e: 5
        },
        f: 6
      };

      const result = deepMerge(target, source);

      expect(result).toEqual({
        a: 1,
        b: {
          c: 2,
          d: 4,
          e: 5
        },
        f: 6
      });
    });

    it('應該處理陣列合併', () => {
      const target = { arr: [1, 2] };
      const source = { arr: [3, 4] };

      const result = deepMerge(target, source);
      expect(result.arr).toEqual([3, 4]);
    });

    it('應該處理多個來源物件', () => {
      const result = deepMerge(
        { a: 1, b: { c: 2 } },
        { b: { d: 3 } },
        { b: { e: 4 }, f: 5 }
      );

      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 3, e: 4 },
        f: 5
      });
    });

    it('應該處理空物件', () => {
      expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
      expect(deepMerge({}, {})).toEqual({});
    });
  });

  describe('pick', () => {
    it('應該選取指定的屬性', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
      expect(pick(obj, ['b', 'd'])).toEqual({ b: 2, d: 4 });
    });

    it('應該處理不存在的屬性', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, ['a', 'c'] as any)).toEqual({ a: 1 });
    });

    it('應該處理空陣列', () => {
      const obj = { a: 1, b: 2 };
      expect(pick(obj, [])).toEqual({});
    });

    it('應該處理空物件', () => {
      expect(pick({}, ['a'] as any)).toEqual({});
    });
  });

  describe('omit', () => {
    it('應該排除指定的屬性', () => {
      const obj = { a: 1, b: 2, c: 3, d: 4 };
      expect(omit(obj, ['b', 'd'])).toEqual({ a: 1, c: 3 });
      expect(omit(obj, ['a', 'c'])).toEqual({ b: 2, d: 4 });
    });

    it('應該處理不存在的屬性', () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, ['c'] as any)).toEqual({ a: 1, b: 2 });
    });

    it('應該處理空陣列', () => {
      const obj = { a: 1, b: 2 };
      expect(omit(obj, [])).toEqual({ a: 1, b: 2 });
    });

    it('應該處理空物件', () => {
      expect(omit({}, ['a'] as any)).toEqual({});
    });
  });

  describe('isEmpty', () => {
    it('應該識別空值', () => {
      expect(isEmpty({})).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    it('應該識別非空值', () => {
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(false)).toBe(false);
    });

    it('應該處理 Map 和 Set', () => {
      expect(isEmpty(new Map())).toBe(true);
      expect(isEmpty(new Set())).toBe(true);
      expect(isEmpty(new Map([['a', 1]]))).toBe(false);
      expect(isEmpty(new Set([1]))).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('應該比較基本型別', () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual('hello', 'hello')).toBe(true);
      expect(isEqual(true, true)).toBe(true);
      expect(isEqual(null, null)).toBe(true);
      expect(isEqual(undefined, undefined)).toBe(true);

      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual('hello', 'world')).toBe(false);
      expect(isEqual(true, false)).toBe(false);
    });

    it('應該深度比較物件', () => {
      const obj1 = { a: 1, b: { c: 2 } };
      const obj2 = { a: 1, b: { c: 2 } };
      const obj3 = { a: 1, b: { c: 3 } };

      expect(isEqual(obj1, obj2)).toBe(true);
      expect(isEqual(obj1, obj3)).toBe(false);
    });

    it('應該比較陣列', () => {
      expect(isEqual([1, 2, 3], [1, 2, 3])).toBe(true);
      expect(isEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
      expect(isEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    });

    it('應該處理日期', () => {
      const date1 = new Date('2023-01-01');
      const date2 = new Date('2023-01-01');
      const date3 = new Date('2023-01-02');

      expect(isEqual(date1, date2)).toBe(true);
      expect(isEqual(date1, date3)).toBe(false);
    });
  });

  describe('set', () => {
    it('應該設定深層屬性', () => {
      const obj = {};
      set(obj, 'user.name', 'Alice');
      expect(obj).toEqual({ user: { name: 'Alice' } });

      set(obj, 'user.age', 30);
      expect(obj).toEqual({ user: { name: 'Alice', age: 30 } });
    });

    it('應該設定陣列索引', () => {
      const obj = {};
      set(obj, 'users[0].name', 'Alice');
      expect(obj).toEqual({ users: [{ name: 'Alice' }] });

      set(obj, 'users[1].name', 'Bob');
      expect(obj).toEqual({ users: [{ name: 'Alice' }, { name: 'Bob' }] });
    });

    it('應該覆蓋現有值', () => {
      const obj = { user: { name: 'Alice' } };
      set(obj, 'user.name', 'Bob');
      expect(obj).toEqual({ user: { name: 'Bob' } });
    });

    it('應該處理空路徑', () => {
      const obj = {};
      set(obj, '', 'value');
      expect(obj).toEqual({});
    });
  });

  describe('get', () => {
    it('應該取得深層屬性', () => {
      const obj = {
        user: {
          name: 'Alice',
          address: {
            city: 'New York'
          }
        },
        users: [
          { name: 'Bob' },
          { name: 'Charlie' }
        ]
      };

      expect(get(obj, 'user.name')).toBe('Alice');
      expect(get(obj, 'user.address.city')).toBe('New York');
      expect(get(obj, 'users[0].name')).toBe('Bob');
      expect(get(obj, 'users[1].name')).toBe('Charlie');
    });

    it('應該返回預設值', () => {
      const obj = { user: { name: 'Alice' } };

      expect(get(obj, 'user.age', 25)).toBe(25);
      expect(get(obj, 'admin.name', 'Admin')).toBe('Admin');
      expect(get(obj, 'nonexistent')).toBe(undefined);
    });

    it('應該處理空路徑', () => {
      const obj = { name: 'Alice' };
      expect(get(obj, '')).toBe(obj);
    });
  });

  describe('has', () => {
    it('應該檢查深層屬性是否存在', () => {
      const obj = {
        user: {
          name: 'Alice',
          address: {
            city: 'New York'
          }
        },
        users: [
          { name: 'Bob' }
        ]
      };

      expect(has(obj, 'user.name')).toBe(true);
      expect(has(obj, 'user.address.city')).toBe(true);
      expect(has(obj, 'users[0].name')).toBe(true);

      expect(has(obj, 'user.age')).toBe(false);
      expect(has(obj, 'admin.name')).toBe(false);
      expect(has(obj, 'users[1].name')).toBe(false);
    });

    it('應該處理空路徑', () => {
      const obj = { name: 'Alice' };
      expect(has(obj, '')).toBe(false);
    });
  });

  describe('mapValues', () => {
    it('應該映射物件的值', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = mapValues(obj, (value, key) => value * 2);

      expect(result).toEqual({ a: 2, b: 4, c: 6 });
    });

    it('應該傳遞鍵值給回調函式', () => {
      const obj = { first: 'Alice', last: 'Smith' };
      const result = mapValues(obj, (value, key) => `${key}: ${value}`);

      expect(result).toEqual({
        first: 'first: Alice',
        last: 'last: Smith'
      });
    });

    it('應該處理空物件', () => {
      const result = mapValues({}, value => value * 2);
      expect(result).toEqual({});
    });

    it('應該保持物件鍵不變', () => {
      const obj = { a: 1, b: 2 };
      const result = mapValues(obj, value => String(value));

      expect(Object.keys(result)).toEqual(['a', 'b']);
      expect(result).toEqual({ a: '1', b: '2' });
    });
  });
});