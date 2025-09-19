import { describe, it, expect } from 'vitest';
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
} from '../../../src/shared/utils/string';

describe('字串工具函式', () => {
  describe('capitalize', () => {
    it('應該將首字母大寫', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('WORLD')).toBe('WORLD');
      expect(capitalize('test case')).toBe('Test case');
    });

    it('應該處理空字串', () => {
      expect(capitalize('')).toBe('');
    });

    it('應該處理 null 和 undefined', () => {
      expect(capitalize(null as any)).toBe('');
      expect(capitalize(undefined as any)).toBe('');
    });
  });

  describe('camelCase', () => {
    it('應該轉換為駝峰命名', () => {
      expect(camelCase('hello world')).toBe('helloWorld');
      expect(camelCase('test-case')).toBe('testCase');
      expect(camelCase('snake_case')).toBe('snakeCase');
      expect(camelCase('PascalCase')).toBe('pascalCase');
    });

    it('應該處理特殊字元', () => {
      expect(camelCase('hello@world#test')).toBe('helloWorldTest');
      expect(camelCase('123test456')).toBe('123test456');
    });

    it('應該處理空字串', () => {
      expect(camelCase('')).toBe('');
    });
  });

  describe('snakeCase', () => {
    it('應該轉換為蛇形命名', () => {
      expect(snakeCase('helloWorld')).toBe('hello_world');
      expect(snakeCase('TestCase')).toBe('test_case');
      expect(snakeCase('hello-world')).toBe('hello_world');
      expect(snakeCase('hello world')).toBe('hello_world');
    });

    it('應該處理連續大寫字母', () => {
      expect(snakeCase('XMLHttpRequest')).toBe('xml_http_request');
      expect(snakeCase('HTMLElement')).toBe('html_element');
    });

    it('應該處理空字串', () => {
      expect(snakeCase('')).toBe('');
    });
  });

  describe('kebabCase', () => {
    it('應該轉換為短橫線命名', () => {
      expect(kebabCase('helloWorld')).toBe('hello-world');
      expect(kebabCase('TestCase')).toBe('test-case');
      expect(kebabCase('hello_world')).toBe('hello-world');
      expect(kebabCase('hello world')).toBe('hello-world');
    });

    it('應該處理特殊字元', () => {
      expect(kebabCase('hello@world#test')).toBe('hello-world-test');
    });

    it('應該處理空字串', () => {
      expect(kebabCase('')).toBe('');
    });
  });

  describe('truncate', () => {
    it('應該截斷長字串', () => {
      expect(truncate('Hello World', 5)).toBe('Hello...');
      expect(truncate('Short', 10)).toBe('Short');
      expect(truncate('Test', 4)).toBe('Test');
    });

    it('應該使用自定義省略符', () => {
      expect(truncate('Hello World', 5, '---')).toBe('Hello---');
      expect(truncate('Test', 10, '...')).toBe('Test');
    });

    it('應該處理邊界條件', () => {
      expect(truncate('', 5)).toBe('');
      expect(truncate('Test', 0)).toBe('...');
      expect(truncate('Test', -1)).toBe('...');
    });
  });

  describe('padStart', () => {
    it('應該在開頭填充字元', () => {
      expect(padStart('5', 3, '0')).toBe('005');
      expect(padStart('hello', 8, ' ')).toBe('   hello');
      expect(padStart('test', 2, 'x')).toBe('test');
    });

    it('應該處理空字串', () => {
      expect(padStart('', 3, '0')).toBe('000');
    });

    it('應該使用預設填充字元', () => {
      expect(padStart('5', 3)).toBe('  5');
    });
  });

  describe('padEnd', () => {
    it('應該在結尾填充字元', () => {
      expect(padEnd('5', 3, '0')).toBe('500');
      expect(padEnd('hello', 8, ' ')).toBe('hello   ');
      expect(padEnd('test', 2, 'x')).toBe('test');
    });

    it('應該處理空字串', () => {
      expect(padEnd('', 3, '0')).toBe('000');
    });

    it('應該使用預設填充字元', () => {
      expect(padEnd('5', 3)).toBe('5  ');
    });
  });

  describe('stripIndent', () => {
    it('應該移除共同縮排', () => {
      const input = `
        Hello
        World
        Test
      `;
      const expected = 'Hello\nWorld\nTest';
      expect(stripIndent(input)).toBe(expected);
    });

    it('應該保持相對縮排', () => {
      const input = `
        Hello
          World
        Test
      `;
      const expected = 'Hello\n  World\nTest';
      expect(stripIndent(input)).toBe(expected);
    });

    it('應該處理空字串', () => {
      expect(stripIndent('')).toBe('');
      expect(stripIndent('   ')).toBe('');
    });
  });

  describe('escapeRegExp', () => {
    it('應該跳脫正則表達式特殊字元', () => {
      expect(escapeRegExp('[hello]')).toBe('\\[hello\\]');
      expect(escapeRegExp('(test)')).toBe('\\(test\\)');
      expect(escapeRegExp('a.b*c+d?e^f$g|h{i}j')).toBe('a\\.b\\*c\\+d\\?e\\^f\\$g\\|h\\{i\\}j');
    });

    it('應該處理普通字串', () => {
      expect(escapeRegExp('hello world')).toBe('hello world');
    });

    it('應該處理空字串', () => {
      expect(escapeRegExp('')).toBe('');
    });
  });

  describe('template', () => {
    it('應該替換模板變數', () => {
      expect(template('Hello {{name}}!', { name: 'World' })).toBe('Hello World!');
      expect(template('{{a}} + {{b}} = {{c}}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
    });

    it('應該處理巢狀物件', () => {
      expect(template('Hello {{user.name}}!', { user: { name: 'Alice' } })).toBe('Hello Alice!');
    });

    it('應該處理不存在的變數', () => {
      expect(template('Hello {{name}}!', {})).toBe('Hello {{name}}!');
    });

    it('應該處理空模板', () => {
      expect(template('', { name: 'World' })).toBe('');
    });
  });

  describe('slugify', () => {
    it('應該轉換為 URL 友好字串', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test & Example')).toBe('test-example');
      expect(slugify('Special@Characters#Here')).toBe('special-characters-here');
    });

    it('應該移除多餘的短橫線', () => {
      expect(slugify('  Hello   World  ')).toBe('hello-world');
      expect(slugify('test---example')).toBe('test-example');
    });

    it('應該處理數字和字母', () => {
      expect(slugify('Test 123 Example')).toBe('test-123-example');
    });

    it('應該處理空字串', () => {
      expect(slugify('')).toBe('');
      expect(slugify('   ')).toBe('');
    });

    it('應該處理中文字元', () => {
      expect(slugify('測試 中文')).toBe('測試-中文');
    });
  });
});