/**
 * IndexEngine 測試
 * 測試索引引擎的核心功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IndexEngine } from '../../../src/core/indexing/index-engine';
import { createIndexConfig, createSearchOptions } from '../../../src/core/indexing/types';
import { SymbolType } from '../../../src/shared/types';
import { vol } from 'memfs';
import { ParserRegistry } from '../../../src/infrastructure/parser/registry';
import type { ParserPlugin, AST, Symbol, Reference, Dependency, Position, Range } from '../../../src/shared/types';
import type { CodeEdit, Definition, Usage, ValidationResult } from '../../../src/infrastructure/parser/types';

// Mock file system
vi.mock('fs/promises', async () => {
  const { vol } = await import('memfs');
  return {
    readFile: vi.fn((path: string) => vol.promises.readFile(path, 'utf-8')),
    stat: vi.fn((path: string) => vol.promises.stat(path)),
    readdir: vi.fn((path: string) => vol.promises.readdir(path)),
    access: vi.fn((path: string) => vol.promises.access(path))
  };
});

vi.mock('fs', () => vol);

// Mock glob to work with memfs
vi.mock('glob', () => ({
  glob: vi.fn(async (pattern: string) => {
    const fs = vol as any;
    const files: string[] = [];

    // Simple glob pattern matching for memfs
    const walkDir = (dir: string) => {
      try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
          const fullPath = `${dir}/${item}`;
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            // 排除 node_modules 和 test 目錄
            if (!item.includes('node_modules') && !item.includes('test')) {
              walkDir(fullPath);
            }
          } else if (stat.isFile()) {
            // Check file extension
            if (pattern.includes('*.ts') && fullPath.endsWith('.ts')) {
              files.push(fullPath);
            } else if (pattern.includes('*.tsx') && fullPath.endsWith('.tsx')) {
              files.push(fullPath);
            } else if (pattern.includes('*.js') && fullPath.endsWith('.js')) {
              files.push(fullPath);
            } else if (pattern.includes('*.jsx') && fullPath.endsWith('.jsx')) {
              files.push(fullPath);
            }
          }
        }
      } catch (e) {
        // Directory doesn't exist
      }
    };

    // Extract base directory from pattern
    const baseDir = pattern.split('/**')[0];
    walkDir(baseDir);

    return files;
  })
}));

// Mock TypeScript Parser Plugin
class MockTypeScriptParser implements ParserPlugin {
  readonly name = 'typescript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.ts', '.tsx', '.js', '.jsx'] as const;
  readonly supportedLanguages = ['typescript', 'javascript'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    // 檢查語法錯誤，模擬解析失敗
    if (code.includes('export function broken(') && !code.includes(') {')) {
      throw new Error(`語法錯誤：函數定義不完整`);
    }

    const root = {
      type: 'Program',
      children: [],
      range: { start: 0, end: code.length },
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: code.length } }
    };

    return {
      type: 'Program',
      root,
      sourceFile: filePath,
      metadata: { version: '1.0' }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];
    const sourceCode = vol.readFileSync(ast.sourceFile, 'utf8') as string;

    // Extract function declarations
    const functionMatches = sourceCode.matchAll(/(?:export\s+)?function\s+(\w+)/g);
    for (const match of functionMatches) {
      symbols.push({
        name: match[1],
        type: 'function' as const,
        position: {
          start: match.index || 0,
          end: (match.index || 0) + match[0].length,
          line: 1,
          column: match.index || 0
        },
        scope: 'global',
        modifiers: match[0].includes('export') ? ['export'] : []
      });
    }

    // Extract class declarations
    const classMatches = sourceCode.matchAll(/(?:export\s+)?class\s+(\w+)/g);
    for (const match of classMatches) {
      symbols.push({
        name: match[1],
        type: 'class' as const,
        position: {
          start: match.index || 0,
          end: (match.index || 0) + match[0].length,
          line: 1,
          column: match.index || 0
        },
        scope: 'global',
        modifiers: match[0].includes('export') ? ['export'] : []
      });
    }

    // Extract interface declarations (TypeScript)
    const interfaceMatches = sourceCode.matchAll(/(?:export\s+)?interface\s+(\w+)/g);
    for (const match of interfaceMatches) {
      symbols.push({
        name: match[1],
        type: 'interface' as const,
        position: {
          start: match.index || 0,
          end: (match.index || 0) + match[0].length,
          line: 1,
          column: match.index || 0
        },
        scope: 'global',
        modifiers: match[0].includes('export') ? ['export'] : []
      });
    }

    // Extract const declarations
    const constMatches = sourceCode.matchAll(/(?:export\s+)?const\s+(\w+)\s*=/g);
    for (const match of constMatches) {
      symbols.push({
        name: match[1],
        type: 'variable' as const,
        position: {
          start: match.index || 0,
          end: (match.index || 0) + match[0].length,
          line: 1,
          column: match.index || 0
        },
        scope: 'global',
        modifiers: match[0].includes('export') ? ['export'] : []
      });
    }

    return symbols;
  }

  async findReferences(): Promise<Reference[]> { return []; }
  async extractDependencies(): Promise<Dependency[]> { return []; }
  async rename(): Promise<CodeEdit[]> { return []; }
  async extractFunction(): Promise<CodeEdit[]> { return []; }
  async findDefinition(): Promise<Definition | null> { return null; }
  async findUsages(): Promise<Usage[]> { return []; }
  async validate(): Promise<ValidationResult> { return { valid: true, errors: [], warnings: [] }; }
  async dispose(): Promise<void> {}
}

describe('IndexEngine', () => {
  let indexEngine: IndexEngine;
  let config: any;

  beforeEach(async () => {
    // 清理 mock file system
    vol.reset();

    // 重設 ParserRegistry 並註冊 mock parser
    ParserRegistry.resetInstance();
    const registry = ParserRegistry.getInstance();
    const mockParser = new MockTypeScriptParser();
    registry.register(mockParser);

    config = createIndexConfig('/test/workspace', {
      includeExtensions: ['.ts', '.js'],
      excludePatterns: ['node_modules/**', '*.test.ts']
    });

    indexEngine = new IndexEngine(config);
  });

  describe('初始化和配置', () => {
    it('應該能建立索引引擎', async () => {
      expect(indexEngine).toBeDefined();
      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(0);
    });

    it('應該能取得配置', () => {
      const engineConfig = indexEngine.getConfig();
      expect(engineConfig.workspacePath).toBe('/test/workspace');
      expect(engineConfig.includeExtensions).toContain('.ts');
      expect(engineConfig.includeExtensions).toContain('.js');
    });

    it('應該能檢查索引狀態', () => {
      expect(indexEngine.isIndexed('/test/file.ts')).toBe(false);
    });
  });

  describe('單一檔案索引', () => {
    it('應該能索引單一檔案', async () => {
      // 準備檔案系統
      vol.fromJSON({
        '/test/workspace/example.ts': `
          export function hello(name: string): string {
            return \`Hello, \${name}!\`;
          }
          
          export class Calculator {
            add(a: number, b: number): number {
              return a + b;
            }
          }
        `
      });

      await indexEngine.indexFile('/test/workspace/example.ts');

      expect(indexEngine.isIndexed('/test/workspace/example.ts')).toBe(true);
      
      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(1);
      expect(stats.indexedFiles).toBe(1);
    });

    it('應該能取得檔案的符號', async () => {
      vol.fromJSON({
        '/test/workspace/example.ts': `
          export function testFunction(): void {}
          export class TestClass {}
        `
      });

      await indexEngine.indexFile('/test/workspace/example.ts');

      const symbols = await indexEngine.findSymbol('testFunction');
      expect(symbols).toHaveLength(1);
      expect(symbols[0].symbol.name).toBe('testFunction');
      expect(symbols[0].symbol.type).toBe(SymbolType.Function);
    });

    it('應該能處理解析錯誤', async () => {
      vol.fromJSON({
        '/test/workspace/broken.ts': `
          export function broken(
            // 語法錯誤：缺少參數和函數體
        `
      });

      await expect(indexEngine.indexFile('/test/workspace/broken.ts')).rejects.toThrow();
      
      // 檔案應該被標記但不算完全索引
      expect(indexEngine.isIndexed('/test/workspace/broken.ts')).toBe(false);
    });

    it('應該能更新已索引的檔案', async () => {
      vol.fromJSON({
        '/test/workspace/example.ts': `export function oldFunction(): void {}`
      });

      await indexEngine.indexFile('/test/workspace/example.ts');
      
      let symbols = await indexEngine.findSymbol('oldFunction');
      expect(symbols).toHaveLength(1);

      // 更新檔案內容
      vol.writeFileSync('/test/workspace/example.ts', `export function newFunction(): void {}`);

      await indexEngine.updateFile('/test/workspace/example.ts');

      symbols = await indexEngine.findSymbol('oldFunction');
      expect(symbols).toHaveLength(0);

      symbols = await indexEngine.findSymbol('newFunction');
      expect(symbols).toHaveLength(1);
    });

    it('應該能移除檔案', async () => {
      vol.fromJSON({
        '/test/workspace/example.ts': `export function testFunction(): void {}`
      });

      await indexEngine.indexFile('/test/workspace/example.ts');
      expect(indexEngine.isIndexed('/test/workspace/example.ts')).toBe(true);

      await indexEngine.removeFile('/test/workspace/example.ts');
      expect(indexEngine.isIndexed('/test/workspace/example.ts')).toBe(false);

      const symbols = await indexEngine.findSymbol('testFunction');
      expect(symbols).toHaveLength(0);
    });
  });

  describe('目錄索引', () => {
    beforeEach(() => {
      vol.fromJSON({
        '/test/workspace/src/utils.ts': `
          export function utility(): string { return 'util'; }
        `,
        '/test/workspace/src/components/Button.ts': `
          export class Button {
            click(): void {}
          }
        `,
        '/test/workspace/src/types.ts': `
          export interface User {
            id: number;
            name: string;
          }
        `,
        '/test/workspace/test/utils.test.ts': `
          import { utility } from '../src/utils';
          // 測試檔案應該被排除
        `,
        '/test/workspace/node_modules/package/index.js': `
          // node_modules 應該被排除
        `,
        '/test/workspace/README.md': `
          # 非程式碼檔案應該被忽略
        `
      });
    });

    it('應該能索引整個目錄', async () => {
      await indexEngine.indexDirectory('/test/workspace/src');

      const stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.indexedFiles).toBeGreaterThan(0);

      // 檢查符號是否被索引
      const utilSymbols = await indexEngine.findSymbol('utility');
      expect(utilSymbols).toHaveLength(1);

      const buttonSymbols = await indexEngine.findSymbol('Button');
      expect(buttonSymbols).toHaveLength(1);
    });

    it('應該能索引整個專案', async () => {
      await indexEngine.indexProject('/test/workspace');

      const stats = await indexEngine.getStats();

      // 應該索引 src 目錄下的檔案，但排除測試檔案和 node_modules
      expect(stats.totalFiles).toBeGreaterThan(0);
      
      // 檢查排除檔案是否正確處理
      expect(indexEngine.isIndexed('/test/workspace/test/utils.test.ts')).toBe(false);
      expect(indexEngine.isIndexed('/test/workspace/node_modules/package/index.js')).toBe(false);
    });

    it('應該能根據副檔名查找檔案', async () => {
      await indexEngine.indexDirectory('/test/workspace/src');

      const tsFiles = indexEngine.findFilesByExtension('.ts');
      expect(tsFiles.length).toBeGreaterThan(0);
      
      for (const file of tsFiles) {
        expect(file.extension).toBe('.ts');
      }
    });
  });

  describe('符號查詢功能', () => {
    beforeEach(async () => {
      vol.fromJSON({
        '/test/workspace/math.ts': `
          export function add(a: number, b: number): number {
            return a + b;
          }
          
          export function subtract(a: number, b: number): number {
            return a - b;
          }
          
          export class Calculator {
            multiply(a: number, b: number): number {
              return a * b;
            }
            
            divide(a: number, b: number): number {
              return a / b;
            }
          }
        `,
        '/test/workspace/user.ts': `
          export interface User {
            id: number;
            name: string;
            email: string;
          }
          
          export class UserManager {
            users: User[] = [];
            
            addUser(user: User): void {
              this.users.push(user);
            }
          }
        `
      });

      await indexEngine.indexProject('/test/workspace');
    });

    it('應該能根據名稱查找符號', async () => {
      const results = await indexEngine.findSymbol('add');
      
      expect(results).toHaveLength(1);
      expect(results[0].symbol.name).toBe('add');
      expect(results[0].symbol.type).toBe(SymbolType.Function);
    });

    it('應該能根據類型查找符號', async () => {
      const functions = await indexEngine.findSymbolByType(SymbolType.Function);
      const classes = await indexEngine.findSymbolByType(SymbolType.Class);
      const interfaces = await indexEngine.findSymbolByType(SymbolType.Interface);

      expect(functions.length).toBeGreaterThan(0);
      expect(classes.length).toBeGreaterThan(0);
      expect(interfaces.length).toBeGreaterThan(0);

      // 驗證類型正確
      for (const result of functions) {
        expect(result.symbol.type).toBe(SymbolType.Function);
      }
    });

    it('應該支援模糊搜尋', async () => {
      const options = createSearchOptions({ fuzzy: true });
      const results = await indexEngine.searchSymbols('calc', options);
      
      expect(results.length).toBeGreaterThan(0);
      
      // 應該找到 Calculator 類別
      const calculatorResult = results.find(r => r.symbol.name === 'Calculator');
      expect(calculatorResult).toBeDefined();
    });

    it('應該支援大小寫敏感搜尋', async () => {
      const sensitiveOptions = createSearchOptions({ caseSensitive: true });
      const insensitiveOptions = createSearchOptions({ caseSensitive: false });

      const sensitiveResults = await indexEngine.searchSymbols('CALCULATOR', sensitiveOptions);
      const insensitiveResults = await indexEngine.searchSymbols('CALCULATOR', insensitiveOptions);

      expect(sensitiveResults).toHaveLength(0);
      expect(insensitiveResults.length).toBeGreaterThan(0);
    });

    it('應該能限制搜尋結果數量', async () => {
      const options = createSearchOptions({ maxResults: 2 });
      const results = await indexEngine.searchSymbols('', options);
      
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('統計資訊', () => {
    it('應該能取得詳細的統計資訊', async () => {
      vol.fromJSON({
        '/test/workspace/file1.ts': `
          export function func1(): void {}
          export class Class1 {}
        `,
        '/test/workspace/file2.ts': `
          export function func2(): void {}
          export interface Interface1 {}
          export const var1 = 'test';
        `
      });

      await indexEngine.indexProject('/test/workspace');

      const stats = await indexEngine.getStats();

      expect(stats.totalFiles).toBe(2);
      expect(stats.indexedFiles).toBe(2);
      expect(stats.totalSymbols).toBe(5); // 2 functions + 1 class + 1 interface + 1 variable
      expect(stats.lastUpdated).toBeInstanceOf(Date);
      expect(stats.indexSize).toBeGreaterThan(0);
    });

    it('應該追蹤最後更新時間', async () => {
      const beforeTime = new Date();
      
      vol.fromJSON({
        '/test/workspace/example.ts': `export function test(): void {}`
      });

      await indexEngine.indexFile('/test/workspace/example.ts');
      
      const stats = await indexEngine.getStats();
      expect(stats.lastUpdated.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
    });
  });

  describe('清理功能', () => {
    it('應該能清空所有索引', async () => {
      vol.fromJSON({
        '/test/workspace/example.ts': `export function test(): void {}`
      });

      await indexEngine.indexFile('/test/workspace/example.ts');
      let stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(1);

      await indexEngine.clear();
      stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalSymbols).toBe(0);
    });

    it('清空後應該能重新索引', async () => {
      vol.fromJSON({
        '/test/workspace/example.ts': `export function test(): void {}`
      });

      await indexEngine.indexFile('/test/workspace/example.ts');
      await indexEngine.clear();

      let stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(0);

      await indexEngine.indexFile('/test/workspace/example.ts');
      stats = await indexEngine.getStats();
      expect(stats.totalFiles).toBe(1);
    });
  });

  describe('錯誤處理', () => {
    it('索引不存在的檔案應該拋出錯誤', async () => {
      await expect(
        indexEngine.indexFile('/test/workspace/nonexistent.ts')
      ).rejects.toThrow();
    });

    it('索引不存在的目錄應該拋出錯誤', async () => {
      await expect(
        indexEngine.indexDirectory('/test/nonexistent')
      ).rejects.toThrow();
    });

    it('查找不存在的符號應該回傳空陣列', async () => {
      const results = await indexEngine.findSymbol('nonexistent');
      expect(results).toEqual([]);
    });

    it('移除不存在的檔案應該不會出錯', async () => {
      await expect(
        indexEngine.removeFile('/test/workspace/nonexistent.ts')
      ).resolves.not.toThrow();
    });

    it('更新不存在的檔案應該拋出錯誤', async () => {
      await expect(
        indexEngine.updateFile('/test/workspace/nonexistent.ts')
      ).rejects.toThrow();
    });
  });

  describe('檔案過濾', () => {
    beforeEach(() => {
      vol.fromJSON({
        '/test/workspace/src/main.ts': 'export function main() {}',
        '/test/workspace/src/utils.js': 'export function util() {}',
        '/test/workspace/src/data.json': '{"key": "value"}',
        '/test/workspace/test/main.test.ts': 'test code',
        '/test/workspace/node_modules/lib/index.js': 'library code',
        '/test/workspace/dist/main.js': 'compiled code'
      });
    });

    it('應該根據副檔名過濾檔案', async () => {
      await indexEngine.indexProject('/test/workspace');
      
      const stats = await indexEngine.getStats();
      
      // 應該只索引 .ts 和 .js 檔案，但排除測試和依賴目錄
      expect(indexEngine.isIndexed('/test/workspace/src/main.ts')).toBe(true);
      expect(indexEngine.isIndexed('/test/workspace/src/utils.js')).toBe(true);
      expect(indexEngine.isIndexed('/test/workspace/src/data.json')).toBe(false);
    });

    it('應該根據排除模式過濾檔案', async () => {
      await indexEngine.indexProject('/test/workspace');
      
      // 測試檔案和 node_modules 應該被排除
      expect(indexEngine.isIndexed('/test/workspace/test/main.test.ts')).toBe(false);
      expect(indexEngine.isIndexed('/test/workspace/node_modules/lib/index.js')).toBe(false);
    });

    it('應該能自訂過濾規則', async () => {
      const customConfig = createIndexConfig('/test/workspace', {
        includeExtensions: ['.ts'],
        excludePatterns: ['**/test/**', '**/dist/**']
      });

      const customEngine = new IndexEngine(customConfig);
      await customEngine.indexProject('/test/workspace');

      expect(customEngine.isIndexed('/test/workspace/src/main.ts')).toBe(true);
      expect(customEngine.isIndexed('/test/workspace/src/utils.js')).toBe(false); // .js 被排除
      expect(customEngine.isIndexed('/test/workspace/dist/main.js')).toBe(false); // dist 目錄被排除
    });
  });
});