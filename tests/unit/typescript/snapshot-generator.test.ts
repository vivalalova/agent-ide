import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
vi.mock('@core/indexing/index.js', () => ({
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
 * 建立測試用 Symbol
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
      filePath: '/test.ts',
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

describe('SnapshotGenerator', () => {
  let generator: SnapshotGenerator;
  let mockFs: IFileSystem;

  describe('detectScope', () => {
    it('應該偵測為 Project scope（有 package.json + src）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', []],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project');

      expect('modules' in result).toBe(true);
    });

    it('應該偵測為 Module scope（有 index.ts）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/module/index.ts', 'export {}'],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/module');

      expect('module' in result && !('modules' in result)).toBe(true);
    });

    it('應該偵測為 Module scope（無 package.json 無 index.ts）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>();
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/unknown');

      expect('module' in result && !('modules' in result)).toBe(true);
    });

    it('應該偵測為 Module scope（有 package.json 但無 src）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/lib/package.json', '{}'],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/lib');

      expect('module' in result && !('modules' in result)).toBe(true);
    });
  });

  describe('generateModuleSnapshot', () => {
    it('應該產生空模組快照（無符號）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/module/index.ts', 'export {}'],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/module') as ModuleSnapshot;

      expect(result.module).toBe('module');
      expect(result.api).toEqual({});
      expect(result.factories).toEqual({});
      expect(result.types).toEqual({});
      expect(result.private).toEqual({});
    });
  });

  describe('generateProjectSnapshot', () => {
    it('應該產生空專案快照（無模組）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', []],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(result.project).toBe('project');
      expect(result.modules).toEqual({});
    });

    it('應該找出所有模組（包含嵌套）', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', [
          { name: 'core', path: '/project/src/core', isFile: false, isDirectory: true },
          { name: 'utils', path: '/project/src/utils', isFile: false, isDirectory: true },
        ]],
        ['/project/src/core', [
          { name: 'index.ts', path: '/project/src/core/index.ts', isFile: true, isDirectory: false },
          { name: 'sub', path: '/project/src/core/sub', isFile: false, isDirectory: true },
        ]],
        ['/project/src/core/sub', [
          { name: 'index.ts', path: '/project/src/core/sub/index.ts', isFile: true, isDirectory: false },
        ]],
        ['/project/src/utils', [
          { name: 'index.js', path: '/project/src/utils/index.js', isFile: true, isDirectory: false },
        ]],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(result.project).toBe('project');
      expect(Object.keys(result.modules)).toContain('src/core');
      expect(Object.keys(result.modules)).toContain('src/core/sub');
      expect(Object.keys(result.modules)).toContain('src/utils');
    });

    it('應該忽略隱藏目錄', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', [
          { name: 'core', path: '/project/src/core', isFile: false, isDirectory: true },
          { name: '.hidden', path: '/project/src/.hidden', isFile: false, isDirectory: true },
        ]],
        ['/project/src/core', [
          { name: 'index.ts', path: '/project/src/core/index.ts', isFile: true, isDirectory: false },
        ]],
        ['/project/src/.hidden', [
          { name: 'index.ts', path: '/project/src/.hidden/index.ts', isFile: true, isDirectory: false },
        ]],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(Object.keys(result.modules)).toContain('src/core');
      expect(Object.keys(result.modules)).not.toContain('src/.hidden');
    });

    it('應該處理不存在的 src 目錄', async () => {
      const files = new Map<string, string | DirectoryEntry[]>([
        ['/project/package.json', '{}'],
        ['/project/src', []],
      ]);
      mockFs = createMockFileSystem(files);
      generator = new SnapshotGenerator(mockFs);

      const result = await generator.generate('/project') as ProjectSnapshot;

      expect(result.project).toBe('project');
      expect(result.modules).toEqual({});
    });
  });

  describe('buildModuleSnapshot - API 提取', () => {
    it('應該提取 class 的公開方法', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('publicMethod', SymbolType.Function, [], 'MyClass', 'publicMethod(x: number): string'),
        createTestSymbol('anotherMethod', SymbolType.Function, [], 'MyClass', 'anotherMethod(): void'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass).toBeDefined();
      expect(result.api.MyClass.publicMethod).toBe('(x: number) → string');
      expect(result.api.MyClass.anotherMethod).toBe('() → void');
    });

    it('應該忽略私有方法', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('publicMethod', SymbolType.Function, [], 'MyClass', 'publicMethod(): void'),
        createTestSymbol('privateMethod', SymbolType.Function, ['private'], 'MyClass', 'privateMethod(): void'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.publicMethod).toBeDefined();
      expect(result.api.MyClass.privateMethod).toBeUndefined();
    });

    it('應該忽略 constructor', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('constructor', SymbolType.Function, [], 'MyClass', 'constructor(x: number)'),
        createTestSymbol('method', SymbolType.Function, [], 'MyClass', 'method(): void'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(Object.hasOwn(result.api.MyClass, 'constructor')).toBe(false);
      expect(result.api.MyClass.method).toBeDefined();
    });

    it('應該處理無方法的 class', () => {
      const symbols: Symbol[] = [
        createTestSymbol('EmptyClass', SymbolType.Class),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.EmptyClass).toBeUndefined();
    });

    it('應該處理帶泛型的方法簽章', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('generic', SymbolType.Function, [], 'MyClass', 'generic<T>(item: T): T[]'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.generic).toBe('(item: T) → T[]');
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

  describe('buildModuleSnapshot - Factories 提取', () => {
    it('應該提取 createXxx 工廠函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('createUser', SymbolType.Function, [], undefined, 'createUser(name: string): User'),
        createTestSymbol('createDatabase', SymbolType.Function, [], undefined, 'createDatabase(): Database'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.factories.createUser).toBe('(name: string) → User');
      expect(result.factories.createDatabase).toBe('() → Database');
    });

    it('應該忽略非 createXxx 的函數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('createUser', SymbolType.Function, [], undefined, 'createUser(): User'),
        createTestSymbol('helper', SymbolType.Function, [], undefined, 'helper(): void'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.factories.createUser).toBeDefined();
      expect(result.factories.helper).toBeUndefined();
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

  describe('buildModuleSnapshot - Types 提取', () => {
    it('應該提取 interface 的欄位', () => {
      const symbols: Symbol[] = [
        createTestSymbol('User', SymbolType.Interface),
        createTestSymbol('name', SymbolType.Property, [], 'User', undefined, 'string'),
        createTestSymbol('age', SymbolType.Property, [], 'User', undefined, 'number'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.types.User).toBe('{name: string, age: number}');
    });

    it('應該提取空 interface', () => {
      const symbols: Symbol[] = [
        createTestSymbol('Empty', SymbolType.Interface),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.types.Empty).toBe('{}');
    });

    it('應該提取 type alias', () => {
      const symbols: Symbol[] = [
        createTestSymbol('ID', SymbolType.Type, [], undefined, undefined, 'string | number'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.types.ID).toBe('string | number');
    });

    it('應該處理無型別資訊的 type alias', () => {
      const symbols: Symbol[] = [
        createTestSymbol('Unknown', SymbolType.Type),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.types.Unknown).toBe('{}');
    });

    it('應該處理 interface 欄位無型別資訊', () => {
      const symbols: Symbol[] = [
        createTestSymbol('Config', SymbolType.Interface),
        createTestSymbol('value', SymbolType.Property, [], 'Config'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.types.Config).toBe('{value}');
    });
  });

  describe('buildModuleSnapshot - Private 提取', () => {
    it('應該提取 class 的私有欄位', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('field1', SymbolType.Property, [], 'MyClass'),
        createTestSymbol('field2', SymbolType.Variable, [], 'MyClass'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.private.MyClass).toBeDefined();
      expect(result.private.MyClass.fields).toContain('field1');
      expect(result.private.MyClass.fields).toContain('field2');
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

  describe('buildModuleSnapshot - 綜合測試', () => {
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

    it('應該處理混合符號', () => {
      const symbols: Symbol[] = [
        // Class with methods and fields
        createTestSymbol('User', SymbolType.Class),
        createTestSymbol('getName', SymbolType.Function, [], 'User', 'getName(): string'),
        createTestSymbol('name', SymbolType.Property, [], 'User'),

        // Factory
        createTestSymbol('createUser', SymbolType.Function, [], undefined, 'createUser(name: string): User'),

        // Interface
        createTestSymbol('Config', SymbolType.Interface),
        createTestSymbol('port', SymbolType.Property, [], 'Config', undefined, 'number'),

        // Type
        createTestSymbol('ID', SymbolType.Type, [], undefined, undefined, 'string'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('mixed', symbols, '/mixed');

      expect(result.module).toBe('mixed');
      expect(result.api.User.getName).toBe('() → string');
      expect(result.factories.createUser).toBe('(name: string) → User');
      expect(result.types.Config).toBe('{port: number}');
      expect(result.types.ID).toBe('string');
      expect(result.private.User.fields).toContain('name');
    });
  });

  describe('簽章格式化邊界條件', () => {
    it('應該處理無參數無返回值', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('noop', SymbolType.Function, [], 'MyClass', 'noop(): void'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.noop).toBe('() → void');
    });

    it('應該處理多參數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('add', SymbolType.Function, [], 'MyClass', 'add(a: number, b: number, c: number): number'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.add).toBe('(a: number, b: number, c: number) → number');
    });

    it('應該處理複雜型別參數', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('complex', SymbolType.Function, [], 'MyClass', 'complex(obj: { a: string, b: number }): boolean'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.complex).toBe('(obj: { a: string, b: number }) → boolean');
    });

    it('應該處理無返回型別的簽章', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('implicit', SymbolType.Function, [], 'MyClass', 'implicit(x: number)'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      expect(result.api.MyClass.implicit).toBe('(x: number) → void');
    });

    it('應該處理格式錯誤的簽章', () => {
      const symbols: Symbol[] = [
        createTestSymbol('MyClass', SymbolType.Class),
        createTestSymbol('bad', SymbolType.Function, [], 'MyClass', 'invalid signature format'),
      ];

      const fs = createMockFileSystem(new Map());
      const gen = new SnapshotGenerator(fs);
      const result = (gen as any).buildModuleSnapshot('test', symbols, '/test');

      // 格式錯誤時，原樣返回
      expect(result.api.MyClass.bad).toBe('invalid signature format');
    });
  });

  describe('scope 匹配邊界條件', () => {
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

// ===== 型別守衛測試 =====

describe('Snapshot Type Guards', () => {
  describe('isProjectSnapshot', () => {
    it('應該回傳 true 對 ProjectSnapshot', () => {
      const projectSnapshot: ProjectSnapshot = {
        project: 'test-project',
        modules: {
          'src/core': {
            module: 'src/core',
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
        module: 'src/core',
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
        module: 'src/core',
        api: {},
        factories: {},
        types: {},
        private: {}
      };

      expect(isModuleSnapshot(moduleSnapshot)).toBe(true);
    });

    it('應該回傳 false 對 ProjectSnapshot', () => {
      const projectSnapshot: ProjectSnapshot = {
        project: 'test-project',
        modules: {}
      };

      expect(isModuleSnapshot(projectSnapshot)).toBe(false);
    });

    it('應該正確區分相似結構', () => {
      // ModuleSnapshot 有 module 屬性，沒有 modules 屬性
      const moduleSnapshot: ModuleSnapshot = {
        module: 'test',
        api: {},
        factories: {},
        types: {},
        private: {}
      };

      // ProjectSnapshot 有 modules 屬性
      const projectSnapshot: ProjectSnapshot = {
        project: 'test',
        modules: {
          'test': moduleSnapshot
        }
      };

      expect(isModuleSnapshot(moduleSnapshot)).toBe(true);
      expect(isModuleSnapshot(projectSnapshot)).toBe(false);
      expect(isProjectSnapshot(moduleSnapshot)).toBe(false);
      expect(isProjectSnapshot(projectSnapshot)).toBe(true);
    });
  });
});
