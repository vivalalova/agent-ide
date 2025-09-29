/**
 * TypeScript Dependency Analyzer 測試
 * TDD 紅燈階段 - 編寫失敗的測試案例
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TypeScriptParser } from '../../../src/plugins/typescript/parser';
import { DependencyType } from '../../../src/shared/types';

describe('TypeScriptParser - Dependency Analysis', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  describe('Import 語句分析', () => {
    it('應該能分析 ES6 import', async () => {
      const code = `
        import { something } from './module';
        import * as utils from '../utils';
        import defaultExport from 'external-package';
        import './side-effect';
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      expect(dependencies).toHaveLength(4);
      
      // 具名 import
      const namedImport = dependencies.find(d => d.path === './module');
      expect(namedImport).toBeDefined();
      expect(namedImport!.type).toBe(DependencyType.Import);
      expect(namedImport!.isRelative).toBe(true);
      expect(namedImport!.importedSymbols).toContain('something');
      
      // 命名空間 import
      const namespaceImport = dependencies.find(d => d.path === '../utils');
      expect(namespaceImport).toBeDefined();
      expect(namespaceImport!.isRelative).toBe(true);
      expect(namespaceImport!.importedSymbols).toContain('*');
      
      // 預設 import
      const defaultImport = dependencies.find(d => d.path === 'external-package');
      expect(defaultImport).toBeDefined();
      expect(defaultImport!.isRelative).toBe(false);
      expect(defaultImport!.importedSymbols).toContain('default');
      
      // 副作用 import
      const sideEffectImport = dependencies.find(d => d.path === './side-effect');
      expect(sideEffectImport).toBeDefined();
      expect(sideEffectImport!.importedSymbols).toHaveLength(0);
    });

    it('應該能分析複雜的 import 組合', async () => {
      const code = `
        import defaultExport, { namedExport1, namedExport2 } from './complex-module';
        import type { TypeOnlyImport } from './types';
        import { type InlineType, normalValue } from './mixed';
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      const complexImport = dependencies.find(d => d.path === './complex-module');
      expect(complexImport).toBeDefined();
      expect(complexImport!.importedSymbols).toContain('default');
      expect(complexImport!.importedSymbols).toContain('namedExport1');
      expect(complexImport!.importedSymbols).toContain('namedExport2');
      
      const typeOnlyImport = dependencies.find(d => d.path === './types');
      expect(typeOnlyImport).toBeDefined();
      expect(typeOnlyImport!.importedSymbols).toContain('TypeOnlyImport');
      
      const mixedImport = dependencies.find(d => d.path === './mixed');
      expect(mixedImport).toBeDefined();
      expect(mixedImport!.importedSymbols).toContain('InlineType');
      expect(mixedImport!.importedSymbols).toContain('normalValue');
    });
  });

  describe('Export 語句分析', () => {
    it('應該能分析 export 語句', async () => {
      const code = `
        export { something } from './module';
        export * from './all-exports';
        export * as namespace from './namespace-export';
        export default class DefaultClass {}
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      // 重新匯出
      const reExport = dependencies.find(d => d.path === './module');
      expect(reExport).toBeDefined();
      expect(reExport!.type).toBe(DependencyType.Import);
      expect(reExport!.importedSymbols).toContain('something');
      
      // 全部重新匯出
      const allExport = dependencies.find(d => d.path === './all-exports');
      expect(allExport).toBeDefined();
      expect(allExport!.importedSymbols).toContain('*');
      
      // 命名空間重新匯出
      const namespaceExport = dependencies.find(d => d.path === './namespace-export');
      expect(namespaceExport).toBeDefined();
      expect(namespaceExport!.importedSymbols).toContain('*');
    });
  });

  describe('動態 Import 分析', () => {
    it('應該能分析動態 import', async () => {
      const code = `
        const module1 = await import('./dynamic-module');
        const module2 = import('../utils').then(m => m.default);
        import('./conditional-import').catch(console.error);
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      const dynamicImport1 = dependencies.find(d => d.path === './dynamic-module');
      expect(dynamicImport1).toBeDefined();
      expect(dynamicImport1!.type).toBe(DependencyType.Import);
      expect(dynamicImport1!.isRelative).toBe(true);
      
      const dynamicImport2 = dependencies.find(d => d.path === '../utils');
      expect(dynamicImport2).toBeDefined();
      expect(dynamicImport2!.isRelative).toBe(true);
    });
  });

  describe('CommonJS 支援', () => {
    it('應該能分析 require 語句', async () => {
      const code = `
        const fs = require('fs');
        const path = require('path');
        const utils = require('./utils');
        const { specific } = require('./specific-module');
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      const fsRequire = dependencies.find(d => d.path === 'fs');
      expect(fsRequire).toBeDefined();
      expect(fsRequire!.type).toBe(DependencyType.Require);
      expect(fsRequire!.isRelative).toBe(false);
      
      const utilsRequire = dependencies.find(d => d.path === './utils');
      expect(utilsRequire).toBeDefined();
      expect(utilsRequire!.isRelative).toBe(true);
      
      const specificRequire = dependencies.find(d => d.path === './specific-module');
      expect(specificRequire).toBeDefined();
      expect(specificRequire!.importedSymbols).toContain('specific');
    });
  });

  describe('三斜線指令分析', () => {
    it('應該能分析三斜線引用指令', async () => {
      const code = `
        /// <reference path="./types.d.ts" />
        /// <reference types="node" />
        /// <amd-module name="MyModule" />
        
        const value = 42;
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      const pathReference = dependencies.find(d => d.path === './types.d.ts');
      expect(pathReference).toBeDefined();
      expect(pathReference!.type).toBe(DependencyType.Include);
      expect(pathReference!.isRelative).toBe(true);
      
      const typesReference = dependencies.find(d => d.path === 'node');
      expect(typesReference).toBeDefined();
      expect(typesReference!.isRelative).toBe(false);
    });
  });

  describe('路徑解析', () => {
    it('應該正確識別相對路徑', async () => {
      const code = `
        import { a } from './relative';
        import { b } from '../parent';
        import { c } from '../../grandparent';
        import { d } from '/absolute';
        import { e } from 'external-package';
        import { f } from '@scoped/package';
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      expect(dependencies.find(d => d.path === './relative')!.isRelative).toBe(true);
      expect(dependencies.find(d => d.path === '../parent')!.isRelative).toBe(true);
      expect(dependencies.find(d => d.path === '../../grandparent')!.isRelative).toBe(true);
      expect(dependencies.find(d => d.path === '/absolute')!.isRelative).toBe(false);
      expect(dependencies.find(d => d.path === 'external-package')!.isRelative).toBe(false);
      expect(dependencies.find(d => d.path === '@scoped/package')!.isRelative).toBe(false);
    });

    it('應該正確處理檔案副檔名', async () => {
      const code = `
        import { a } from './module.js';
        import { b } from './module.ts';
        import { c } from './module.d.ts';
        import { d } from './module.json';
        import { e } from './module'; // 無副檔名
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      expect(dependencies).toHaveLength(5);
      expect(dependencies.map(d => d.path)).toEqual([
        './module.js',
        './module.ts',
        './module.d.ts',
        './module.json',
        './module'
      ]);
    });
  });

  describe('錯誤處理', () => {
    it('應該處理格式錯誤的 import 語句', async () => {
      const code = `
        // TypeScript 編譯器會從語法錯誤中恢復
        import from './no-specifier';
        import './valid-side-effect';
      `;
      
      // TypeScript 編譯器能夠處理語法錯誤，所以不會失敗
      const ast = await parser.parse(code, 'test.ts');
      expect(ast).toBeDefined();
      
      const dependencies = await parser.extractDependencies(ast);
      // 只有有效的依賴會被提取
      expect(dependencies.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理空的依賴路徑', async () => {
      const code = `
        import { valid } from './valid-module';
        const value = 42;
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      // 只應該有有效的依賴
      expect(dependencies).toHaveLength(1);
      expect(dependencies[0].path).toBe('./valid-module');
    });
  });

  describe('複雜案例', () => {
    it('應該能處理混合的依賴類型', async () => {
      const code = `
        /// <reference types="node" />
        
        import React, { Component } from 'react';
        import * as fs from 'fs';
        import './styles.css';
        
        const utils = require('./utils');
        const path = require('path');
        
        async function loadModule() {
          const module = await import('./dynamic-module');
          return module.default;
        }
        
        export { Component } from 'react';
        export * from './exports';
      `;
      const ast = await parser.parse(code, 'test.ts');
      const dependencies = await parser.extractDependencies(ast);
      
      // 應該包含所有類型的依賴
      expect(dependencies.length).toBeGreaterThan(5);
      
      // 檢查不同類型
      const hasImport = dependencies.some(d => d.type === DependencyType.Import);
      const hasRequire = dependencies.some(d => d.type === DependencyType.Require);
      const hasInclude = dependencies.some(d => d.type === DependencyType.Include);
      
      expect(hasImport).toBe(true);
      expect(hasRequire).toBe(true);
      expect(hasInclude).toBe(true);
    });
  });
});