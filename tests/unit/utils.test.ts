/**
 * Shared Utils 單元測試
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Path utilities
import {
  isAbsolute,
  normalize,
  relative,
  changeExtension,
  ensureExtension,
  getFileNameWithoutExt,
  isSubPath,
  toUnixPath,
  toWindowsPath
} from '@shared/utils/path.js';

// Object utilities
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
} from '@shared/utils/object.js';

// String utilities
import {
  capitalize,
  camelCase,
  snakeCase,
  kebabCase,
  truncate,
  padStart,
  padEnd,
  stripIndent,
  escapeRegExp,
  template,
  slugify
} from '@shared/utils/string.js';

// Array utilities
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
} from '@shared/utils/array.js';

// Async utilities
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
} from '@shared/utils/async.js';

// Memory monitor
import {
  MemoryMonitor,
  getFormattedMemoryReport,
  withMemoryMonitoring,
  type Disposable
} from '@shared/utils/memory-monitor.js';

// ============================================
// Path Utilities Tests
// ============================================

describe('Path Utilities', () => {
  describe('isAbsolute', () => {
    it('should return true for Unix absolute paths', () => {
      expect(isAbsolute('/home/user')).toBe(true);
      expect(isAbsolute('/etc/config')).toBe(true);
      expect(isAbsolute('/')).toBe(true);
    });

    it('should return true for Windows absolute paths', () => {
      expect(isAbsolute('C:\\')).toBe(true);
      expect(isAbsolute('C:/Users')).toBe(true);
      expect(isAbsolute('D:\\Projects')).toBe(true);
      expect(isAbsolute('z:/data')).toBe(true);
    });

    it('should return false for relative paths', () => {
      expect(isAbsolute('src/index.ts')).toBe(false);
      expect(isAbsolute('./test')).toBe(false);
      expect(isAbsolute('../parent')).toBe(false);
      expect(isAbsolute('file.txt')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isAbsolute('')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize backslashes to forward slashes', () => {
      expect(normalize('src\\utils\\path.ts')).toBe('src/utils/path.ts');
    });

    it('should remove multiple consecutive slashes', () => {
      expect(normalize('src//utils///path.ts')).toBe('src/utils/path.ts');
    });

    it('should resolve dot segments', () => {
      expect(normalize('src/./utils/path.ts')).toBe('src/utils/path.ts');
      expect(normalize('src/utils/../core/index.ts')).toBe('src/core/index.ts');
    });

    it('should handle root directory', () => {
      expect(normalize('/home/../etc')).toBe('/etc');
      expect(normalize('/')).toBe('/');
    });

    it('should handle relative paths with ..', () => {
      expect(normalize('../parent/file.ts')).toBe('../parent/file.ts');
      expect(normalize('../../deep/path')).toBe('../../deep/path');
    });

    it('should return . for empty relative path', () => {
      expect(normalize('./.')).toBe('.');
      expect(normalize('')).toBe('');
    });
  });

  describe('relative', () => {
    it('should calculate relative path between directories', () => {
      expect(relative('/home/user/project', '/home/user/project/src')).toBe('src');
      expect(relative('/home/user/project/src', '/home/user/project')).toBe('..');
    });

    it('should handle sibling directories', () => {
      expect(relative('/home/user/project/src', '/home/user/project/tests')).toBe('../tests');
    });

    it('should return . for same path', () => {
      expect(relative('/home/user', '/home/user')).toBe('.');
    });

    it('should handle completely different paths', () => {
      expect(relative('/home/user', '/var/log')).toBe('../../var/log');
    });
  });

  describe('changeExtension', () => {
    it('should change file extension', () => {
      expect(changeExtension('file.ts', '.js')).toBe('file.js');
      expect(changeExtension('path/to/file.tsx', '.jsx')).toBe('path/to/file.jsx');
    });

    it('should add extension to file without one', () => {
      expect(changeExtension('file', '.ts')).toBe('file.ts');
      expect(changeExtension('path/to/file', '.js')).toBe('path/to/file.js');
    });

    it('should handle dot in directory name', () => {
      expect(changeExtension('path.dir/file', '.ts')).toBe('path.dir/file.ts');
    });

    it('should return empty string for empty input', () => {
      expect(changeExtension('', '.ts')).toBe('');
    });
  });

  describe('ensureExtension', () => {
    it('should add extension if missing', () => {
      expect(ensureExtension('file', '.ts')).toBe('file.ts');
    });

    it('should not change if already has extension', () => {
      expect(ensureExtension('file.ts', '.ts')).toBe('file.ts');
      expect(ensureExtension('file.js', '.ts')).toBe('file.js');
    });

    it('should return empty string for empty input', () => {
      expect(ensureExtension('', '.ts')).toBe('');
    });
  });

  describe('getFileNameWithoutExt', () => {
    it('should return filename without extension', () => {
      expect(getFileNameWithoutExt('file.ts')).toBe('file');
      expect(getFileNameWithoutExt('path/to/file.tsx')).toBe('file');
    });

    it('should handle hidden files', () => {
      expect(getFileNameWithoutExt('.gitignore')).toBe('.gitignore');
      expect(getFileNameWithoutExt('.eslintrc.json')).toBe('.eslintrc');
    });

    it('should handle files without extension', () => {
      expect(getFileNameWithoutExt('Makefile')).toBe('Makefile');
    });

    it('should return empty string for empty input', () => {
      expect(getFileNameWithoutExt('')).toBe('');
    });
  });

  describe('isSubPath', () => {
    it('should return true for child paths', () => {
      expect(isSubPath('/home/user', '/home/user/project')).toBe(true);
      expect(isSubPath('/home/user/', '/home/user/project/src')).toBe(true);
    });

    it('should return true for same path', () => {
      expect(isSubPath('/home/user', '/home/user')).toBe(true);
    });

    it('should return false for non-child paths', () => {
      expect(isSubPath('/home/user', '/home/other')).toBe(false);
      expect(isSubPath('/src', '/source')).toBe(false);
    });

    it('should return false for empty paths', () => {
      expect(isSubPath('', '/home')).toBe(false);
      expect(isSubPath('/home', '')).toBe(false);
    });
  });

  describe('toUnixPath', () => {
    it('should convert backslashes to forward slashes', () => {
      expect(toUnixPath('C:\\Users\\name')).toBe('C:/Users/name');
    });

    it('should return empty string for empty input', () => {
      expect(toUnixPath('')).toBe('');
    });
  });

  describe('toWindowsPath', () => {
    it('should convert forward slashes to backslashes', () => {
      expect(toWindowsPath('/home/user')).toBe('\\home\\user');
    });

    it('should return empty string for empty input', () => {
      expect(toWindowsPath('')).toBe('');
    });
  });
});

// ============================================
// Object Utilities Tests
// ============================================

describe('Object Utilities', () => {
  describe('deepClone', () => {
    it('should clone primitive values', () => {
      expect(deepClone(42)).toBe(42);
      expect(deepClone('hello')).toBe('hello');
      expect(deepClone(null)).toBe(null);
    });

    it('should clone arrays', () => {
      const arr = [1, 2, [3, 4]];
      const cloned = deepClone(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
      expect(cloned[2]).not.toBe(arr[2]);
    });

    it('should clone objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = deepClone(obj);
      expect(cloned).toEqual(obj);
      expect(cloned).not.toBe(obj);
      expect(cloned.b).not.toBe(obj.b);
    });

    it('should clone Date objects', () => {
      const date = new Date('2024-01-01');
      const cloned = deepClone(date);
      expect(cloned).toEqual(date);
      expect(cloned).not.toBe(date);
    });

    it('should clone RegExp objects', () => {
      const regex = /test/gi;
      const cloned = deepClone(regex);
      expect(cloned.source).toBe(regex.source);
      expect(cloned.flags).toBe(regex.flags);
      expect(cloned).not.toBe(regex);
    });

    it('should handle circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      const cloned = deepClone(obj);
      expect(cloned.a).toBe(1);
      expect(cloned.self).toBe(cloned);
    });
  });

  describe('deepMerge', () => {
    it('should merge objects deeply', () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 }, e: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 });
    });

    it('should return target when no sources', () => {
      const target = { a: 1 };
      expect(deepMerge(target)).toEqual(target);
    });

    it('should handle multiple sources', () => {
      const result = deepMerge({ a: 1 }, { b: 2 }, { c: 3 });
      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 });
    });

    it('should ignore missing keys', () => {
      const obj = { a: 1 };
      expect(pick(obj, ['a', 'b' as keyof typeof obj])).toEqual({ a: 1 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 });
    });
  });

  describe('isEmpty', () => {
    it('should return true for null/undefined', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
    });

    it('should return true for empty string/array', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
    });

    it('should return true for empty Map/Set', () => {
      expect(isEmpty(new Map())).toBe(true);
      expect(isEmpty(new Set())).toBe(true);
    });

    it('should return true for empty object', () => {
      expect(isEmpty({})).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty(new Map([['a', 1]]))).toBe(false);
      expect(isEmpty(new Set([1]))).toBe(false);
    });

    it('should return false for non-object primitives', () => {
      expect(isEmpty(0)).toBe(false);
      expect(isEmpty(false)).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('should compare primitives', () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual('a', 'a')).toBe(true);
      expect(isEqual(1, 2)).toBe(false);
    });

    it('should compare arrays', () => {
      expect(isEqual([1, 2], [1, 2])).toBe(true);
      expect(isEqual([1, 2], [1, 3])).toBe(false);
      expect(isEqual([1], [1, 2])).toBe(false);
    });

    it('should compare objects', () => {
      expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(isEqual({ a: 1 }, { b: 1 })).toBe(false);
    });

    it('should compare Date objects', () => {
      expect(isEqual(new Date('2024-01-01'), new Date('2024-01-01'))).toBe(true);
      expect(isEqual(new Date('2024-01-01'), new Date('2024-01-02'))).toBe(false);
    });

    it('should compare RegExp objects', () => {
      expect(isEqual(/test/gi, /test/gi)).toBe(true);
      expect(isEqual(/test/g, /test/i)).toBe(false);
    });

    it('should handle null values', () => {
      expect(isEqual(null, null)).toBe(true);
      expect(isEqual(null, undefined)).toBe(false);
    });

    it('should handle different types', () => {
      expect(isEqual(1, '1')).toBe(false);
    });
  });

  describe('set', () => {
    it('should set nested property', () => {
      const obj: any = {};
      set(obj, 'a.b.c', 1);
      expect(obj.a.b.c).toBe(1);
    });

    it('should set array index', () => {
      const obj: any = {};
      set(obj, 'arr[0]', 'first');
      expect(obj.arr[0]).toBe('first');
    });

    it('should do nothing for empty path', () => {
      const obj = { a: 1 };
      set(obj, '', 2);
      expect(obj).toEqual({ a: 1 });
    });
  });

  describe('get', () => {
    it('should get nested property', () => {
      const obj = { a: { b: { c: 1 } } };
      expect(get(obj, 'a.b.c')).toBe(1);
    });

    it('should return default value for missing path', () => {
      const obj = { a: 1 };
      expect(get(obj, 'b.c', 'default')).toBe('default');
    });

    it('should return object for empty path', () => {
      const obj = { a: 1 };
      expect(get(obj, '')).toEqual({ a: 1 });
    });
  });

  describe('has', () => {
    it('should return true for existing path', () => {
      const obj = { a: { b: 1 } };
      expect(has(obj, 'a.b')).toBe(true);
    });

    it('should return false for missing path', () => {
      const obj = { a: 1 };
      expect(has(obj, 'b')).toBe(false);
    });

    it('should return false for empty path', () => {
      expect(has({}, '')).toBe(false);
    });
  });

  describe('mapValues', () => {
    it('should map object values', () => {
      const obj = { a: 1, b: 2 };
      const result = mapValues(obj, (v) => v * 2);
      expect(result).toEqual({ a: 2, b: 4 });
    });

    it('should pass key as second argument', () => {
      const obj = { a: 1, b: 2 };
      const result = mapValues(obj, (v, k) => `${k}:${v}`);
      expect(result).toEqual({ a: 'a:1', b: 'b:2' });
    });
  });
});

// ============================================
// String Utilities Tests
// ============================================

describe('String Utilities', () => {
  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('HELLO');
    });

    it('should return empty string for empty input', () => {
      expect(capitalize('')).toBe('');
    });
  });

  describe('camelCase', () => {
    it('should convert to camelCase', () => {
      expect(camelCase('hello world')).toBe('helloWorld');
      expect(camelCase('hello-world')).toBe('helloWorld');
      expect(camelCase('hello_world')).toBe('helloWorld');
      expect(camelCase('HelloWorld')).toBe('helloWorld');
    });

    it('should return empty string for empty input', () => {
      expect(camelCase('')).toBe('');
    });
  });

  describe('snakeCase', () => {
    it('should convert to snake_case', () => {
      expect(snakeCase('helloWorld')).toBe('hello_world');
      expect(snakeCase('HelloWorld')).toBe('hello_world');
      expect(snakeCase('hello-world')).toBe('hello_world');
      expect(snakeCase('XMLParser')).toBe('xml_parser');
    });

    it('should return empty string for empty input', () => {
      expect(snakeCase('')).toBe('');
    });
  });

  describe('kebabCase', () => {
    it('should convert to kebab-case', () => {
      expect(kebabCase('helloWorld')).toBe('hello-world');
      expect(kebabCase('HelloWorld')).toBe('hello-world');
      expect(kebabCase('hello_world')).toBe('hello-world');
    });

    it('should return empty string for empty input', () => {
      expect(kebabCase('')).toBe('');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 5)).toBe('hello...');
      expect(truncate('hello world', 5, '…')).toBe('hello…');
    });

    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should return ellipsis for length <= 0', () => {
      expect(truncate('hello', 0)).toBe('...');
    });

    it('should return empty string for empty input', () => {
      expect(truncate('', 10)).toBe('');
    });
  });

  describe('padStart', () => {
    it('should pad at start', () => {
      expect(padStart('5', 3, '0')).toBe('005');
    });

    it('should not pad if already long enough', () => {
      expect(padStart('hello', 3)).toBe('hello');
    });

    it('should handle empty string with padding', () => {
      expect(padStart('', 3, '0')).toBe('000');
    });
  });

  describe('padEnd', () => {
    it('should pad at end', () => {
      expect(padEnd('5', 3, '0')).toBe('500');
    });

    it('should not pad if already long enough', () => {
      expect(padEnd('hello', 3)).toBe('hello');
    });

    it('should handle empty string with padding', () => {
      expect(padEnd('', 3, '0')).toBe('000');
    });
  });

  describe('stripIndent', () => {
    it('should strip common indent', () => {
      const input = `
        line1
        line2
      `;
      expect(stripIndent(input)).toBe('line1\nline2');
    });

    it('should return empty string for empty input', () => {
      expect(stripIndent('')).toBe('');
    });

    it('should handle string with only whitespace', () => {
      expect(stripIndent('   \n   \n   ')).toBe('');
    });
  });

  describe('escapeRegExp', () => {
    it('should escape special characters', () => {
      expect(escapeRegExp('hello.world')).toBe('hello\\.world');
      expect(escapeRegExp('[a-z]+')).toBe('\\[a-z\\]\\+');
    });

    it('should return empty string for empty input', () => {
      expect(escapeRegExp('')).toBe('');
    });
  });

  describe('template', () => {
    it('should replace placeholders', () => {
      expect(template('Hello, {{name}}!', { name: 'World' })).toBe('Hello, World!');
    });

    it('should handle nested properties', () => {
      expect(template('{{user.name}}', { user: { name: 'John' } })).toBe('John');
    });

    it('should keep placeholder if not found', () => {
      expect(template('{{missing}}', {})).toBe('{{missing}}');
    });

    it('should return empty string for empty input', () => {
      expect(template('', {})).toBe('');
    });
  });

  describe('slugify', () => {
    it('should create URL-friendly string', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Hello   World')).toBe('hello-world');
      expect(slugify('Hello, World!')).toBe('hello-world');
    });

    it('should preserve Chinese characters', () => {
      expect(slugify('測試 Test')).toBe('測試-test');
    });

    it('should return empty string for empty input', () => {
      expect(slugify('')).toBe('');
    });
  });
});

// ============================================
// Array Utilities Tests
// ============================================

describe('Array Utilities', () => {
  describe('chunk', () => {
    it('should split array into chunks', () => {
      expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should return empty array for empty input', () => {
      expect(chunk([], 2)).toEqual([]);
    });

    it('should return empty array for size <= 0', () => {
      expect(chunk([1, 2, 3], 0)).toEqual([]);
    });
  });

  describe('flatten', () => {
    it('should flatten nested arrays', () => {
      expect(flatten([1, [2, [3, [4]]]])).toEqual([1, 2, 3, 4]);
    });

    it('should return same for flat array', () => {
      expect(flatten([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates', () => {
      expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    });

    it('should use key function', () => {
      const arr = [{ id: 1 }, { id: 2 }, { id: 1 }];
      expect(unique(arr, (x) => x.id)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('should return empty array for empty input', () => {
      expect(unique([])).toEqual([]);
    });
  });

  describe('difference', () => {
    it('should return difference of two arrays', () => {
      expect(difference([1, 2, 3], [2, 3])).toEqual([1]);
    });

    it('should return copy of first array if second is empty', () => {
      expect(difference([1, 2, 3], [])).toEqual([1, 2, 3]);
    });

    it('should return empty array if first is empty', () => {
      expect(difference([], [1, 2])).toEqual([]);
    });
  });

  describe('intersection', () => {
    it('should return common elements', () => {
      expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    });

    it('should return empty array if no common elements', () => {
      expect(intersection([1, 2], [3, 4])).toEqual([]);
    });

    it('should return empty array if either is empty', () => {
      expect(intersection([], [1, 2])).toEqual([]);
      expect(intersection([1, 2], [])).toEqual([]);
    });
  });

  describe('partition', () => {
    it('should partition array by predicate', () => {
      expect(partition([1, 2, 3, 4], (x) => x % 2 === 0)).toEqual([[2, 4], [1, 3]]);
    });
  });

  describe('groupBy', () => {
    it('should group by key function', () => {
      const arr = [{ type: 'a', val: 1 }, { type: 'b', val: 2 }, { type: 'a', val: 3 }];
      expect(groupBy(arr, (x) => x.type)).toEqual({
        a: [{ type: 'a', val: 1 }, { type: 'a', val: 3 }],
        b: [{ type: 'b', val: 2 }]
      });
    });
  });

  describe('sortBy', () => {
    it('should sort by key function', () => {
      const arr = [{ name: 'c' }, { name: 'a' }, { name: 'b' }];
      expect(sortBy(arr, (x) => x.name)).toEqual([{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
    });

    it('should not mutate original array', () => {
      const arr = [3, 1, 2];
      sortBy(arr, (x) => x);
      expect(arr).toEqual([3, 1, 2]);
    });
  });

  describe('shuffle', () => {
    it('should return array with same elements', () => {
      const arr = [1, 2, 3, 4, 5];
      const shuffled = shuffle(arr);
      expect(shuffled.sort()).toEqual(arr.sort());
    });

    it('should not mutate original array', () => {
      const arr = [1, 2, 3];
      shuffle(arr);
      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe('compact', () => {
    it('should remove falsy values', () => {
      expect(compact([0, 1, false, 2, '', 3, null, undefined, NaN])).toEqual([1, 2, 3]);
    });
  });
});

// ============================================
// Async Utilities Tests
// ============================================

describe('Async Utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sleep', () => {
    it('should delay execution', async () => {
      const promise = sleep(100);
      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe('retry', () => {
    it('should succeed on first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn, { maxAttempts: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const result = await retry(fn, { maxAttempts: 3, delay: 1 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max attempts', async () => {
      vi.useRealTimers();
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(retry(fn, { maxAttempts: 2, delay: 1 })).rejects.toThrow('fail');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should respect shouldRetry option', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fatal'));
      await expect(retry(fn, {
        maxAttempts: 3,
        shouldRetry: () => false
      })).rejects.toThrow('fatal');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff', async () => {
      vi.useRealTimers();
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');
      const start = Date.now();
      await retry(fn, { maxAttempts: 3, delay: 10, exponentialBackoff: true });
      const elapsed = Date.now() - start;
      // First retry: 10ms, second retry: 20ms, total ~30ms
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });
  });

  describe('timeout', () => {
    it('should resolve if within timeout', async () => {
      const promise = Promise.resolve('success');
      await expect(timeout(promise, 100)).resolves.toBe('success');
    });

    it('should reject if timeout exceeded', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 200));
      const timeoutPromise = timeout(promise, 100);
      vi.advanceTimersByTime(100);
      await expect(timeoutPromise).rejects.toThrow('timed out');
    });

    it('should use custom error message', async () => {
      const promise = new Promise((resolve) => setTimeout(resolve, 200));
      const timeoutPromise = timeout(promise, 100, 'Custom timeout');
      vi.advanceTimersByTime(100);
      await expect(timeoutPromise).rejects.toThrow('Custom timeout');
    });
  });

  describe('debounce', () => {
    it('should debounce calls', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call immediately if immediate is true', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100, true);

      debounced();
      expect(fn).toHaveBeenCalledTimes(1);

      debounced();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('throttle', () => {
    it('should throttle calls', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      throttled();
      throttled();
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);
      throttled();
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('parallel', () => {
    it('should execute tasks in parallel', async () => {
      vi.useRealTimers();
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3)
      ];
      const results = await parallel(tasks);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should return empty array for empty input', async () => {
      expect(await parallel([])).toEqual([]);
    });
  });

  describe('sequential', () => {
    it('should execute tasks sequentially', async () => {
      vi.useRealTimers();
      const order: number[] = [];
      const tasks = [1, 2, 3].map((n) => async () => {
        order.push(n);
        return n;
      });
      const results = await sequential(tasks);
      expect(results).toEqual([1, 2, 3]);
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('race', () => {
    it('should return first resolved value', async () => {
      vi.useRealTimers();
      const tasks = [
        () => new Promise<number>((r) => setTimeout(() => r(1), 10)),
        () => Promise.resolve(2)
      ];
      const result = await race(tasks);
      expect(result).toBe(2);
    });

    it('should return undefined for empty input', async () => {
      expect(await race([])).toBeUndefined();
    });
  });

  describe('queue', () => {
    it('should limit concurrency', async () => {
      vi.useRealTimers();
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 10));
        concurrent--;
        return i;
      });

      const results = await queue(tasks, 2);
      expect(results).toEqual([0, 1, 2, 3, 4]);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should return empty array for empty input', async () => {
      expect(await queue([])).toEqual([]);
    });
  });

  describe('batch', () => {
    it('should process items in batches', async () => {
      vi.useRealTimers();
      const items = [1, 2, 3, 4, 5];
      const processor = async (batchItems: number[]) => batchItems.map((x) => x * 2);
      const results = await batch(items, processor, { batchSize: 2 });
      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('should return empty array for empty input', async () => {
      expect(await batch([], async (x) => x, { batchSize: 2 })).toEqual([]);
    });
  });
});

// ============================================
// Memory Monitor Tests
// ============================================

describe('MemoryMonitor', () => {
  let monitor: MemoryMonitor;

  beforeEach(() => {
    monitor = new MemoryMonitor(80, 1000);
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('register/unregister', () => {
    it('should register and unregister disposables', () => {
      const disposable: Disposable = {
        dispose: vi.fn()
      };
      monitor.register(disposable);
      monitor.unregister(disposable);
    });
  });

  describe('startMonitoring/stopMonitoring', () => {
    it('should start and stop monitoring', () => {
      monitor.startMonitoring();
      monitor.startMonitoring(); // Should be idempotent
      monitor.stopMonitoring();
      monitor.stopMonitoring(); // Should be idempotent
    });
  });

  describe('getMemoryStats', () => {
    it('should return memory stats', () => {
      const stats = monitor.getMemoryStats();
      expect(stats).toHaveProperty('used');
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('heapUsed');
      expect(stats).toHaveProperty('heapTotal');
      expect(stats).toHaveProperty('usagePercent');
    });
  });

  describe('cleanup', () => {
    it('should cleanup all registered disposables', async () => {
      const disposable1: Disposable = { dispose: vi.fn() };
      const disposable2: Disposable = { dispose: vi.fn() };
      monitor.register(disposable1);
      monitor.register(disposable2);
      await monitor.cleanup();
      expect(disposable1.dispose).toHaveBeenCalled();
      expect(disposable2.dispose).toHaveBeenCalled();
    });

    it('should handle dispose errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const disposable: Disposable = {
        dispose: () => { throw new Error('Dispose error'); }
      };
      monitor.register(disposable);
      await monitor.cleanup();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('forceGarbageCollection', () => {
    it('should not throw if gc is not available', () => {
      expect(() => monitor.forceGarbageCollection()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('should cleanup and nullify instance', () => {
      monitor.startMonitoring();
      monitor.destroy();
      // Should be able to create new instance
      const newMonitor = MemoryMonitor.getInstance();
      expect(newMonitor).toBeDefined();
      newMonitor.destroy();
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = MemoryMonitor.getInstance();
      const instance2 = MemoryMonitor.getInstance();
      expect(instance1).toBe(instance2);
      instance1.destroy();
    });
  });
});

describe('getFormattedMemoryReport', () => {
  afterEach(() => {
    MemoryMonitor.getInstance().destroy();
  });

  it('should return formatted memory report', () => {
    const report = getFormattedMemoryReport();
    expect(report).toContain('記憶體使用報告');
    expect(report).toContain('堆記憶體使用');
    expect(report).toContain('使用率');
  });
});

describe('withMemoryMonitoring', () => {
  afterEach(() => {
    MemoryMonitor.getInstance().destroy();
  });

  it('should register disposable with monitor', () => {
    const disposable: Disposable = { dispose: vi.fn() };
    const result = withMemoryMonitoring(disposable);
    expect(result).toBe(disposable);
  });
});
