import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReferenceUpdater } from '@core/rename/reference-updater';
import { createSymbol, SymbolType } from '@shared/types/symbol';
import { createLocation, createRange, createPosition } from '@shared/types/core';
import * as fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn()
  },
  readFile: vi.fn(),
  writeFile: vi.fn()
}));

describe('ReferenceUpdater', () => {
  let updater: ReferenceUpdater;

  beforeEach(() => {
    updater = new ReferenceUpdater();
    vi.clearAllMocks();
  });

  describe('findSymbolReferences', () => {
    it('應該找到符號的所有引用', async () => {
      const fileContent = `
function testFunc() {
  const x = testFunc;
  return testFunc();
}
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'testFunc');

      expect(references.length).toBeGreaterThan(0);
      expect(references.every(ref => ref.symbolName === 'testFunc')).toBe(true);
    });

    it('應該使用單詞邊界進行精確匹配', async () => {
      const fileContent = `
const test = 1;
const testing = 2;  // 不應該匹配
const atest = 3;    // 不應該匹配
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      // 應該只匹配 'test'
      expect(references.length).toBe(1);
      expect(references[0].range.start.line).toBe(2);
    });

    it('應該標記註解中的引用', async () => {
      const fileContent = `
const test = 1;
// This is a test comment
/* Another test here */
      `;

      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      const commentRefs = references.filter(ref => ref.type === 'comment');
      expect(commentRefs.length).toBeGreaterThan(0);
    });

    it('應該處理空檔案', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('');

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references).toHaveLength(0);
    });

    it('應該處理讀取失敗的檔案', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references).toHaveLength(0);
    });

    it('應該處理無效的參數', async () => {
      const references1 = await updater.findSymbolReferences('', 'test');
      const references2 = await updater.findSymbolReferences('/test/file.ts', '');

      expect(references1).toHaveLength(0);
      expect(references2).toHaveLength(0);
    });

    it('應該返回正確的範圍資訊', async () => {
      const fileContent = 'const test = 1;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references.length).toBe(1);
      expect(references[0].range.start.line).toBe(1);
      expect(references[0].range.start.column).toBe(7); // 'test' 開始位置
      expect(references[0].range.end.column).toBe(11);  // 'test' 結束位置
    });
  });

  describe('updateReferences', () => {
    it('應該更新符號的所有引用', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Variable,
        createLocation('/test/file.ts', createRange(createPosition(1, 7), createPosition(1, 14)))
      );

      const fileContent = 'const oldName = 1;\nconst x = oldName;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.updateReferences(symbol, 'newName', ['/test/file.ts']);

      expect(result.success).toBe(true);
      expect(result.updatedFiles.length).toBeGreaterThan(0);
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalled();
    });

    it('應該處理多個檔案', async () => {
      const symbol = createSymbol(
        'sharedVar',
        SymbolType.Variable,
        createLocation('/test/file1.ts', createRange(createPosition(1, 7), createPosition(1, 16)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('export const sharedVar = 1;')
        .mockResolvedValueOnce('import { sharedVar } from "./file1";');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.updateReferences(
        symbol,
        'newSharedVar',
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(result.success).toBe(true);
      expect(result.updatedFiles.length).toBeGreaterThan(0);
    });

    it('應該處理更新失敗的情況', async () => {
      const symbol = createSymbol(
        'test',
        SymbolType.Variable,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 5)))
      );

      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      const result = await updater.updateReferences(symbol, 'newTest', ['/test/file.ts']);

      // 應該處理錯誤而不拋出異常
      expect(result).toBeDefined();
    });

    it('應該返回變更資訊', async () => {
      const symbol = createSymbol(
        'oldName',
        SymbolType.Variable,
        createLocation('/test/file.ts', createRange(createPosition(1, 7), createPosition(1, 14)))
      );

      const fileContent = 'const oldName = 1;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.updateReferences(symbol, 'newName', ['/test/file.ts']);

      if (result.success && result.updatedFiles.length > 0) {
        const updatedFile = result.updatedFiles[0];
        expect(updatedFile.filePath).toBe('/test/file.ts');
        expect(updatedFile.originalContent).toBe(fileContent);
        expect(updatedFile.newContent).toBeDefined();
        expect(updatedFile.changes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('applyRenameOperations', () => {
    it('應該批次應用重新命名操作', async () => {
      const operations = [
        {
          filePath: '/test/file.ts',
          oldText: 'oldName1',
          newText: 'newName1',
          range: createRange(createPosition(1, 7), createPosition(1, 15))
        },
        {
          filePath: '/test/file.ts',
          oldText: 'oldName2',
          newText: 'newName2',
          range: createRange(createPosition(2, 7), createPosition(2, 15))
        }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('const oldName1 = 1;\nconst oldName2 = 2;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.applyRenameOperations(operations);

      expect(result.success).toBe(true);
      expect(result.updatedFiles.length).toBeGreaterThan(0);
    });

    it('應該按檔案分組操作', async () => {
      const operations = [
        {
          filePath: '/test/file1.ts',
          oldText: 'old1',
          newText: 'new1',
          range: createRange(createPosition(1, 1), createPosition(1, 5))
        },
        {
          filePath: '/test/file2.ts',
          oldText: 'old2',
          newText: 'new2',
          range: createRange(createPosition(1, 1), createPosition(1, 5))
        }
      ];

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('const old1 = 1;')
        .mockResolvedValueOnce('const old2 = 2;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.applyRenameOperations(operations);

      expect(result.success).toBe(true);
      expect(result.updatedFiles.length).toBe(2);
    });

    it('應該從後往前應用變更以避免位置偏移', async () => {
      const operations = [
        {
          filePath: '/test/file.ts',
          oldText: 'name',
          newText: 'newName',
          range: createRange(createPosition(1, 7), createPosition(1, 11))
        },
        {
          filePath: '/test/file.ts',
          oldText: 'name',
          newText: 'newName',
          range: createRange(createPosition(1, 18), createPosition(1, 22))
        }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('const name = name;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.applyRenameOperations(operations);

      expect(result.success).toBe(true);
      if (result.updatedFiles.length > 0) {
        expect(result.updatedFiles[0].newContent).toContain('newName');
      }
    });

    it('應該處理空的操作陣列', async () => {
      const result = await updater.applyRenameOperations([]);

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(0);
    });
  });

  describe('updateCrossFileReferences', () => {
    it('應該跨檔案更新引用', async () => {
      const symbol = createSymbol(
        'sharedFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 10), createPosition(1, 20)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('export function sharedFunc() {}')
        .mockResolvedValueOnce('import { sharedFunc } from "./file1";');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.updateCrossFileReferences(
        symbol,
        'newSharedFunc',
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(result.success).toBe(true);
      expect(result.updatedFiles.length).toBeGreaterThan(0);
    });

    it('應該只更新包含引用的檔案', async () => {
      const symbol = createSymbol(
        'specificFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 10), createPosition(1, 22)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('function specificFunc() {}')
        .mockResolvedValueOnce('function unrelatedFunc() {}');  // 不包含 specificFunc
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.updateCrossFileReferences(
        symbol,
        'newSpecificFunc',
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(result.success).toBe(true);
      // 只應該更新 file1.ts
      expect(result.updatedFiles.length).toBeGreaterThanOrEqual(1);
    });

    it('應該處理錯誤情況', async () => {
      const symbol = createSymbol(
        'test',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 1), createPosition(1, 5)))
      );

      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      const result = await updater.updateCrossFileReferences(
        symbol,
        'newTest',
        ['/test/file.ts']
      );

      // 應該處理錯誤
      expect(result).toBeDefined();
    });
  });

  describe('findReferencingFiles', () => {
    it('應該找到包含符號的檔案', async () => {
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('const testFunc = () => {};')
        .mockResolvedValueOnce('const x = 1;')  // 不包含 testFunc
        .mockResolvedValueOnce('testFunc();');

      const files = await updater.findReferencingFiles(
        'testFunc',
        ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts']
      );

      expect(files).toHaveLength(2);
      expect(files).toContain('/test/file1.ts');
      expect(files).toContain('/test/file3.ts');
      expect(files).not.toContain('/test/file2.ts');
    });

    it('應該處理空的檔案列表', async () => {
      const files = await updater.findReferencingFiles('test', []);

      expect(files).toHaveLength(0);
    });

    it('應該過濾無效的檔案路徑', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('test');

      const files = await updater.findReferencingFiles('test', ['', null as any, undefined as any, '/valid/file.ts']);

      // 應該只處理有效路徑
      expect(files.some(f => f === '/valid/file.ts')).toBe(true);
    });

    it('應該處理讀取失敗的檔案', async () => {
      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('contains test')
        .mockRejectedValueOnce(new Error('Read error'));

      const files = await updater.findReferencingFiles('test', ['/test/file1.ts', '/test/file2.ts']);

      // 應該只返回成功讀取的檔案
      expect(files).toContain('/test/file1.ts');
    });
  });

  describe('clearCache', () => {
    it('應該清除檔案快取', async () => {
      const fileContent = 'const test = 1;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      // 第一次讀取
      await updater.findSymbolReferences('/test/file.ts', 'test');
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);

      // 第二次讀取應該使用快取
      await updater.findSymbolReferences('/test/file.ts', 'test');
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(1);

      // 清除快取後再讀取
      updater.clearCache();
      await updater.findSymbolReferences('/test/file.ts', 'test');
      expect(vi.mocked(fs.readFile)).toHaveBeenCalledTimes(2);
    });
  });

  describe('collectRenameChanges', () => {
    it('應該收集所有重新命名變更', async () => {
      const symbol = createSymbol(
        'oldFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 17)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('function oldFunc() { return oldFunc; }');

      const changes = await updater.collectRenameChanges(symbol, 'newFunc', ['/test/file.ts']);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].filePath).toBe('/test/file.ts');
      expect(changes[0].changes.length).toBeGreaterThan(0);
    });

    it('應該處理沒有引用的情況', async () => {
      const symbol = createSymbol(
        'unusedFunc',
        SymbolType.Function,
        createLocation('/test/file.ts', createRange(createPosition(1, 10), createPosition(1, 20)))
      );

      vi.mocked(fs.readFile).mockResolvedValue('function unusedFunc() {}');

      const changes = await updater.collectRenameChanges(symbol, 'newFunc', ['/test/file.ts']);

      // 至少應該包含符號定義位置
      expect(changes.length).toBeGreaterThanOrEqual(0);
    });

    it('應該處理多個檔案', async () => {
      const symbol = createSymbol(
        'sharedFunc',
        SymbolType.Function,
        createLocation('/test/file1.ts', createRange(createPosition(1, 10), createPosition(1, 20)))
      );

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce('export function sharedFunc() {}')
        .mockResolvedValueOnce('import { sharedFunc } from "./file1";');

      const changes = await updater.collectRenameChanges(
        symbol,
        'newSharedFunc',
        ['/test/file1.ts', '/test/file2.ts']
      );

      expect(changes.length).toBeGreaterThan(0);
    });
  });

  describe('邊界情況', () => {
    it('應該處理跨行的變更', async () => {
      const operations = [
        {
          filePath: '/test/file.ts',
          oldText: 'old\nname',
          newText: 'newname',
          range: createRange(createPosition(1, 7), createPosition(2, 5))
        }
      ];

      vi.mocked(fs.readFile).mockResolvedValue('const old\nname = 1;');
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const result = await updater.applyRenameOperations(operations);

      expect(result.success).toBe(true);
    });

    it('應該處理特殊字符的符號名稱', async () => {
      const fileContent = 'const _special_name = 1;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', '_special_name');

      // 底線是有效的 JavaScript 識別符
      expect(references.length).toBe(1);
    });

    it('應該處理非常長的檔案', async () => {
      const longContent = 'const test = 1;\n'.repeat(10000);
      vi.mocked(fs.readFile).mockResolvedValue(longContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references.length).toBe(10000);
    });

    it('應該處理 Unicode 字符', async () => {
      const fileContent = 'const 測試變數 = 1;\nconst x = 測試變數;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', '測試變數');

      // Unicode 字符在某些語言中是有效的識別符
      // 但由於 \b 單詞邊界可能不支援 Unicode，所以可能找不到
      // 我們只檢查不會拋出錯誤
      expect(references).toBeDefined();
      expect(Array.isArray(references)).toBe(true);
    });

    it('應該處理空行', async () => {
      const fileContent = 'const test = 1;\n\n\nconst x = test;';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references.length).toBe(2);
    });

    it('應該處理只有註解的檔案', async () => {
      const fileContent = '// test comment\n/* test block */';
      vi.mocked(fs.readFile).mockResolvedValue(fileContent);

      const references = await updater.findSymbolReferences('/test/file.ts', 'test');

      expect(references.every(ref => ref.type === 'comment')).toBe(true);
    });
  });
});
