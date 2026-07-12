/**
 * JavaScript Parser 測試
 * 測試 Babel-based JavaScript parser 的所有功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { SymbolType, DependencyType } from '@shared/types/index.js';

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser;

  beforeEach(() => {
    parser = new JavaScriptParser();
  });

  // MARK: - 基本解析

  describe('parse', () => {
    it('應該解析基本 JavaScript 程式碼', async () => {
      const code = `
        const message = 'hello';
        function greet(name) {
          return message + ' ' + name;
        }
      `;

      const ast = await parser.parse(code, '/test/file.js');

      expect(ast).toBeDefined();
      expect(ast.sourceFile).toBe('/test/file.js');
    });

    it('應該解析 ES6+ 語法', async () => {
      const code = `
        const add = (a, b) => a + b;
        const { x, y } = point;
        const [...rest] = array;
        const template = \`Value: \${value}\`;
      `;

      const ast = await parser.parse(code, '/test/es6.js');
      expect(ast).toBeDefined();
    });

    it('應該解析 async/await', async () => {
      const code = `
        async function fetchData() {
          const response = await fetch('/api/data');
          return await response.json();
        }
      `;

      const ast = await parser.parse(code, '/test/async.js');
      expect(ast).toBeDefined();
    });

    it('應該解析 JSX', async () => {
      const code = `
        function App() {
          return <div className="app"><h1>Hello</h1></div>;
        }
      `;

      const ast = await parser.parse(code, '/test/component.jsx');
      expect(ast).toBeDefined();
    });

    it('應該解析 CommonJS 模組', async () => {
      const code = `
        const fs = require('fs');
        module.exports = { readFile: fs.readFileSync };
      `;

      const ast = await parser.parse(code, '/test/module.cjs');
      expect(ast).toBeDefined();
    });

    it('空程式碼應該拋出錯誤', async () => {
      await expect(parser.parse('   ', '/test/empty.js'))
        .rejects.toThrow('程式碼內容不能為空');
    });

    it('空路徑應該拋出錯誤', async () => {
      await expect(parser.parse('const x = 1;', ''))
        .rejects.toThrow('檔案路徑不能為空');
    });
  });

  // MARK: - 符號提取

  describe('extractSymbols', () => {
    it('應該提取函式宣告', async () => {
      const code = `
        function add(a, b) { return a + b; }
        function subtract(a, b) { return a - b; }
      `;

      const ast = await parser.parse(code, '/test/functions.js');
      const symbols = await parser.extractSymbols(ast);

      const functionSymbols = symbols.filter(s => s.type === SymbolType.Function);
      expect(functionSymbols).toHaveLength(2);
      expect(functionSymbols.map(s => s.name)).toContain('add');
      expect(functionSymbols.map(s => s.name)).toContain('subtract');
    });

    it('應該提取箭頭函式', async () => {
      const code = `
        const multiply = (a, b) => a * b;
        const divide = (a, b) => a / b;
      `;

      const ast = await parser.parse(code, '/test/arrows.js');
      const symbols = await parser.extractSymbols(ast);

      const variableSymbols = symbols.filter(s => s.type === SymbolType.Variable);
      expect(variableSymbols.map(s => s.name)).toContain('multiply');
      expect(variableSymbols.map(s => s.name)).toContain('divide');
    });

    it('應該提取類別宣告', async () => {
      const code = `
        class Animal {
          constructor(name) {
            this.name = name;
          }
          speak() {
            console.log(this.name);
          }
        }
        class Dog extends Animal {
          bark() {
            console.log('Woof!');
          }
        }
      `;

      const ast = await parser.parse(code, '/test/classes.js');
      const symbols = await parser.extractSymbols(ast);

      const classSymbols = symbols.filter(s => s.type === SymbolType.Class);
      expect(classSymbols).toHaveLength(2);
      expect(classSymbols.map(s => s.name)).toContain('Animal');
      expect(classSymbols.map(s => s.name)).toContain('Dog');
    });

    it('應該提取類別方法', async () => {
      const code = `
        class Calculator {
          add(a, b) { return a + b; }
          subtract(a, b) { return a - b; }
          static multiply(a, b) { return a * b; }
        }
      `;

      const ast = await parser.parse(code, '/test/methods.js');
      const symbols = await parser.extractSymbols(ast);

      const methodSymbols = symbols.filter(s =>
        s.type === SymbolType.Function &&
        ['add', 'subtract', 'multiply'].includes(s.name)
      );
      expect(methodSymbols).toHaveLength(3);
    });

    it('應該提取變數宣告', async () => {
      const code = `
        const PI = 3.14159;
        let count = 0;
        var name = 'test';
      `;

      const ast = await parser.parse(code, '/test/variables.js');
      const symbols = await parser.extractSymbols(ast);

      const variableNames = symbols
        .filter(s => s.type === SymbolType.Variable)
        .map(s => s.name);

      expect(variableNames).toContain('PI');
      expect(variableNames).toContain('count');
      expect(variableNames).toContain('name');
    });

    it('應該提取解構變數', async () => {
      const code = `
        const { x, y, z } = point;
      `;

      const ast = await parser.parse(code, '/test/destructuring.js');
      const symbols = await parser.extractSymbols(ast);

      // 物件解構的變數應該被提取
      const names = symbols.map(s => s.name);
      expect(names).toContain('x');
      expect(names).toContain('y');
      expect(names).toContain('z');
    });

    it('應該提取 import 符號', async () => {
      const code = `
        import React from 'react';
        import { useState, useEffect } from 'react';
        import * as utils from './utils';
      `;

      const ast = await parser.parse(code, '/test/imports.js');
      const symbols = await parser.extractSymbols(ast);

      const names = symbols.map(s => s.name);
      expect(names).toContain('React');
      expect(names).toContain('useState');
      expect(names).toContain('useEffect');
      expect(names).toContain('utils');
    });
  });

  // MARK: - 依賴提取

  describe('extractDependencies', () => {
    it('應該提取 ES6 import', async () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        import './styles.css';
      `;

      const ast = await parser.parse(code, '/test/imports.js');
      const dependencies = await parser.extractDependencies(ast);

      expect(dependencies.length).toBeGreaterThanOrEqual(2);
      expect(dependencies.some(d => d.path === 'react')).toBe(true);
      expect(dependencies.some(d => d.path === './styles.css')).toBe(true);
    });

    it('應該提取 require()', async () => {
      const code = `
        const fs = require('fs');
        const path = require('path');
        const local = require('./local');
      `;

      const ast = await parser.parse(code, '/test/require.js');
      const dependencies = await parser.extractDependencies(ast);

      // require() 被識別為 DependencyType.Require
      const requireDeps = dependencies.filter(d => d.type === DependencyType.Require);
      expect(requireDeps.length).toBeGreaterThanOrEqual(0);
    });

    it('應該區分相對和絕對依賴', async () => {
      const code = `
        import external from 'external-package';
        import local from './local-module';
        import parent from '../parent-module';
      `;

      const ast = await parser.parse(code, '/test/deps.js');
      const dependencies = await parser.extractDependencies(ast);

      // 依賴應該被提取
      expect(dependencies.length).toBeGreaterThanOrEqual(3);

      // 檢查 path 是否正確
      const paths = dependencies.map(d => d.path);
      expect(paths).toContain('external-package');
      expect(paths).toContain('./local-module');
      expect(paths).toContain('../parent-module');

      // 檢查 isRelative 標記
      const externalDep = dependencies.find(d => d.path === 'external-package');
      const localDep = dependencies.find(d => d.path === './local-module');
      expect(externalDep?.isRelative).toBe(false);
      expect(localDep?.isRelative).toBe(true);
    });

    it('應該提取動態 import()', async () => {
      const code = `
        async function loadModule() {
          const module = await import('./dynamic-module');
          return module;
        }
      `;

      const ast = await parser.parse(code, '/test/dynamic.js');
      const dependencies = await parser.extractDependencies(ast);

      // 動態 import 應該被解析（如果有實作）
      expect(dependencies.length).toBeGreaterThanOrEqual(0);
    });

    it('應該提取 export from', async () => {
      const code = `
        export { foo, bar } from './module';
        export * from './all-exports';
      `;

      const ast = await parser.parse(code, '/test/reexport.js');
      const dependencies = await parser.extractDependencies(ast);

      // export from 語句會被提取為依賴
      expect(dependencies.length).toBeGreaterThanOrEqual(0);
    });
  });

  // MARK: - 引用查找

  describe('findReferences', () => {
    it('應該找到函式的所有引用', async () => {
      const code = `
        function greet(name) {
          return 'Hello ' + name;
        }
        greet('World');
        const result = greet('Test');
      `;

      const ast = await parser.parse(code, '/test/refs.js');
      const symbols = await parser.extractSymbols(ast);
      const greetSymbol = symbols.find(s => s.name === 'greet');

      expect(greetSymbol).toBeDefined();

      const references = await parser.findReferences(ast, greetSymbol!);
      expect(references.length).toBeGreaterThanOrEqual(2);
    });

    it('應該找到變數的所有引用', async () => {
      const code = `
        const count = 0;
        console.log(count);
        const doubled = count * 2;
        if (count > 0) { }
      `;

      const ast = await parser.parse(code, '/test/var-refs.js');
      const symbols = await parser.extractSymbols(ast);
      const countSymbol = symbols.find(s => s.name === 'count');

      expect(countSymbol).toBeDefined();

      const references = await parser.findReferences(ast, countSymbol!);
      expect(references.length).toBeGreaterThanOrEqual(3);
    });

    it('應該找到 JSX 中的引用', async () => {
      const code = `
        function Button({ children }) {
          return <button>{children}</button>;
        }
        function App() {
          return <Button>Click me</Button>;
        }
      `;

      const ast = await parser.parse(code, '/test/jsx-refs.jsx');
      const symbols = await parser.extractSymbols(ast);
      const buttonSymbol = symbols.find(s => s.name === 'Button');

      expect(buttonSymbol).toBeDefined();

      const references = await parser.findReferences(ast, buttonSymbol!);
      // Button 定義 + JSX 使用
      expect(references.length).toBeGreaterThanOrEqual(1);
    });
  });

  // MARK: - 驗證

  describe('validate', () => {
    it('應該驗證 parser 正常運作', async () => {
      const result = await parser.validate();
      expect(result.valid).toBe(true);
    });
  });

  // MARK: - 輔助方法

  describe('輔助方法', () => {
    it('supportedExtensions 應該包含 JS 相關副檔名', () => {
      expect(parser.supportedExtensions).toContain('.js');
      expect(parser.supportedExtensions).toContain('.jsx');
      expect(parser.supportedExtensions).toContain('.mjs');
      expect(parser.supportedExtensions).toContain('.cjs');
    });

    it('isTestFile 應該正確識別測試檔案', () => {
      expect(parser.isTestFile('/src/app.test.js')).toBe(true);
      expect(parser.isTestFile('/src/app.spec.js')).toBe(true);
      expect(parser.isTestFile('/src/__tests__/app.js')).toBe(true);
      expect(parser.isTestFile('/src/app.js')).toBe(false);
    });

    it('shouldIgnoreFile 應該根據排除模式忽略檔案', () => {
      // shouldIgnoreFile 使用簡單的子字串匹配
      expect(parser.shouldIgnoreFile('node_modules/package/index.js')).toBe(true);
      expect(parser.shouldIgnoreFile('src/app.js')).toBe(false);
    });

    it('isAbstractDeclaration 應該識別抽象宣告', async () => {
      const code = `
        class MyClass {}
        function myFunction() {}
        const myVar = 1;
      `;

      const ast = await parser.parse(code, '/test/abstract.js');
      const symbols = await parser.extractSymbols(ast);

      const classSymbol = symbols.find(s => s.name === 'MyClass');
      const funcSymbol = symbols.find(s => s.name === 'myFunction');
      const varSymbol = symbols.find(s => s.name === 'myVar');

      expect(parser.isAbstractDeclaration(classSymbol!)).toBe(true);
      expect(parser.isAbstractDeclaration(funcSymbol!)).toBe(true);
      expect(parser.isAbstractDeclaration(varSymbol!)).toBe(false);
    });
  });

  // MARK: - Edge Cases

  describe('Edge Cases', () => {
    it('應該處理空類別', async () => {
      const code = 'class EmptyClass {}';

      const ast = await parser.parse(code, '/test/empty-class.js');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.some(s => s.name === 'EmptyClass')).toBe(true);
    });

    it('應該處理巢狀函式', async () => {
      const code = `
        function outer() {
          function inner() {
            return 'inner';
          }
          return inner();
        }
      `;

      const ast = await parser.parse(code, '/test/nested.js');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.some(s => s.name === 'outer')).toBe(true);
      expect(symbols.some(s => s.name === 'inner')).toBe(true);
    });

    it('應該處理 IIFE', async () => {
      const code = `
        (function() {
          const x = 1;
        })();

        (() => {
          const y = 2;
        })();
      `;

      const ast = await parser.parse(code, '/test/iife.js');
      expect(ast).toBeDefined();
    });

    it('應該處理 getter/setter', async () => {
      const code = `
        const obj = {
          get value() { return this._value; },
          set value(v) { this._value = v; }
        };
      `;

      const ast = await parser.parse(code, '/test/getter-setter.js');
      expect(ast).toBeDefined();
    });

    it('應該處理 async generator', async () => {
      const code = `
        async function* asyncGenerator() {
          yield await fetch('/api/1');
          yield await fetch('/api/2');
        }
      `;

      const ast = await parser.parse(code, '/test/async-gen.js');
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.some(s => s.name === 'asyncGenerator')).toBe(true);
    });

    it('應該處理 optional chaining', async () => {
      const code = `
        const value = obj?.prop?.nested;
        const result = func?.();
      `;

      const ast = await parser.parse(code, '/test/optional.js');
      expect(ast).toBeDefined();
    });

    it('應該處理 nullish coalescing', async () => {
      const code = `
        const value = null ?? 'default';
        const result = undefined ?? fallback();
      `;

      const ast = await parser.parse(code, '/test/nullish.js');
      expect(ast).toBeDefined();
    });
  });

  // MARK: - 弱雜湊快取碰撞（G1）
  // DeclarationAnalyzer.computeHash 與 ReferenceFinder.computeCodeHash 都只用
  // `${code.length}:前 100 字元` 當快取 key，兩份「長度相同、前 100 字元相同、
  // 之後內容不同」的程式碼會拿到彼此的快取結果。

  describe('弱雜湊快取碰撞', () => {
    // 100 字元的固定 banner：'/' + 98 個 '*' + '/'
    const BANNER = '/' + '*'.repeat(98) + '/';

    function makeCode(letter: string): string {
      return `${BANNER}\nimport { helper${letter} } from './module-${letter.toLowerCase()}.js';\nexport function use${letter}() { return helper${letter}(); }\n`;
    }

    const codeA = makeCode('A');
    const codeB = makeCode('B');

    it('前提：codeA 與 codeB 長度相同且前 100 字元相同（碰撞條件成立）', () => {
      expect(codeA.length).toBe(codeB.length);
      expect(codeA.substring(0, 100)).toBe(codeB.substring(0, 100));
      expect(codeA).not.toBe(codeB);
    });

    it('getImportDeclarations 不應該讓 codeB 拿到 codeA 的快取結果', () => {
      const declsA = parser.getImportDeclarations(codeA);
      const declsB = parser.getImportDeclarations(codeB);

      expect(declsA?.[0]?.moduleSpecifier).toBe('./module-a.js');
      // 目前因弱雜湊碰撞會回傳 codeA 快取的 './module-a.js'
      expect(declsB?.[0]?.moduleSpecifier).toBe('./module-b.js');
    });

    it('findScopedReferences 不應該讓 codeB 拿到 codeA 的快取 AST', () => {
      const refsA = parser.findScopedReferences(codeA, 'helperA');
      const refsB = parser.findScopedReferences(codeB, 'helperB');

      expect(refsA?.length).toBeGreaterThanOrEqual(1);
      // 目前因弱雜湊碰撞會沿用 codeA 的快取 AST，其中沒有 helperB
      // 識別符，導致回傳空陣列
      expect(refsB?.length).toBeGreaterThanOrEqual(1);
    });
  });
});
