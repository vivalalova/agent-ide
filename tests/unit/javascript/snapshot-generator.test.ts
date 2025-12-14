/**
 * JavaScript Snapshot Generator 測試
 * 測試 JavaScript 的快照生成功能（模組結構、函數簽名、類別定義）
 */

import { describe, it, expect, vi } from 'vitest';
import { SnapshotGenerator } from '@core/snapshot/snapshot-generator.js';
import {
  SnapshotScope,
  type ModuleSnapshot,
  type ProjectSnapshot,
  isProjectSnapshot,
  isModuleSnapshot
} from '@core/snapshot/types.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { DirectoryEntry } from '@infrastructure/storage/types.js';
import { SymbolType, type Symbol } from '@shared/types/index.js';

// Mock IndexEngine 在最上層
vi.mock('@core/shared/indexing/index.js', () => ({
  IndexEngine: class MockIndexEngine {
    constructor() { }
    async indexProject() { }
    async getAllSymbols() {
      return [];
    }
    dispose() { }
  },
  createIndexConfig: vi.fn(),
}));

/**
 * 建立 mock IFileSystem
 */
function createMockFileSystem(files: Map<string, string | DirectoryEntry[]>): IFileSystem {
  return {
    async exists(path: string): Promise<boolean> {
      return files.has(path);
    },
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (typeof content === 'string') {
        return content;
      }
      throw new Error(`Not a file: ${path}`);
    },
    async readDirectory(path: string): Promise<DirectoryEntry[]> {
      const content = files.get(path);
      if (Array.isArray(content)) {
        return content;
      }
      throw new Error(`Not a directory: ${path}`);
    },
    async writeFile(): Promise<void> { },
    async appendFile(): Promise<void> { },
    async deleteFile(): Promise<void> { },
    async createDirectory(): Promise<void> { },
    async deleteDirectory(): Promise<void> { },
    async getStats(): Promise<any> {
      return {};
    },
    async isFile(): Promise<boolean> {
      return false;
    },
    async isDirectory(): Promise<boolean> {
      return false;
    },
    async copyFile(): Promise<void> { },
    async moveFile(): Promise<void> { },
    async glob(): Promise<string[]> {
      return [];
    },
  };
}

/**
 * 建立測試用 Symbol（JavaScript 專用）
 * JavaScript 沒有型別標註，簽章格式略有不同
 */
function createTestSymbol(
  name: string,
  type: SymbolType,
  modifiers: string[] = [],
  scopeName?: string,
  signature?: string,
  typeInfo?: string
): Symbol & { signature?: string; typeInfo?: string } {
  return {
    name,
    type,
    location: {
      filePath: '/test.js',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 10 }
      }
    },
    scope: scopeName ? {
      type: 'class',
      name: scopeName,
      parent: undefined
    } : undefined,
    modifiers,
    signature,
    typeInfo
  };
}

describe('SnapshotGenerator - JavaScript', () => {
  describe('detectScope - JavaScript 模組', () => {
    it('應該偵測為 Module scope（有 index.js）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/module/index.js', 'export default {}'],
      ]);
      const mockFs = createMockFileSystem(files);
      const generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/module');

      expect('module' in result && !('modules' in result)).toBe(true);
    });

    it('應該偵測為 Project scope（有 package.json + src 含 index.js）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', [
          { name: 'core', path: '/project/src/core', isFile: false, isDirectory: true },
        ]],
        ['/project/src/core', [
          { name: 'index.js', path: '/project/src/core/index.js', isFile: true, isDirectory: false },
        ]],
      ]);
      const mockFs = createMockFileSystem(files);
      const generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project');

      expect('modules' in result).toBe(true);
    });
  });

  describe('generateModuleSnapshot - JavaScript 模組快照', () => {
    it('應該產生空模組快照（無符號）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/module/index.js', 'export default {}'],
      ]);
      const mockFs = createMockFileSystem(files);
      const generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/module') as ModuleSnapshot;

      expect(result.module).toBe('module');
      expect(result.api).toEqual({});
      expect(result.factories).toEqual({});
      expect(result.types).toEqual({});
      expect(result.private).toEqual({});
    });
  });

  describe('generateProjectSnapshot - JavaScript 專案快照', () => {
    it('應該找出所有 JavaScript 模組', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', [
          { name: 'utils', path: '/project/src/utils', isFile: false, isDirectory: true },
          { name: 'services', path: '/project/src/services', isFile: false, isDirectory: true },
        ]],
        ['/project/src/utils', [
          { name: 'index.js', path: '/project/src/utils/index.js', isFile: true, isDirectory: false },
        ]],
        ['/project/src/services', [
          { name: 'index.js', path: '/project/src/services/index.js', isFile: true, isDirectory: false },
        ]],
      ]);
      const mockFs = createMockFileSystem(files);
      const generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(result.project).toBe('project');
      expect(Object.keys(result.modules)).toContain('src/utils');
      expect(Object.keys(result.modules)).toContain('src/services');
    });

    it('應該支援混合 TS 和 JS 模組', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', [
          { name: 'core', path: '/project/src/core', isFile: false, isDirectory: true },
          { name: 'legacy', path: '/project/src/legacy', isFile: false, isDirectory: true },
        ]],
        ['/project/src/core', [
          { name: 'index.ts', path: '/project/src/core/index.ts', isFile: true, isDirectory: false },
        ]],
        ['/project/src/legacy', [
          { name: 'index.js', path: '/project/src/legacy/index.js', isFile: true, isDirectory: false },
        ]],
      ]);
      const mockFs = createMockFileSystem(files);
      const generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(Object.keys(result.modules)).toContain('src/core');
      expect(Object.keys(result.modules)).toContain('src/legacy');
    });
  });

  describe('buildModuleSnapshot - JavaScript API 提取', () => {
    it('應該提取 ES6 class 的公開方法', () => {
      const symbols: Symbol[] = [
        createTestSymbol('UserService', SymbolType.Class),
        createTestSymbol('getUser', SymbolType.Function, [], 'UserService', 'getUser(id)'),
        createTestSymbol('updateUser', SymbolType.Function, [], 'UserService', 'updateUser(id, data)'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.UserService).toBeDefined();
      expect(result.api.UserService.getUser).toBe('(id) → void');
      expect(result.api.UserService.updateUser).toBe('(id, data) → void');
    });

    it('應該忽略私有方法（以 _ 開頭的慣例）', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('publicMethod', SymbolType.Function, [], 'MyClass', 'publicMethod()'),
        createTestSymbol('_privateMethod', SymbolType.Function, ['private'], 'MyClass', '_privateMethod()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.publicMethod).toBeDefined();
      expect(result.api.MyClass._privateMethod).toBeUndefined();
    });

    it('應該處理無方法的 ES6 class', () => {
      const symbols: Symbol[] = [
        createTestSymbol('EmptyClass', SymbolType.Class),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.EmptyClass).toBeUndefined();
    });

    it('應該忽略 constructor', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('constructor', SymbolType.Function, [], 'MyClass', 'constructor(options)'),
        createTestSymbol('init', SymbolType.Function, [], 'MyClass', 'init()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(Object.hasOwn(result.api.MyClass, 'constructor')).toBe(false);
      expect(result.api.MyClass.init).toBeDefined();
    });
  });

  describe('buildModuleSnapshot - JavaScript Factories 提取', () => {
    it('應該提取 createXxx 工廠函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('createApp', SymbolType.Function, [], undefined, 'createApp(config)'),
        createTestSymbol('createRouter', SymbolType.Function, [], undefined, 'createRouter()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.factories.createApp).toBe('(config) → void');
      expect(result.factories.createRouter).toBe('() → void');
    });

    it('應該忽略非 createXxx 的函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('createUser', SymbolType.Function, [], undefined, 'createUser(name, {})'),
        createTestSymbol('initApp', SymbolType.Function, [], undefined, 'initApp()'),
        createTestSymbol('setupConfig', SymbolType.Function, [], undefined, 'setupConfig()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.factories.createUser).toBeDefined();
      expect(result.factories.initApp).toBeUndefined();
      expect(result.factories.setupConfig).toBeUndefined();
    });

    it('應該處理無簽章的工廠函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('createEmpty', SymbolType.Function, [], undefined),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.factories.createEmpty).toBe('() → unknown');
    });
  });

  describe('buildModuleSnapshot - JavaScript Private 提取', () => {
    it('應該提取 class 的私有欄位', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('_data', SymbolType.Property, [], 'MyClass'),
        createTestSymbol('_config', SymbolType.Variable, [], 'MyClass'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.private.MyClass).toBeDefined();
      expect(result.private.MyClass.fields).toContain('_data');
      expect(result.private.MyClass.fields).toContain('_config');
      expect(result.private.MyClass.imports).toBe('');
    });

    it('應該處理無欄位的 class', () => {
      const symbols: Symbol[] = [
        createTestSymbol('EmptyClass', SymbolType.Class),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.private.EmptyClass).toBeUndefined();
    });
  });

  describe('buildModuleSnapshot - JavaScript 綜合測試', () => {
    it('應該處理空符號陣列', () => {
      const symbols: Symbol[] = [];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('empty', symbols, '/empty');

      expect(result.module).toBe('empty');
      expect(result.api).toEqual({});
      expect(result.factories).toEqual({});
      expect(result.types).toEqual({});
      expect(result.private).toEqual({});
    });

    it('應該處理混合 JavaScript 符號', () => {
      const symbols: Symbol[] = [
        // ES6 Class with methods and fields
        createTestSymbol('ApiClient', SymbolType.Class),
        createTestSymbol('fetch', SymbolType.Function, [], 'ApiClient', 'fetch(url, options)'),
        createTestSymbol('_baseUrl', SymbolType.Property, [], 'ApiClient'),

        // Factory function
        createTestSymbol('createApiClient', SymbolType.Function, [], undefined, 'createApiClient(config)'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('api', symbols, '/api');

      expect(result.module).toBe('api');
      expect(result.api.ApiClient.fetch).toBe('(url, options) → void');
      expect(result.factories.createApiClient).toBe('(config) → void');
      expect(result.private.ApiClient.fields).toContain('_baseUrl');
    });

    it('應該處理 ES6 模組模式', () => {
      const symbols: Symbol[] = [
        // Named exports as functions
        createTestSymbol('createStore', SymbolType.Function, [], undefined, 'createStore(reducer)'),
        createTestSymbol('createAction', SymbolType.Function, [], undefined, 'createAction(type, payload)'),

        // Helper class
        createTestSymbol('Store', SymbolType.Class),
        createTestSymbol('dispatch', SymbolType.Function, [], 'Store', 'dispatch(action)'),
        createTestSymbol('getState', SymbolType.Function, [], 'Store', 'getState()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('store', symbols, '/store');

      expect(result.factories.createStore).toBe('(reducer) → void');
      expect(result.factories.createAction).toBe('(type, payload) → void');
      expect(result.api.Store.dispatch).toBe('(action) → void');
      expect(result.api.Store.getState).toBe('() → void');
    });
  });

  describe('簽章格式化 - JavaScript 特定', () => {
    it('應該處理無參數的函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('noop', SymbolType.Function, [], 'MyClass', 'noop()'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.noop).toBe('() → void');
    });

    it('應該處理多參數函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('add', SymbolType.Function, [], 'MyClass', 'add(a, b, c)'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.add).toBe('(a, b, c) → void');
    });

    it('應該處理解構參數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('configure', SymbolType.Function, [], 'MyClass', 'configure({ host, port })'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.configure).toBe('({ host, port }) → void');
    });

    it('應該處理剩餘參數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('log', SymbolType.Function, [], 'MyClass', 'log(...args)'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.log).toBe('(...args) → void');
    });

    it('應該處理預設參數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('greet', SymbolType.Function, [], 'MyClass', 'greet(name = "World")'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.greet).toBe('(name = "World") → void');
    });

    it('應該處理無簽章的方法（回退到 unknown）', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('noSig', SymbolType.Function, [], 'MyClass'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.noSig).toBe('() → unknown');
    });
  });

  describe('scope 匹配邊界條件 - JavaScript', () => {
    it('應該處理 scope.parent.name 匹配', () => {
      const classSymbol = createTestSymbol('MyClass', SymbolType.Class);
      const methodSymbol = createTestSymbol('method', SymbolType.Function, [], 'MethodScope');
      // 模擬 method 的 scope.parent 是 class
      (methodSymbol.scope as any).parent = {
        type: 'class',
        name: 'MyClass',
        parent: undefined
      };

      const symbols: Symbol[] = [classSymbol, methodSymbol];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass?.method).toBeDefined();
    });

    it('應該處理 scope.name 直接匹配', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('method', SymbolType.Function, [], 'MyClass'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass?.method).toBeDefined();
    });

    it('應該處理 scope 不匹配的方法', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('method', SymbolType.Function, [], 'OtherClass'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass).toBeUndefined();
    });

    it('應該處理無 scope 的符號', () => {
      const noScopeSymbol = createTestSymbol('func', SymbolType.Function);
      noScopeSymbol.scope = undefined;

      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        noScopeSymbol,
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass).toBeUndefined();
    });
  });
});

// ===== 型別守衛測試（與 TypeScript 版本共用邏輯） =====

describe('Snapshot Type Guards - JavaScript Context', () => {
  describe('isProjectSnapshot', () => {
    it('應該回傳 true 對 ProjectSnapshot（含 JS 模組）', () => {
      const projectSnapshot: ProjectSnapshot = {
        project: 'js-project',
        modules: {
          'src/utils': {
            module: 'src/utils',
            api: {},
            factories: {},
            types: {},
            private: {}
          }
        }
      };

      expect(isProjectSnapshot(projectSnapshot)).toBe(true);
    });

    it('應該回傳 false 對 ModuleSnapshot', () => {
      const moduleSnapshot: ModuleSnapshot = {
        module: 'src/utils',
        api: {},
        factories: {},
        types: {},
        private: {}
      };

      expect(isProjectSnapshot(moduleSnapshot)).toBe(false);
    });
  });

  describe('isModuleSnapshot', () => {
    it('應該回傳 true 對 ModuleSnapshot', () => {
      const moduleSnapshot: ModuleSnapshot = {
        module: 'src/utils',
        api: {},
        factories: {},
        types: {},
        private: {}
      };

      expect(isModuleSnapshot(moduleSnapshot)).toBe(true);
    });

    it('應該回傳 false 對 ProjectSnapshot', () => {
      const projectSnapshot: ProjectSnapshot = {
        project: 'js-project',
        modules: {}
      };

      expect(isModuleSnapshot(projectSnapshot)).toBe(false);
    });
  });
});
