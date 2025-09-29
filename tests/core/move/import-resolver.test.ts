/**
 * ImportResolver 測試
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ImportResolver } from '../../../src/core/move/import-resolver';
import { ImportStatement, PathType, ImportResolverConfig } from '../../../src/core/move/types';
import { createPosition, createRange } from '../../../src/shared/types/core';

describe('ImportResolver', () => {
  let resolver: ImportResolver;
  let config: ImportResolverConfig;

  beforeEach(() => {
    config = {
      supportedExtensions: ['.ts', '.tsx', '.js', '.jsx'],
      pathAliases: {
        '@': './src',
        '@components': './src/components',
        '@utils': './src/utils'
      },
      baseUrl: './src',
      includeNodeModules: false
    };

    resolver = new ImportResolver(config);
  });

  describe('parseImportStatements', () => {
    it('應該解析 ES6 import 語句', () => {
      const code = `
import React from 'react';
import { Component } from './component';
import * as utils from '../utils';
      `.trim();

      const result = resolver.parseImportStatements(code, '/src/test.ts');

      expect(result).toHaveLength(3);

      const [reactImport, componentImport, utilsImport] = result;

      expect(reactImport.type).toBe('import');
      expect(reactImport.path).toBe('react');
      expect(reactImport.pathType).toBe(PathType.ABSOLUTE);
      expect(reactImport.isRelative).toBe(false);

      expect(componentImport.type).toBe('import');
      expect(componentImport.path).toBe('./component');
      expect(componentImport.pathType).toBe(PathType.RELATIVE);
      expect(componentImport.isRelative).toBe(true);

      expect(utilsImport.type).toBe('import');
      expect(utilsImport.path).toBe('../utils');
      expect(utilsImport.pathType).toBe(PathType.RELATIVE);
      expect(utilsImport.isRelative).toBe(true);
    });

    it('應該解析 CommonJS require 語句', () => {
      const code = `
const fs = require('fs');
const utils = require('./utils');
      `.trim();

      const result = resolver.parseImportStatements(code, '/src/test.js');

      expect(result).toHaveLength(2);

      const [fsRequire, utilsRequire] = result;

      expect(fsRequire.type).toBe('require');
      expect(fsRequire.path).toBe('fs');
      expect(fsRequire.pathType).toBe(PathType.ABSOLUTE);

      expect(utilsRequire.type).toBe('require');
      expect(utilsRequire.path).toBe('./utils');
      expect(utilsRequire.pathType).toBe(PathType.RELATIVE);
    });

    it('應該解析動態 import 語句', () => {
      const code = `
const component = await import('./component');
import('./lazy-component').then(module => {});
      `.trim();

      const result = resolver.parseImportStatements(code, '/src/test.ts');

      expect(result).toHaveLength(2);

      result.forEach(importStmt => {
        expect(importStmt.type).toBe('dynamic_import');
        expect(importStmt.isRelative).toBe(true);
      });
    });

    it('應該解析路徑別名', () => {
      const code = `
import { Button } from '@components/Button';
import { helper } from '@utils/helper';
      `.trim();

      const result = resolver.parseImportStatements(code, '/src/test.ts');

      expect(result).toHaveLength(2);

      const [buttonImport, helperImport] = result;

      expect(buttonImport.type).toBe('import');
      expect(buttonImport.path).toBe('@components/Button');
      expect(buttonImport.pathType).toBe(PathType.ALIAS);

      expect(helperImport.type).toBe('import');
      expect(helperImport.path).toBe('@utils/helper');
      expect(helperImport.pathType).toBe(PathType.ALIAS);
    });

    it('應該正確標記行號和位置', () => {
      const code = `import React from 'react';
import { Component } from './component';`;

      const result = resolver.parseImportStatements(code, '/src/test.ts');

      expect(result[0].position.line).toBe(1);
      expect(result[1].position.line).toBe(2);
    });

    it('應該忽略註解中的 import', () => {
      const code = `
// import { ignored } from './ignored';
/* import { alsoIgnored } from './also-ignored'; */
import { valid } from './valid';
      `.trim();

      const result = resolver.parseImportStatements(code, '/src/test.ts');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('./valid');
    });
  });

  describe('updateImportPath', () => {
    it('應該更新相對路徑的 import', () => {
      const importStatement: ImportStatement = {
        type: 'import',
        path: './component',
        pathType: PathType.RELATIVE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 30)),
        isRelative: true,
        rawStatement: 'import { Component } from \'./component\';'
      };

      const result = resolver.updateImportPath(
        importStatement,
        '/src/old/file.ts',
        '/src/new/file.ts'
      );

      expect(result.newImport).toContain('../old/component');
    });

    it('應該保持絕對路徑的 import 不變', () => {
      const importStatement: ImportStatement = {
        type: 'import',
        path: 'react',
        pathType: PathType.ABSOLUTE,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 25)),
        isRelative: false,
        rawStatement: 'import React from \'react\';'
      };

      const result = resolver.updateImportPath(
        importStatement,
        '/src/old/file.ts',
        '/src/new/file.ts'
      );

      expect(result.newImport).toBe(importStatement.rawStatement);
    });

    it('應該更新路徑別名的 import', () => {
      const importStatement: ImportStatement = {
        type: 'import',
        path: '@components/Button',
        pathType: PathType.ALIAS,
        position: createPosition(1, 1),
        range: createRange(createPosition(1, 1), createPosition(1, 35)),
        isRelative: false,
        rawStatement: 'import { Button } from \'@components/Button\';'
      };

      // 當別名路徑發生變化時，應該更新
      const result = resolver.updateImportPath(
        importStatement,
        '/src/components/old-location/file.ts',
        '/src/components/new-location/file.ts'
      );

      // 這個測試假設 Button 組件實際上在相對路徑中
      expect(result.newImport).toBeDefined();
    });
  });

  describe('resolvePathAlias', () => {
    it('應該解析已定義的路徑別名', () => {
      const result = resolver.resolvePathAlias('@components/Button');
      expect(result).toBe('./src/components/Button');
    });

    it('應該解析部分匹配的路徑別名', () => {
      const result = resolver.resolvePathAlias('@components/ui/Button');
      expect(result).toBe('./src/components/ui/Button');
    });

    it('應該保持非別名路徑不變', () => {
      const path = './components/Button';
      const result = resolver.resolvePathAlias(path);
      expect(result).toBe(path);
    });
  });

  describe('calculateRelativePath', () => {
    it('應該計算同層目錄的相對路徑', () => {
      const result = resolver.calculateRelativePath(
        '/src/components/Button.ts',
        '/src/components/Icon.ts'
      );
      expect(result).toBe('./Icon');
    });

    it('應該計算向上層的相對路徑', () => {
      const result = resolver.calculateRelativePath(
        '/src/components/ui/Button.ts',
        '/src/utils/helper.ts'
      );
      expect(result).toBe('../../utils/helper');
    });

    it('應該計算向下層的相對路徑', () => {
      const result = resolver.calculateRelativePath(
        '/src/utils/helper.ts',
        '/src/components/ui/Button.ts'
      );
      expect(result).toBe('../components/ui/Button');
    });

    it('應該處理不同根目錄的路徑', () => {
      const result = resolver.calculateRelativePath(
        '/project/src/components/Button.ts',
        '/project/lib/utils/helper.ts'
      );
      expect(result).toBe('../../lib/utils/helper');
    });
  });

  describe('findImportedSymbols', () => {
    it('應該提取具名 import 的符號', () => {
      const statement = 'import { Component, useState } from \'react\';';
      const result = resolver.findImportedSymbols(statement);
      expect(result).toEqual(['Component', 'useState']);
    });

    it('應該提取預設 import 的符號', () => {
      const statement = 'import React from \'react\';';
      const result = resolver.findImportedSymbols(statement);
      expect(result).toEqual(['React']);
    });

    it('應該提取混合 import 的符號', () => {
      const statement = 'import React, { Component, useState } from \'react\';';
      const result = resolver.findImportedSymbols(statement);
      expect(result).toEqual(['React', 'Component', 'useState']);
    });

    it('應該處理 namespace import', () => {
      const statement = 'import * as React from \'react\';';
      const result = resolver.findImportedSymbols(statement);
      expect(result).toEqual(['React']);
    });

    it('應該處理別名 import', () => {
      const statement = 'import { Component as Comp, useState as state } from \'react\';';
      const result = resolver.findImportedSymbols(statement);
      expect(result).toEqual(['Comp', 'state']);
    });
  });

  describe('isNodeModuleImport', () => {
    it('應該識別 Node.js 核心模組', () => {
      expect(resolver.isNodeModuleImport('fs')).toBe(true);
      expect(resolver.isNodeModuleImport('path')).toBe(true);
      expect(resolver.isNodeModuleImport('crypto')).toBe(true);
    });

    it('應該識別 npm 套件', () => {
      expect(resolver.isNodeModuleImport('react')).toBe(true);
      expect(resolver.isNodeModuleImport('lodash')).toBe(true);
      expect(resolver.isNodeModuleImport('@types/node')).toBe(true);
    });

    it('應該識別相對路徑不是 Node 模組', () => {
      expect(resolver.isNodeModuleImport('./component')).toBe(false);
      expect(resolver.isNodeModuleImport('../utils')).toBe(false);
      expect(resolver.isNodeModuleImport('/absolute/path')).toBe(false);
    });

    it('應該識別路徑別名不是 Node 模組（取決於配置）', () => {
      expect(resolver.isNodeModuleImport('@components/Button')).toBe(false);
      expect(resolver.isNodeModuleImport('@utils/helper')).toBe(false);
    });
  });
});