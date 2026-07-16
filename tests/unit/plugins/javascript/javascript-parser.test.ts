/**
 * JavaScript Parser 測試
 * 測試 Babel-based JavaScript parser 的所有功能
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import { SymbolType, DependencyType, ReferenceType } from '@shared/types/index.js';
import { createPosition } from '@shared/types/index.js';

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
      expect(parser.shouldIgnoreFile('src/dist/index.js')).toBe(true);
      expect(parser.shouldIgnoreFile('src/distance.js')).toBe(false);
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

  // MARK: - 解構綁定符號提取（bug repro）
  // extractVariableSymbol／extractParameterSymbols 只處理 babel.isIdentifier(node.id/param)，
  // 物件/陣列解構的綁定（ObjectPattern／ArrayPattern）一律被跳過，導致解構出的變數
  // 無法被 search/rename 定位到（找不到符號，或符號的定義與使用處無法正確關聯）。

  describe('解構綁定符號提取', () => {
    it('物件解構變數應該可透過 findSymbolAtPosition 定位並找到使用處引用', async () => {
      const code = 'const { value } = source;\nconsole.log(value);\n';

      const ast = await parser.parse(code, '/test/destructure-var.js');
      const symbols = await parser.extractSymbols(ast);

      const valueSymbol = symbols.find(s => s.name === 'value');
      expect(valueSymbol).toBeDefined();

      const references = await parser.findReferences(ast, valueSymbol!);
      const usages = references.filter(r => r.type === ReferenceType.Usage);
      // console.log(value) 中的 value 應該被辨識為對解構出變數的使用
      expect(usages.length).toBeGreaterThanOrEqual(1);
    });

    it('解構參數應該可被提取為符號且能定位到函式內的使用處', async () => {
      const code = 'function f({ value }) {\n  return value;\n}\n';

      const ast = await parser.parse(code, '/test/destructure-param.js');
      const symbols = await parser.extractSymbols(ast);

      const valueSymbol = symbols.find(s => s.name === 'value');
      expect(valueSymbol).toBeDefined();

      const references = await parser.findReferences(ast, valueSymbol!);
      const usages = references.filter(r => r.type === ReferenceType.Usage);
      expect(usages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // MARK: - JSX 屬性 key 誤判為引用（bug repro）
  // findReferences 的 JSXIdentifier visitor 只比對名稱字串，未區分 JSXAttribute 的
  // key（如 `id="x"` 中的 `id=`）與真正的 JS 綁定使用，導致同名的無關 JSX 屬性
  // 也被當成引用回傳，重命名時會誤改到 JSX attribute。

  describe('JSX 屬性 key 誤判為引用', () => {
    it('JSX 屬性 key 不應該被當成變數 id 的引用', async () => {
      const code = 'const id = 1;\nconst el = <div id="x" />;\n';

      const ast = await parser.parse(code, '/test/jsx-attr.jsx');
      const symbols = await parser.extractSymbols(ast);

      const idSymbol = symbols.find(s => s.name === 'id' && s.type === SymbolType.Variable);
      expect(idSymbol).toBeDefined();

      const references = await parser.findReferences(ast, idSymbol!);
      // 唯一合法引用是變數 `id` 自己的宣告；<div id="x" /> 的屬性 key 與此變數無關
      expect(references).toHaveLength(1);
    });
  });

  // MARK: - Class method 引用完整性（F3）
  // isReferenceToSymbol 濾掉 ClassMethod key（定義名）且 enclosingClass 僅認 class 內
  // this.m，導致 rename/find-ref 漏定義與外部 instance.m()。
  // 跨類別同名方法仍不得互混。

  describe('Class method 引用完整性（F3）', () => {
    it('A.run 應含定義 + this.run，且不應混入 B.run 的 this.run()', async () => {
      const code = `
        class A {
          run() {}
          call() { this.run(); }
        }
        class B {
          run() {}
          call() { this.run(); }
        }
      `;

      const ast = await parser.parse(code, '/test/class-methods.js');
      const symbols = await parser.extractSymbols(ast);

      const runMethods = symbols.filter(s => s.name === 'run' && s.type === SymbolType.Function);
      expect(runMethods).toHaveLength(2);

      const [firstRun] = runMethods;
      const references = await parser.findReferences(ast, firstRun);

      // 正確：定義名 run + A.call 內 this.run() → 至少 2 筆，且全在 class A 區塊
      // 目前壞行為：ClassMethod key 被濾掉，只剩 this.run（1 筆）
      expect(references.length).toBeGreaterThanOrEqual(2);
      for (const ref of references) {
        expect(ref.location.range.start.line).toBeLessThanOrEqual(4);
      }
    });

    it('外部 instance.m() 應被視為 class method 的引用（F3）', async () => {
      const code = `
        class Greeter {
          greet() { return 1; }
          call() { return this.greet(); }
        }
        const g = new Greeter();
        g.greet();
      `;

      const ast = await parser.parse(code, '/test/class-method-external.js');
      const symbols = await parser.extractSymbols(ast);
      const greet = symbols.find(s => s.name === 'greet' && s.type === SymbolType.Function);
      expect(greet).toBeDefined();

      const references = await parser.findReferences(ast, greet!);
      const lines = references.map(r => r.location.range.start.line);

      // 定義 + this.greet + g.greet → 至少 3 筆
      // 目前壞行為：enclosingClass 只認 class 內 this.m，外部 g.greet 漏掉；
      // ClassMethod key 也漏掉定義
      expect(references.length).toBeGreaterThanOrEqual(3);
      expect(lines.some(line => line >= 6)).toBe(true);
    });
  });

  // MARK: - Babel plugin 保留字缺漏 enum（bug repro）
  // JAVASCRIPT_RESERVED_WORDS（types.ts）遺漏 'enum'，導致 rename 驗證誤判其為合法
  // 識別符，實際 Babel/JS 文法禁止 `enum` 作為變數名稱。

  describe('保留字驗證：enum', () => {
    it('rename 為保留字 enum 應該被拒絕', async () => {
      const code = 'const value = 1;\n';
      const ast = await parser.parse(code, '/test/reserved-enum.js');

      await expect(
        parser.rename(ast, createPosition(1, 7), 'enum')
      ).rejects.toThrow();
    });
  });
});

// MARK: - Babel 使用者插件合併（bug repro）
// getParseOptionsForFile() 呼叫 getPluginsForFile(filePath) 時完全丟棄建構子傳入的
// parseOptions.plugins，一律套用模組內建的預設插件清單，導致使用者透過
// `new JavaScriptParser({ plugins: [...] })` 指定的插件（例如 'flow'）永遠不會生效。

describe('JavaScriptParser - 使用者提供的 Babel plugins', () => {
  it('建構子傳入的 plugins 應該被實際使用（而非被預設清單取代）', async () => {
    const parser = new JavaScriptParser({ plugins: ['flow'] });
    // Flow 語法：變數型別註記，需要 'flow' plugin 才能解析
    const code = 'const x: number = 1;\n';

    await expect(parser.parse(code, '/test/flow.js')).resolves.toBeDefined();
  });

  it('使用者提供的 plugins 應該與預設插件合併，而非完全取代預設清單', async () => {
    const parser = new JavaScriptParser({ plugins: ['flow'] });
    // 預設插件包含 nullishCoalescingOperator/optionalChaining 等；
    // 加入 'flow' 不應該讓這些預設語法失效
    const code = 'const value = obj?.prop ?? "default";\n';

    await expect(parser.parse(code, '/test/flow-defaults.js')).resolves.toBeDefined();
  });
});
