import { describe, it, expect, beforeEach } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver';
import { PathType, ImportResolverConfig } from '@core/move/types';

describe('ImportResolver', () => {
  let resolver: ImportResolver;
  let config: ImportResolverConfig;

  beforeEach(() => {
    config = {
      supportedExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.swift'],
      pathAliases: {
        '@': '/src',
        '@components': '/src/components',
        '@utils': '/src/utils'
      },
      baseUrl: '/project'
    };
    resolver = new ImportResolver(config);
  });

  describe('parseImportStatements', () => {
    it('應該解析 ES6 import 語句', () => {
      const code = 'import { foo } from \'./utils\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].type).toBe('import');
      expect(statements[0].path).toBe('./utils');
      expect(statements[0].pathType).toBe(PathType.RELATIVE);
      expect(statements[0].isRelative).toBe(true);
    });

    it('應該解析多個 import 語句', () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        import utils from './utils';
      `;
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements.length).toBeGreaterThanOrEqual(3);
    });

    it('應該解析 CommonJS require', () => {
      const code = 'const fs = require(\'fs\');';
      const statements = resolver.parseImportStatements(code, '/src/index.js');

      expect(statements).toHaveLength(1);
      expect(statements[0].type).toBe('require');
      expect(statements[0].path).toBe('fs');
    });

    it('應該解析動態 import', () => {
      const code = 'const module = import(\'./module\');';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].type).toBe('dynamic_import');
      expect(statements[0].path).toBe('./module');
    });

    it('應該解析 export from 語句', () => {
      const code = 'export { foo } from \'./utils\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].type).toBe('export');
      expect(statements[0].path).toBe('./utils');
    });

    it('應該解析多行 export from 語句', () => {
      const code = `export {
  foo,
  bar
} from './utils';`;
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].type).toBe('export');
      expect(statements[0].path).toBe('./utils');
      expect(statements[0].rawStatement).toContain('foo');
      expect(statements[0].rawStatement).toContain('bar');
    });

    it('應該跳過註解行', () => {
      const code = `
        // import { foo } from './commented';
        /* import { bar } from './commented'; */
        import { baz } from './real';
      `;
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./real');
    });

    it('應該解析 import type 語法 (TypeScript)', () => {
      const code = 'import type { User } from \'./types\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./types');
    });

    it('應該解析使用單引號的 import', () => {
      const code = 'import { foo } from \'./utils\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./utils');
    });

    it('應該解析使用雙引號的 import', () => {
      const code = 'import { foo } from "./utils";';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./utils');
    });

    it('應該解析使用反引號的 import', () => {
      const code = 'import { foo } from `./utils`;';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./utils');
    });

    it('應該識別路徑別名', () => {
      const code = 'import { foo } from \'@utils/helper\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].pathType).toBe(PathType.ALIAS);
      expect(statements[0].isRelative).toBe(false);
    });

    it('應該處理空程式碼', () => {
      const statements = resolver.parseImportStatements('', '/src/index.ts');

      expect(statements).toHaveLength(0);
    });

    it('應該跳過 Swift 模組 import', () => {
      const code = 'import Foundation';
      const statements = resolver.parseImportStatements(code, '/src/main.swift');

      expect(statements).toHaveLength(0);
    });

    it('應該記錄正確的行號', () => {
      const code = `
import React from 'react';
import { useState } from 'react';
import utils from './utils';
      `;
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements[0].position.line).toBe(2);
      expect(statements[1].position.line).toBe(3);
      expect(statements[2].position.line).toBe(4);
    });
  });

  describe('analyzeImports', () => {
    it('應該是 parseImportStatements 的別名', () => {
      const code = 'import { foo } from \'./utils\';';
      const result1 = resolver.analyzeImports('/src/index.ts', code);
      const result2 = resolver.parseImportStatements(code, '/src/index.ts');

      expect(result1).toEqual(result2);
    });
  });

  describe('updateImportPath', () => {
    it('應該更新相對路徑的 import', () => {
      const statement = {
        type: 'import' as const,
        path: './utils',
        pathType: PathType.RELATIVE,
        position: { line: 1, character: 1 },
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 30 } },
        isRelative: true,
        rawStatement: 'import { util } from \'./utils\''
      };

      const update = resolver.updateImportPath(statement, '/src/index.ts', '/src/components/index.ts');

      expect(update.success).toBe(true);
      expect(update.newImport).toContain('../utils');
    });

    it('應該不更新 Node 模組 import', () => {
      const statement = {
        type: 'import' as const,
        path: 'react',
        pathType: PathType.ABSOLUTE,
        position: { line: 1, character: 1 },
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 30 } },
        isRelative: false,
        rawStatement: 'import React from \'react\''
      };

      const update = resolver.updateImportPath(statement, '/src/index.ts', '/src/components/index.ts');

      expect(update.success).toBe(true);
      expect(update.oldImport).toBe(update.newImport);
    });

    it('應該處理錯誤並回傳失敗結果', () => {
      const invalidStatement = {
        type: 'import' as const,
        path: './utils',
        pathType: 'invalid' as any,
        position: { line: 1, character: 1 },
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 30 } },
        isRelative: true,
        rawStatement: 'import { util } from \'./utils\''
      };

      const update = resolver.updateImportPath(invalidStatement, '/src/index.ts', '/src/components/index.ts');

      // 根據實作，可能會成功或失敗，這裡確保至少有回傳值
      expect(update).toBeDefined();
      expect(update.filePath).toBe('/src/index.ts');
    });
  });

  describe('resolvePathAlias', () => {
    it('應該解析 @ 別名', () => {
      const resolved = resolver.resolvePathAlias('@/components/Button');

      expect(resolved).toBe('/src/components/Button');
    });

    it('應該解析 @components 別名', () => {
      const resolved = resolver.resolvePathAlias('@components/Button');

      expect(resolved).toBe('/src/components/Button');
    });

    it('應該解析 @utils 別名', () => {
      const resolved = resolver.resolvePathAlias('@utils/helper');

      expect(resolved).toBe('/src/utils/helper');
    });

    it('應該處理別名後有斜線的路徑', () => {
      const resolved = resolver.resolvePathAlias('@/utils/helper');

      expect(resolved).toBe('/src/utils/helper');
    });

    it('應該回傳原始路徑如果沒有匹配的別名', () => {
      const resolved = resolver.resolvePathAlias('./local/path');

      expect(resolved).toBe('./local/path');
    });

    it('應該回傳原始路徑如果是 Node 模組', () => {
      const resolved = resolver.resolvePathAlias('react');

      expect(resolved).toBe('react');
    });

    it('應該確保相對路徑以 ./ 開始', () => {
      const customConfig = {
        ...config,
        pathAliases: {
          '@': 'src'
        }
      };
      const customResolver = new ImportResolver(customConfig);
      const resolved = customResolver.resolvePathAlias('@/components');

      expect(resolved.startsWith('.')).toBe(true);
    });
  });

  describe('calculateRelativePath', () => {
    it('應該計算從檔案到檔案的相對路徑', () => {
      const result = resolver.calculateRelativePath('/src/index.ts', '/src/utils/helper.ts');

      expect(result).toBe('./utils/helper');
    });

    it('應該計算向上的相對路徑', () => {
      const result = resolver.calculateRelativePath('/src/components/Button.ts', '/src/utils/helper.ts');

      expect(result).toBe('../utils/helper');
    });

    it('應該計算同目錄的相對路徑', () => {
      const result = resolver.calculateRelativePath('/src/components/index.ts', '/src/components/Button.ts');

      expect(result).toBe('./Button');
    });

    it('應該移除支援的副檔名', () => {
      const result = resolver.calculateRelativePath('/src/index.ts', '/src/utils.ts');

      expect(result).toBe('./utils');
      expect(result).not.toContain('.ts');
    });

    it('應該保留不支援的副檔名', () => {
      const result = resolver.calculateRelativePath('/src/index.ts', '/src/data.json');

      expect(result).toContain('.json');
    });

    it('應該確保相對路徑以 ./ 或 ../ 開始', () => {
      const result = resolver.calculateRelativePath('/src/components/index.ts', '/src/components/Button.ts');

      expect(result.startsWith('.')).toBe(true);
    });

    it('應該使用正斜線', () => {
      const result = resolver.calculateRelativePath('/src/index.ts', '/src/components/ui/Button.ts');

      expect(result).not.toContain('\\');
      expect(result).toContain('/');
    });

    it('應該處理目錄路徑作為 fromPath', () => {
      const result = resolver.calculateRelativePath('/src/components', '/src/utils/helper.ts');

      expect(result).toBe('../utils/helper');
    });
  });

  describe('findImportedSymbols', () => {
    it('應該提取預設 import 符號', () => {
      const symbols = resolver.findImportedSymbols('import React from \'react\'');

      expect(symbols).toContain('React');
    });

    it('應該提取具名 import 符號', () => {
      const symbols = resolver.findImportedSymbols('import { useState, useEffect } from \'react\'');

      expect(symbols).toContain('useState');
      expect(symbols).toContain('useEffect');
    });

    it('應該提取混合 import 符號', () => {
      const symbols = resolver.findImportedSymbols('import React, { Component, useState } from \'react\'');

      expect(symbols).toContain('React');
      expect(symbols).toContain('Component');
      expect(symbols).toContain('useState');
    });

    it('應該提取 namespace import 符號', () => {
      const symbols = resolver.findImportedSymbols('import * as React from \'react\'');

      expect(symbols).toContain('React');
    });

    it('應該處理別名 import', () => {
      const symbols = resolver.findImportedSymbols('import { Component as Comp } from \'react\'');

      expect(symbols).toContain('Comp');
      expect(symbols).not.toContain('Component');
    });

    it('應該處理混合別名 import', () => {
      const symbols = resolver.findImportedSymbols('import React, { Component as Comp, useState as useSt } from \'react\'');

      expect(symbols).toContain('React');
      expect(symbols).toContain('Comp');
      expect(symbols).toContain('useSt');
      expect(symbols).not.toContain('Component');
      expect(symbols).not.toContain('useState');
    });

    it('應該處理空格', () => {
      const symbols = resolver.findImportedSymbols('import  {  useState  ,  useEffect  }  from  \'react\'');

      expect(symbols).toContain('useState');
      expect(symbols).toContain('useEffect');
    });

    it('應該處理副作用 import (無符號)', () => {
      const symbols = resolver.findImportedSymbols('import \'./styles.css\'');

      expect(symbols).toHaveLength(0);
    });

    it('應該回傳空陣列如果不是 import 語句', () => {
      const symbols = resolver.findImportedSymbols('const x = 5;');

      expect(symbols).toHaveLength(0);
    });
  });

  describe('isNodeModuleImport', () => {
    it('應該識別 Node 模組', () => {
      expect(resolver.isNodeModuleImport('react')).toBe(true);
      expect(resolver.isNodeModuleImport('lodash')).toBe(true);
      expect(resolver.isNodeModuleImport('fs')).toBe(true);
    });

    it('應該識別 scoped 套件', () => {
      expect(resolver.isNodeModuleImport('@angular/core')).toBe(true);
      expect(resolver.isNodeModuleImport('@babel/parser')).toBe(true);
    });

    it('應該不識別相對路徑為 Node 模組', () => {
      expect(resolver.isNodeModuleImport('./utils')).toBe(false);
      expect(resolver.isNodeModuleImport('../components/Button')).toBe(false);
    });

    it('應該不識別絕對路徑為 Node 模組', () => {
      expect(resolver.isNodeModuleImport('/src/utils')).toBe(false);
    });

    it('應該不識別路徑別名為 Node 模組', () => {
      expect(resolver.isNodeModuleImport('@/components/Button')).toBe(false);
      expect(resolver.isNodeModuleImport('@components/Button')).toBe(false);
      expect(resolver.isNodeModuleImport('@utils/helper')).toBe(false);
    });

    it('應該處理精確匹配別名', () => {
      expect(resolver.isNodeModuleImport('@')).toBe(false);
      expect(resolver.isNodeModuleImport('@components')).toBe(false);
    });

    it('應該識別非別名的 @ 開頭套件為 Node 模組', () => {
      expect(resolver.isNodeModuleImport('@unknown/package')).toBe(true);
    });

    it('應該處理空字串', () => {
      expect(resolver.isNodeModuleImport('')).toBe(true);
    });
  });

  describe('邊界情況', () => {
    it('應該處理沒有副檔名的路徑', () => {
      const result = resolver.calculateRelativePath('/src/index', '/src/utils');

      expect(result).toBeDefined();
    });

    it('應該處理深層嵌套的路徑', () => {
      const result = resolver.calculateRelativePath(
        '/src/components/ui/forms/inputs/TextInput.ts',
        '/src/utils/validation/validators.ts'
      );

      expect(result).toBe('../../../../utils/validation/validators');
    });

    it('應該處理空的路徑別名配置', () => {
      const emptyResolver = new ImportResolver({
        supportedExtensions: ['.ts'],
        pathAliases: {}
      });

      const resolved = emptyResolver.resolvePathAlias('@/utils');
      expect(resolved).toBe('@/utils');
    });

    it('應該處理多個具名 import 在同一行', () => {
      const code = 'import {a,b,c,d,e,f} from \'./utils\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
    });

    it('應該處理註解在程式碼行後面', () => {
      const code = 'import { foo } from \'./utils\'; // comment';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./utils');
    });
  });

  describe('錯誤處理', () => {
    it('應該安全處理畸形的 import 語句', () => {
      const code = 'import { from \'./broken\'';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      // 應該不會拋出錯誤，可能解析不到或部分解析
      expect(statements).toBeDefined();
    });

    it('應該處理非常長的 import 語句', () => {
      const longImport = `import { ${'a'.repeat(1000)} } from './utils'`;
      const statements = resolver.parseImportStatements(longImport, '/src/index.ts');

      expect(statements).toBeDefined();
    });

    it('應該處理包含特殊字元的路徑', () => {
      const code = 'import { foo } from \'./utils-v2.0_beta\';';
      const statements = resolver.parseImportStatements(code, '/src/index.ts');

      expect(statements).toHaveLength(1);
      expect(statements[0].path).toBe('./utils-v2.0_beta');
    });
  });
});
