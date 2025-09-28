/**
 * JavaScript Parser 測試
 * TDD 紅燈階段 - 編寫失敗的測試案例
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaScriptParser } from '../../../src/plugins/javascript/parser';
import type { AST } from '../../../src/shared/types';

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser;

  beforeEach(() => {
    parser = new JavaScriptParser();
  });

  describe('基本資訊', () => {
    it('應該有正確的插件名稱', () => {
      expect(parser.name).toBe('javascript');
    });

    it('應該有版本號', () => {
      expect(parser.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('應該支援 .js 和 .jsx 副檔名', () => {
      expect(parser.supportedExtensions).toContain('.js');
      expect(parser.supportedExtensions).toContain('.jsx');
      expect(parser.supportedExtensions).toContain('.mjs');
      expect(parser.supportedExtensions).toContain('.cjs');
    });

    it('應該支援 JavaScript 和 JSX 語言', () => {
      expect(parser.supportedLanguages).toContain('javascript');
      expect(parser.supportedLanguages).toContain('jsx');
    });
  });

  describe('程式碼解析', () => {
    it('應該能解析簡單的變數宣告', async () => {
      const code = 'const message = "Hello, World!";';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe(filePath);
      expect(ast.root).toBeDefined();
      expect(ast.root.type).toBe('File');
      expect(ast.metadata.language).toBe('javascript');
    });

    it('應該能解析 ES6+ 功能', async () => {
      const code = `
        const [a, b] = array;
        const { name, age } = person;
        const arrowFunc = (x) => x * 2;
        async function asyncFunc() {
          const result = await fetch('/api');
          return result.json();
        }
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析類別定義', async () => {
      const code = `
        class TestClass {
          constructor(value) {
            this.field = value;
          }

          getField() {
            return this.field;
          }

          static staticMethod() {
            return 'static';
          }
        }
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析模組 import/export', async () => {
      const code = `
        import { something } from './module';
        import * as utils from '../utils';
        import defaultExport from './default';

        export { something };
        export const exported = 'value';
        export default class DefaultClass {}
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析 CommonJS require/module.exports', async () => {
      const code = `
        const fs = require('fs');
        const { readFile } = require('fs/promises');
        const utils = require('./utils');

        module.exports = {
          readData: () => 'data',
          writeData: () => {}
        };

        exports.helper = function() {
          return 'helper';
        };
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析 JSX', async () => {
      const code = `
        const element = <div className="test">Hello</div>;

        function Component({ name }) {
          return (
            <div>
              <h1>Hello {name}</h1>
              <button onClick={() => alert('clicked')}>
                Click me
              </button>
            </div>
          );
        }
      `;
      const filePath = 'test.jsx';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析現代 JavaScript 特性', async () => {
      const code = `
        // Optional chaining
        const value = obj?.prop?.value;

        // Nullish coalescing
        const fallback = value ?? 'default';

        // Dynamic import
        const module = await import('./dynamic-module.js');

        // Private fields
        class PrivateClass {
          #privateField = 'private';

          #privateMethod() {
            return this.#privateField;
          }
        }

        // Template literals
        const template = \`Hello \${name}!\`;
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });

    it('應該能解析裝飾器（實驗性功能）', async () => {
      const code = `
        @decorator
        class DecoratedClass {
          @property
          field = 'value';

          @method
          decorated() {
            return 'decorated';
          }
        }
      `;
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);

      expect(ast).toBeDefined();
      expect(ast.root.children.length).toBeGreaterThan(0);
    });
  });

  describe('錯誤處理', () => {
    it('應該能處理語法錯誤的程式碼', async () => {
      const code = 'const invalid syntax here';
      const filePath = 'test.js';

      // Babel parser 會拋出語法錯誤
      await expect(parser.parse(code, filePath)).rejects.toThrow();
    });

    it('應該拋出錯誤當檔案路徑為空', async () => {
      const code = 'const valid = true;';

      await expect(parser.parse(code, '')).rejects.toThrow();
    });

    it('應該拋出錯誤當程式碼為空', async () => {
      const filePath = 'test.js';

      await expect(parser.parse('', filePath)).rejects.toThrow();
    });

    it('應該拋出錯誤當程式碼只有空白字元', async () => {
      const filePath = 'test.js';

      await expect(parser.parse('   \n\t  ', filePath)).rejects.toThrow();
    });
  });

  describe('符號提取', () => {
    it('應該能提取變數符號', async () => {
      const code = 'const variable = "value";';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toBeDefined();
      expect(symbols.length).toBeGreaterThan(0);
      expect(symbols[0].name).toBe('variable');
    });

    it('應該能提取函式符號', async () => {
      const code = 'function testFunction() { return true; }';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toBeDefined();
      expect(symbols.some(s => s.name === 'testFunction')).toBe(true);
    });

    it('應該能提取類別符號', async () => {
      const code = 'class TestClass { constructor() {} }';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);
      const symbols = await parser.extractSymbols(ast);

      expect(symbols).toBeDefined();
      expect(symbols.some(s => s.name === 'TestClass')).toBe(true);
    });
  });

  describe('依賴關係提取', () => {
    it('應該能提取 import 依賴', async () => {
      const code = 'import { utils } from "./utils";';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);
      const dependencies = await parser.extractDependencies(ast);

      expect(dependencies).toBeDefined();
      expect(dependencies.length).toBeGreaterThan(0);
      expect(dependencies[0].path).toBe('./utils');
    });

    it('應該能提取 require 依賴', async () => {
      const code = 'const fs = require("fs");';
      const filePath = 'test.js';

      const ast = await parser.parse(code, filePath);
      const dependencies = await parser.extractDependencies(ast);

      expect(dependencies).toBeDefined();
      expect(dependencies.length).toBeGreaterThan(0);
      expect(dependencies[0].path).toBe('fs');
    });
  });

  describe('驗證和清理', () => {
    it('應該通過驗證', async () => {
      const result = await parser.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('應該能正常清理資源', async () => {
      await expect(parser.dispose()).resolves.not.toThrow();
    });
  });
});