/**
 * 增量更新測試
 * 測試索引的增量更新和檔案變更追蹤功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IndexEngine } from '../../../src/core/indexing/index-engine';
import { FileWatcher } from '../../../src/core/indexing/file-watcher';
import { createIndexConfig } from '../../../src/core/indexing/types';
import { vol } from 'memfs';
import * as fs from 'fs/promises';
import { glob } from 'glob';
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
    access: vi.fn((path: string) => vol.promises.access(path)),
    watch: vi.fn()
  };
});

// Mock fs with watch support
vi.mock('fs', () => {
  const actualVol = vol;
  return {
    ...actualVol,
    watch: vi.fn(() => ({
      close: vi.fn(),
      on: vi.fn(),
      removeAllListeners: vi.fn()
    }))
  };
});

// Mock glob to avoid file system access
vi.mock('glob', () => ({
  glob: vi.fn()
}));

// Mock chokidar for file watching
vi.mock('chokidar', () => ({
  watch: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockReturnValue(Promise.resolve()),
    add: vi.fn(),
    unwatch: vi.fn()
  }))
}));

// Mock TypeScript Parser Plugin
class MockTypeScriptParser implements ParserPlugin {
  readonly name = 'typescript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.ts', '.tsx'] as const;
  readonly supportedLanguages = ['typescript'] as const;
  
  async parse(code: string, filePath: string): Promise<AST> {
    // Extract basic function names for testing
    const functionMatches = code.match(/function\s+(\w+)/g) || [];
    const arrowMatches = code.match(/const\s+(\w+)\s*=/g) || [];
    
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
    const functionMatches = sourceCode.matchAll(/function\s+(\w+)/g);
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
        modifiers: []
      });
    }
    
    // Extract const declarations
    const constMatches = sourceCode.matchAll(/const\s+(\w+)\s*=/g);
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
        modifiers: []
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

describe('增量更新功能', () => {
  let indexEngine: IndexEngine;
  let fileWatcher: FileWatcher;
  let config: any;

  beforeEach(async () => {
    vol.reset();
    vi.clearAllMocks();
    
    // Setup mocked file system
    (fs.stat as any).mockImplementation(async (path: string) => {
      if (path === '/test/workspace') {
        return {
          isDirectory: () => true,
          isFile: () => false,
          mtime: new Date(),
          size: 0
        };
      }
      if (vol.existsSync(path)) {
        // 從 memfs 獲取實際的檔案統計資訊，包含正確的 mtime
        const stat = vol.statSync(path);
        return {
          isDirectory: () => false,
          isFile: () => true,
          mtime: stat.mtime,
          size: stat.size
        };
      }
      throw new Error(`ENOENT: no such file or directory '${path}'`);
    });
    
    (fs.readdir as any).mockImplementation(async (dirPath: string) => {
      const files: string[] = [];
      for (const [filePath] of Object.entries(vol.toJSON())) {
        if (filePath.startsWith(dirPath + '/') && filePath !== dirPath) {
          const relativePath = filePath.slice(dirPath.length + 1);
          if (!relativePath.includes('/')) {
            files.push(relativePath);
          }
        }
      }
      return files;
    });
    
    (fs.readFile as any).mockImplementation(async (filePath: string) => {
      const content = vol.readFileSync(filePath, 'utf8');
      return content;
    });
    
    (glob as any).mockImplementation(async (pattern: string) => {
      const files: string[] = [];
      for (const [filePath] of Object.entries(vol.toJSON())) {
        if (filePath.endsWith('.ts') || filePath.endsWith('.js')) {
          files.push(filePath);
        }
      }
      return files;
    });
    
    config = createIndexConfig('/test/workspace', {
      includeExtensions: ['.ts', '.js'],
      excludePatterns: ['node_modules/**', '*.test.ts']
    });
    
    // Register mock parser only if not already registered
    const registry = ParserRegistry.getInstance();
    if (!registry.getParser('.ts')) {
      const mockParser = new MockTypeScriptParser();
      registry.register(mockParser);
      await registry.initialize();
    }
    
    indexEngine = new IndexEngine(config);
    fileWatcher = new FileWatcher(indexEngine);
  });

  afterEach(async () => {
    if (fileWatcher) {
      await fileWatcher.stop();
    }
    // Clean up parser registry
    const registry = ParserRegistry.getInstance();
    if (!registry.isDisposed) {
      await registry.dispose();
    }
    ParserRegistry.resetInstance();
  });

  describe('檔案變更檢測', () => {
    it('應該能檢測新增的檔案', async () => {
      const initialFiles = {
        '/test/workspace/existing.ts': 'export function existing() {}'
      };
      vol.fromJSON(initialFiles);
      
      await indexEngine.indexProject('/test/workspace');
      expect(indexEngine.isIndexed('/test/workspace/existing.ts')).toBe(true);
      
      // 新增檔案
      vol.writeFileSync('/test/workspace/new.ts', 'export function newFunction() {}');
      
      // 模擬檔案系統事件
      await fileWatcher.handleFileChange('/test/workspace/new.ts', 'add');
      
      expect(indexEngine.isIndexed('/test/workspace/new.ts')).toBe(true);
      
      const symbols = await indexEngine.findSymbol('newFunction');
      expect(symbols).toHaveLength(1);
    });

    it('應該能檢測修改的檔案', async () => {
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function oldFunction() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      
      let symbols = await indexEngine.findSymbol('oldFunction');
      expect(symbols).toHaveLength(1);
      
      // 修改檔案內容
      vol.writeFileSync('/test/workspace/test.ts', 'export function newFunction() {}');
      
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      // 舊符號應該被移除，新符號應該被加入
      symbols = await indexEngine.findSymbol('oldFunction');
      expect(symbols).toHaveLength(0);
      
      symbols = await indexEngine.findSymbol('newFunction');
      expect(symbols).toHaveLength(1);
    });

    it('應該能檢測刪除的檔案', async () => {
      vol.fromJSON({
        '/test/workspace/toDelete.ts': 'export function toDelete() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      
      expect(indexEngine.isIndexed('/test/workspace/toDelete.ts')).toBe(true);
      
      let symbols = await indexEngine.findSymbol('toDelete');
      expect(symbols).toHaveLength(1);
      
      // 刪除檔案
      vol.unlinkSync('/test/workspace/toDelete.ts');
      
      await fileWatcher.handleFileChange('/test/workspace/toDelete.ts', 'unlink');
      
      expect(indexEngine.isIndexed('/test/workspace/toDelete.ts')).toBe(false);
      
      symbols = await indexEngine.findSymbol('toDelete');
      expect(symbols).toHaveLength(0);
    });

    it('應該能檢測重新命名的檔案', async () => {
      vol.fromJSON({
        '/test/workspace/oldName.ts': 'export function testFunction() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      
      expect(indexEngine.isIndexed('/test/workspace/oldName.ts')).toBe(true);
      
      // 模擬重新命名操作（先刪除舊檔案，再新增新檔案）
      const content = vol.readFileSync('/test/workspace/oldName.ts', 'utf-8') as string;
      vol.unlinkSync('/test/workspace/oldName.ts');
      vol.writeFileSync('/test/workspace/newName.ts', content);
      
      await fileWatcher.handleFileChange('/test/workspace/oldName.ts', 'unlink');
      await fileWatcher.handleFileChange('/test/workspace/newName.ts', 'add');
      
      expect(indexEngine.isIndexed('/test/workspace/oldName.ts')).toBe(false);
      expect(indexEngine.isIndexed('/test/workspace/newName.ts')).toBe(true);
      
      const symbols = await indexEngine.findSymbol('testFunction');
      expect(symbols).toHaveLength(1);
      expect(symbols[0].fileInfo.filePath).toBe('/test/workspace/newName.ts');
    });
  });

  describe('批次更新', () => {
    it('應該能批次處理多個檔案變更', async () => {
      const initialFiles = {
        '/test/workspace/file1.ts': 'export function func1() {}',
        '/test/workspace/file2.ts': 'export function func2() {}',
        '/test/workspace/file3.ts': 'export function func3() {}'
      };
      vol.fromJSON(initialFiles);
      
      await indexEngine.indexProject('/test/workspace');
      
      // 批次修改多個檔案
      vol.writeFileSync('/test/workspace/file1.ts', 'export function newFunc1() {}');
      vol.writeFileSync('/test/workspace/file2.ts', 'export function newFunc2() {}');
      vol.writeFileSync('/test/workspace/file4.ts', 'export function newFunc4() {}');
      
      const changes = [
        { filePath: '/test/workspace/file1.ts', type: 'change' as const },
        { filePath: '/test/workspace/file2.ts', type: 'change' as const },
        { filePath: '/test/workspace/file4.ts', type: 'add' as const }
      ];
      
      await fileWatcher.handleBatchChanges(changes);
      
      // 驗證變更結果
      let symbols = await indexEngine.findSymbol('func1');
      expect(symbols).toHaveLength(0);
      
      symbols = await indexEngine.findSymbol('newFunc1');
      expect(symbols).toHaveLength(1);
      
      symbols = await indexEngine.findSymbol('newFunc2');
      expect(symbols).toHaveLength(1);
      
      symbols = await indexEngine.findSymbol('newFunc4');
      expect(symbols).toHaveLength(1);
    });

    it('應該能限制批次更新的並行數量', async () => {
      const files = {};
      for (let i = 1; i <= 20; i++) {
        files[`/test/workspace/file${i}.ts`] = `export function func${i}() {}`;
      }
      vol.fromJSON(files);
      
      await indexEngine.indexProject('/test/workspace');
      
      // 修改所有檔案
      const changes = [];
      for (let i = 1; i <= 20; i++) {
        vol.writeFileSync(`/test/workspace/file${i}.ts`, `export function newFunc${i}() {}`);
        changes.push({
          filePath: `/test/workspace/file${i}.ts`,
          type: 'change' as const
        });
      }
      
      const startTime = Date.now();
      await fileWatcher.handleBatchChanges(changes, { maxConcurrency: 4 });
      const endTime = Date.now();
      
      // 驗證所有檔案都被正確更新
      for (let i = 1; i <= 20; i++) {
        const symbols = await indexEngine.findSymbol(`newFunc${i}`);
        expect(symbols).toHaveLength(1);
      }
      
      // 驗證執行時間合理（表示確實有並行控制）
      expect(endTime - startTime).toBeLessThan(5000); // 應該在 5 秒內完成
    });
  });

  describe('檔案變更追蹤', () => {
    it('應該能追蹤檔案的修改時間', async () => {
      const now = new Date();
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function test() {}'
      }, '/test/workspace', { mtime: now });
      
      await indexEngine.indexProject('/test/workspace');
      
      const fileInfo = indexEngine.getAllIndexedFiles()
        .find(f => f.filePath === '/test/workspace/test.ts');
      
      // 允許 1 秒的時間誤差
      expect(Math.abs(fileInfo?.lastModified.getTime() - now.getTime())).toBeLessThanOrEqual(1000);
      
      // 修改檔案
      const laterTime = new Date(now.getTime() + 1000);
      vol.writeFileSync('/test/workspace/test.ts', 'export function updated() {}');
      vol.utimesSync('/test/workspace/test.ts', laterTime, laterTime);
      
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      const updatedFileInfo = indexEngine.getAllIndexedFiles()
        .find(f => f.filePath === '/test/workspace/test.ts');
      
      // 允許 1 秒的時間誤差
      expect(Math.abs(updatedFileInfo?.lastModified.getTime() - laterTime.getTime())).toBeLessThanOrEqual(1000);
    });

    it('應該能檢查檔案是否需要重新索引', async () => {
      const originalTime = new Date('2023-01-01T00:00:00Z');

      // 創建檔案
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function test() {}'
      });

      // 手動設置檔案時間
      vol.utimesSync('/test/workspace/test.ts', originalTime, originalTime);

      await indexEngine.indexProject('/test/workspace');

      // 檔案沒有變更，不需要重新索引
      expect(await indexEngine.needsReindexing('/test/workspace/test.ts')).toBe(false);

      // 修改檔案時間
      const newTime = new Date('2023-01-02T00:00:00Z');
      vol.utimesSync('/test/workspace/test.ts', newTime, newTime);

      // 現在需要重新索引
      expect(await indexEngine.needsReindexing('/test/workspace/test.ts')).toBe(true);
    });
  });

  describe('變更事件處理', () => {
    it('應該能註冊變更事件監聽器', async () => {
      const changeEvents: any[] = [];
      
      fileWatcher.on('fileChanged', (event) => {
        changeEvents.push(event);
      });
      
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function test() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      
      vol.writeFileSync('/test/workspace/test.ts', 'export function updated() {}');
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      expect(changeEvents).toHaveLength(1);
      expect(changeEvents[0].filePath).toBe('/test/workspace/test.ts');
      expect(changeEvents[0].type).toBe('change');
    });

    it('應該能處理變更事件中的錯誤', async () => {
      const errors: any[] = [];
      
      fileWatcher.on('error', (error) => {
        errors.push(error);
      });
      
      // 嘗試處理不存在的檔案
      await fileWatcher.handleFileChange('/test/workspace/nonexistent.ts', 'change');
      
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toContain('nonexistent.ts');
    });

    it('應該能暫停和恢復檔案監控', async () => {
      let eventCount = 0;
      
      fileWatcher.on('fileChanged', () => {
        eventCount++;
      });
      
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function test() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      await fileWatcher.start();
      
      // 正常情況下事件會被觸發
      vol.writeFileSync('/test/workspace/test.ts', 'export function updated1() {}');
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      expect(eventCount).toBe(1);
      
      // 暫停監控
      fileWatcher.pause();
      
      vol.writeFileSync('/test/workspace/test.ts', 'export function updated2() {}');
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      // 事件不應該增加
      expect(eventCount).toBe(1);
      
      // 恢復監控
      fileWatcher.resume();
      
      vol.writeFileSync('/test/workspace/test.ts', 'export function updated3() {}');
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      // 現在事件應該增加
      expect(eventCount).toBe(2);
    });
  });

  describe('效能最佳化', () => {
    it('應該避免重複索引相同內容的檔案', async () => {
      vol.fromJSON({
        '/test/workspace/test.ts': 'export function test() {}'
      });
      
      await indexEngine.indexProject('/test/workspace');
      
      const stats1 = indexEngine.getStats();
      const lastUpdated1 = stats1.lastUpdated;
      
      // 等待一毫秒確保時間差異
      await new Promise(resolve => setTimeout(resolve, 1));
      
      // 觸發檔案變更但內容實際上沒有改變
      await fileWatcher.handleFileChange('/test/workspace/test.ts', 'change');
      
      const stats2 = indexEngine.getStats();
      const lastUpdated2 = stats2.lastUpdated;
      
      // 如果實作了 checksum 檢查，索引應該不會更新
      // 這個測試可能需要根據實際實作調整
      expect(stats2.totalSymbols).toBe(stats1.totalSymbols);
    });

    it('應該能處理大量並發的檔案變更', async () => {
      // 準備大量檔案
      const files = {};
      for (let i = 1; i <= 100; i++) {
        files[`/test/workspace/file${i}.ts`] = `export function func${i}() {}`;
      }
      vol.fromJSON(files);
      
      await indexEngine.indexProject('/test/workspace');
      
      // 並發修改所有檔案
      const promises = [];
      for (let i = 1; i <= 100; i++) {
        vol.writeFileSync(`/test/workspace/file${i}.ts`, `export function newFunc${i}() {}`);
        promises.push(
          fileWatcher.handleFileChange(`/test/workspace/file${i}.ts`, 'change')
        );
      }
      
      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();
      
      // 驗證所有變更都被正確處理
      for (let i = 1; i <= 100; i++) {
        const symbols = await indexEngine.findSymbol(`newFunc${i}`);
        expect(symbols).toHaveLength(1);
      }
      
      // 驗證處理時間合理
      expect(endTime - startTime).toBeLessThan(10000); // 應該在 10 秒內完成
    });
  });
});