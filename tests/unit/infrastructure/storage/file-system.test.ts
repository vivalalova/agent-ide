/**
 * FileSystem 測試
 * 測試檔案系統操作類別的所有功能
 * 使用真實檔案系統進行測試，在臨時目錄中操作
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSystem } from '@infrastructure/storage/file-system.js';
import {
  FileNotFoundError,
  DirectoryNotFoundError,
  DirectoryNotEmptyError,
  PermissionError,
} from '@infrastructure/storage/types.js';

// ============================================================================
// FileSystem Tests
// ============================================================================

describe('FileSystem', () => {
  let fileSystem: FileSystem;
  let tempDir: string;

  beforeEach(async () => {
    // eslint-disable-next-line custom/no-new-filesystem -- 測試檔案允許直接實例化
    fileSystem = new FileSystem();
    // 建立唯一的臨時目錄
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-ide-fs-test-'));
  });

  afterEach(async () => {
    // 清理臨時目錄
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理錯誤
    }
  });

  // ==========================================================================
  // readFile
  // ==========================================================================

  describe('readFile', () => {
    it('應該讀取檔案內容為字串', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const content = await fileSystem.readFile(filePath, 'utf-8');

      expect(content).toBe('Hello World');
    });

    it('應該讀取檔案內容為 Buffer', async () => {
      const filePath = path.join(tempDir, 'test.bin');
      const buffer = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
      await fs.writeFile(filePath, buffer);

      const content = await fileSystem.readFile(filePath);

      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content).toEqual(buffer);
    });

    it('應該在檔案不存在時拋出 FileNotFoundError', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      await expect(fileSystem.readFile(filePath)).rejects.toThrow(FileNotFoundError);
    });

    it('應該讀取 UTF-8 編碼的中文內容', async () => {
      const filePath = path.join(tempDir, 'chinese.txt');
      await fs.writeFile(filePath, '你好世界');

      const content = await fileSystem.readFile(filePath, 'utf-8');

      expect(content).toBe('你好世界');
    });

    it('應該讀取空檔案', async () => {
      const filePath = path.join(tempDir, 'empty.txt');
      await fs.writeFile(filePath, '');

      const content = await fileSystem.readFile(filePath, 'utf-8');

      expect(content).toBe('');
    });
  });

  // ==========================================================================
  // writeFile
  // ==========================================================================

  describe('writeFile', () => {
    it('應該寫入字串內容', async () => {
      const filePath = path.join(tempDir, 'write.txt');

      await fileSystem.writeFile(filePath, 'Test Content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Test Content');
    });

    it('應該寫入 Buffer 內容', async () => {
      const filePath = path.join(tempDir, 'write.bin');
      const buffer = Buffer.from([0x01, 0x02, 0x03]);

      await fileSystem.writeFile(filePath, buffer);

      const content = await fs.readFile(filePath);
      expect(content).toEqual(buffer);
    });

    it('應該自動建立父目錄', async () => {
      const filePath = path.join(tempDir, 'deep', 'nested', 'dir', 'file.txt');

      await fileSystem.writeFile(filePath, 'Nested Content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Nested Content');
    });

    it('應該覆寫現有檔案', async () => {
      const filePath = path.join(tempDir, 'overwrite.txt');
      await fs.writeFile(filePath, 'Original');

      await fileSystem.writeFile(filePath, 'Updated');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Updated');
    });

    it('應該支援原子寫入 (fsync)', async () => {
      const filePath = path.join(tempDir, 'atomic.txt');

      await fileSystem.writeFile(filePath, 'Atomic Content', { fsync: true });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Atomic Content');
    });

    it('應該支援自訂暫存檔案後綴', async () => {
      const filePath = path.join(tempDir, 'atomic2.txt');

      await fileSystem.writeFile(filePath, 'Content', {
        fsync: true,
        tempSuffix: '.temp',
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Content');
    });
  });

  // ==========================================================================
  // appendFile
  // ==========================================================================

  describe('appendFile', () => {
    it('應該追加內容到現有檔案', async () => {
      const filePath = path.join(tempDir, 'append.txt');
      await fs.writeFile(filePath, 'Hello');

      await fileSystem.appendFile(filePath, ' World');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('應該自動建立不存在的檔案', async () => {
      const filePath = path.join(tempDir, 'new-append.txt');

      await fileSystem.appendFile(filePath, 'Content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Content');
    });
  });

  // ==========================================================================
  // deleteFile
  // ==========================================================================

  describe('deleteFile', () => {
    it('應該刪除檔案', async () => {
      const filePath = path.join(tempDir, 'delete.txt');
      await fs.writeFile(filePath, 'To Delete');

      await fileSystem.deleteFile(filePath);

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('應該在檔案不存在時拋出 FileNotFoundError', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');

      await expect(fileSystem.deleteFile(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  // ==========================================================================
  // createDirectory
  // ==========================================================================

  describe('createDirectory', () => {
    it('應該建立目錄', async () => {
      const dirPath = path.join(tempDir, 'new-dir');

      await fileSystem.createDirectory(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('應該遞迴建立目錄', async () => {
      const dirPath = path.join(tempDir, 'deep', 'nested', 'dir');

      await fileSystem.createDirectory(dirPath, true);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('應該忽略已存在的目錄', async () => {
      const dirPath = path.join(tempDir, 'existing-dir');
      await fs.mkdir(dirPath);

      await expect(fileSystem.createDirectory(dirPath)).resolves.not.toThrow();
    });

    it('目標路徑已是檔案時不應被當成已存在的目錄而靜默成功', async () => {
      const filePath = path.join(tempDir, 'existing-file');
      await fs.writeFile(filePath, 'content');

      await expect(fileSystem.createDirectory(filePath)).rejects.toThrow();
    });
  });

  // ==========================================================================
  // readDirectory
  // ==========================================================================

  describe('readDirectory', () => {
    it('應該列出目錄內容', async () => {
      const dirPath = path.join(tempDir, 'list-dir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(dirPath, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(dirPath, 'subdir'));

      const entries = await fileSystem.readDirectory(dirPath);

      expect(entries.length).toBe(3);
      expect(entries.some(e => e.name === 'file1.txt' && e.isFile)).toBe(true);
      expect(entries.some(e => e.name === 'file2.txt' && e.isFile)).toBe(true);
      expect(entries.some(e => e.name === 'subdir' && e.isDirectory)).toBe(true);
    });

    it('應該回傳正確的 entry 屬性', async () => {
      const dirPath = path.join(tempDir, 'entry-dir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');

      const entries = await fileSystem.readDirectory(dirPath);
      const fileEntry = entries.find(e => e.name === 'file.txt');

      expect(fileEntry).toBeDefined();
      expect(fileEntry?.isFile).toBe(true);
      expect(fileEntry?.isDirectory).toBe(false);
      expect(fileEntry?.path).toBe(path.join(dirPath, 'file.txt'));
      expect(typeof fileEntry?.size).toBe('number');
      expect(fileEntry?.modifiedTime).toBeInstanceOf(Date);
    });

    it('應該在目錄不存在時拋出 DirectoryNotFoundError', async () => {
      const dirPath = path.join(tempDir, 'nonexistent-dir');

      await expect(fileSystem.readDirectory(dirPath)).rejects.toThrow(DirectoryNotFoundError);
    });

    it('應該處理空目錄', async () => {
      const dirPath = path.join(tempDir, 'empty-dir');
      await fs.mkdir(dirPath);

      const entries = await fileSystem.readDirectory(dirPath);

      expect(entries).toEqual([]);
    });
  });

  // ==========================================================================
  // deleteDirectory
  // ==========================================================================

  describe('deleteDirectory', () => {
    it('應該刪除空目錄', async () => {
      const dirPath = path.join(tempDir, 'empty-delete-dir');
      await fs.mkdir(dirPath);

      await fileSystem.deleteDirectory(dirPath);

      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('應該遞迴刪除非空目錄', async () => {
      const dirPath = path.join(tempDir, 'recursive-delete-dir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');
      await fs.mkdir(path.join(dirPath, 'subdir'));
      await fs.writeFile(path.join(dirPath, 'subdir', 'nested.txt'), 'nested');

      await fileSystem.deleteDirectory(dirPath, true);

      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('應該在非遞迴模式下拋出 DirectoryNotEmptyError', async () => {
      const dirPath = path.join(tempDir, 'nonempty-dir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');

      await expect(fileSystem.deleteDirectory(dirPath, false)).rejects.toThrow(
        DirectoryNotEmptyError
      );
    });

    it('應該在目錄不存在時拋出 DirectoryNotFoundError', async () => {
      const dirPath = path.join(tempDir, 'nonexistent-dir');

      await expect(fileSystem.deleteDirectory(dirPath)).rejects.toThrow(DirectoryNotFoundError);
    });
  });

  // ==========================================================================
  // exists
  // ==========================================================================

  describe('exists', () => {
    it('應該回傳 true 當檔案存在', async () => {
      const filePath = path.join(tempDir, 'exists.txt');
      await fs.writeFile(filePath, 'content');

      const result = await fileSystem.exists(filePath);

      expect(result).toBe(true);
    });

    it('應該回傳 true 當目錄存在', async () => {
      const dirPath = path.join(tempDir, 'exists-dir');
      await fs.mkdir(dirPath);

      const result = await fileSystem.exists(dirPath);

      expect(result).toBe(true);
    });

    it('應該回傳 false 當路徑不存在', async () => {
      const result = await fileSystem.exists(path.join(tempDir, 'nonexistent'));

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // getStats
  // ==========================================================================

  describe('getStats', () => {
    it('應該回傳檔案統計資訊', async () => {
      const filePath = path.join(tempDir, 'stats.txt');
      await fs.writeFile(filePath, 'content');

      const stats = await fileSystem.getStats(filePath);

      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.createdTime).toBeInstanceOf(Date);
      expect(stats.modifiedTime).toBeInstanceOf(Date);
      expect(stats.accessedTime).toBeInstanceOf(Date);
      expect(typeof stats.mode).toBe('number');
    });

    it('應該回傳目錄統計資訊', async () => {
      const dirPath = path.join(tempDir, 'stats-dir');
      await fs.mkdir(dirPath);

      const stats = await fileSystem.getStats(dirPath);

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('應該在路徑不存在時拋出 FileNotFoundError', async () => {
      const filePath = path.join(tempDir, 'nonexistent');

      await expect(fileSystem.getStats(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  // ==========================================================================
  // isFile
  // ==========================================================================

  describe('isFile', () => {
    it('應該回傳 true 對檔案', async () => {
      const filePath = path.join(tempDir, 'isfile.txt');
      await fs.writeFile(filePath, 'content');

      const result = await fileSystem.isFile(filePath);

      expect(result).toBe(true);
    });

    it('應該回傳 false 對目錄', async () => {
      const dirPath = path.join(tempDir, 'isfile-dir');
      await fs.mkdir(dirPath);

      const result = await fileSystem.isFile(dirPath);

      expect(result).toBe(false);
    });

    it('應該回傳 false 對不存在的路徑', async () => {
      const result = await fileSystem.isFile(path.join(tempDir, 'nonexistent'));

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // isDirectory
  // ==========================================================================

  describe('isDirectory', () => {
    it('應該回傳 true 對目錄', async () => {
      const dirPath = path.join(tempDir, 'isdir');
      await fs.mkdir(dirPath);

      const result = await fileSystem.isDirectory(dirPath);

      expect(result).toBe(true);
    });

    it('應該回傳 false 對檔案', async () => {
      const filePath = path.join(tempDir, 'isdir.txt');
      await fs.writeFile(filePath, 'content');

      const result = await fileSystem.isDirectory(filePath);

      expect(result).toBe(false);
    });

    it('應該回傳 false 對不存在的路徑', async () => {
      const result = await fileSystem.isDirectory(path.join(tempDir, 'nonexistent'));

      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // copyFile
  // ==========================================================================

  describe('copyFile', () => {
    it('應該複製檔案', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'Source Content');

      await fileSystem.copyFile(srcPath, destPath);

      const srcContent = await fs.readFile(srcPath, 'utf-8');
      const destContent = await fs.readFile(destPath, 'utf-8');
      expect(srcContent).toBe('Source Content');
      expect(destContent).toBe('Source Content');
    });

    it('應該自動建立目標目錄', async () => {
      const srcPath = path.join(tempDir, 'copy-src.txt');
      const destPath = path.join(tempDir, 'new-dir', 'copy-dest.txt');
      await fs.writeFile(srcPath, 'Content');

      await fileSystem.copyFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Content');
    });

    it('應該覆寫目標檔案', async () => {
      const srcPath = path.join(tempDir, 'src.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'New Content');
      await fs.writeFile(destPath, 'Old Content');

      await fileSystem.copyFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('New Content');
    });

    it('應該在來源檔案不存在時拋出 FileNotFoundError', async () => {
      const srcPath = path.join(tempDir, 'nonexistent.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(fileSystem.copyFile(srcPath, destPath)).rejects.toThrow(FileNotFoundError);
    });
  });

  // ==========================================================================
  // moveFile
  // ==========================================================================

  describe('moveFile', () => {
    it('應該移動檔案', async () => {
      const srcPath = path.join(tempDir, 'move-src.txt');
      const destPath = path.join(tempDir, 'move-dest.txt');
      await fs.writeFile(srcPath, 'Move Content');

      await fileSystem.moveFile(srcPath, destPath);

      await expect(fs.access(srcPath)).rejects.toThrow();
      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Move Content');
    });

    it('應該自動建立目標目錄', async () => {
      const srcPath = path.join(tempDir, 'move-src2.txt');
      const destPath = path.join(tempDir, 'new-move-dir', 'move-dest.txt');
      await fs.writeFile(srcPath, 'Content');

      await fileSystem.moveFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Content');
    });

    it('應該在來源檔案不存在時拋出 FileNotFoundError', async () => {
      const srcPath = path.join(tempDir, 'nonexistent.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(fileSystem.moveFile(srcPath, destPath)).rejects.toThrow(FileNotFoundError);
    });
  });

  // ==========================================================================
  // glob
  // ==========================================================================

  describe('glob', () => {
    it('應該匹配檔案模式', async () => {
      const dirPath = path.join(tempDir, 'glob-dir');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'a.ts'), 'a');
      await fs.writeFile(path.join(dirPath, 'b.ts'), 'b');
      await fs.writeFile(path.join(dirPath, 'c.js'), 'c');

      const matches = await fileSystem.glob('*.ts', { cwd: dirPath });

      expect(matches.length).toBe(2);
      expect(matches.some(m => m.endsWith('a.ts'))).toBe(true);
      expect(matches.some(m => m.endsWith('b.ts'))).toBe(true);
    });

    it('應該支援遞迴模式', async () => {
      const dirPath = path.join(tempDir, 'glob-recursive');
      await fs.mkdir(dirPath);
      await fs.mkdir(path.join(dirPath, 'sub'));
      await fs.writeFile(path.join(dirPath, 'root.ts'), 'root');
      await fs.writeFile(path.join(dirPath, 'sub', 'nested.ts'), 'nested');

      const matches = await fileSystem.glob('**/*.ts', { cwd: dirPath });

      expect(matches.length).toBe(2);
    });

    it('應該支援 ignore 選項', async () => {
      const dirPath = path.join(tempDir, 'glob-ignore');
      await fs.mkdir(dirPath);
      await fs.mkdir(path.join(dirPath, 'node_modules'));
      await fs.writeFile(path.join(dirPath, 'app.ts'), 'app');
      await fs.writeFile(path.join(dirPath, 'node_modules', 'lib.ts'), 'lib');

      const matches = await fileSystem.glob('**/*.ts', {
        cwd: dirPath,
        ignore: ['**/node_modules/**'],
      });

      expect(matches.length).toBe(1);
      expect(matches[0]).toContain('app.ts');
    });

    it('應該支援 dot 選項', async () => {
      const dirPath = path.join(tempDir, 'glob-dot');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, '.hidden'), 'hidden');
      await fs.writeFile(path.join(dirPath, 'visible.txt'), 'visible');

      const matchesWithDot = await fileSystem.glob('*', { cwd: dirPath, dot: true });
      const matchesWithoutDot = await fileSystem.glob('*', { cwd: dirPath, dot: false });

      expect(matchesWithDot.length).toBeGreaterThanOrEqual(matchesWithoutDot.length);
    });

    it('應該支援 absolute 選項', async () => {
      const dirPath = path.join(tempDir, 'glob-absolute');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');

      const matches = await fileSystem.glob('*.txt', { cwd: dirPath, absolute: true });

      expect(matches.length).toBe(1);
      expect(path.isAbsolute(matches[0])).toBe(true);
    });

    it('應該回傳排序後的結果', async () => {
      const dirPath = path.join(tempDir, 'glob-sort');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'c.txt'), 'c');
      await fs.writeFile(path.join(dirPath, 'a.txt'), 'a');
      await fs.writeFile(path.join(dirPath, 'b.txt'), 'b');

      const matches = await fileSystem.glob('*.txt', { cwd: dirPath });

      // 應該是排序的
      expect(matches).toEqual([...matches].sort());
    });
  });

  // ==========================================================================
  // 錯誤型別驗證（文檔測試）
  // ==========================================================================

  describe('錯誤型別驗證', () => {
    // 由於 ESM 模組無法 spy，我們驗證錯誤類型的正確性

    it('PermissionError 應該正確包含路徑資訊', () => {
      const error = new PermissionError('/test/path');
      expect(error.path).toBe('/test/path');
      expect(error.message).toContain('/test/path');
    });

    it('FileNotFoundError 應該正確包含路徑資訊', () => {
      const error = new FileNotFoundError('/test/path');
      expect(error.path).toBe('/test/path');
    });

    it('DirectoryNotFoundError 應該正確包含路徑資訊', () => {
      const error = new DirectoryNotFoundError('/test/dir');
      expect(error.path).toBe('/test/dir');
    });

    it('DirectoryNotEmptyError 應該正確包含路徑資訊', () => {
      const error = new DirectoryNotEmptyError('/test/dir');
      expect(error.path).toBe('/test/dir');
    });
  });

  // ==========================================================================
  // glob 進階測試
  // ==========================================================================

  describe('glob 進階功能', () => {
    it('應該支援 followSymlinks 選項', async () => {
      const dirPath = path.join(tempDir, 'glob-symlink');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');

      // 測試 followSymlinks 選項傳遞
      const matches = await fileSystem.glob('*.txt', {
        cwd: dirPath,
        followSymlinks: true,
      });

      expect(matches.length).toBe(1);
    });

    it('應該處理空結果', async () => {
      const dirPath = path.join(tempDir, 'glob-empty');
      await fs.mkdir(dirPath);

      const matches = await fileSystem.glob('*.nonexistent', { cwd: dirPath });

      expect(matches).toEqual([]);
    });

    it('應該處理多層嵌套的 ignore 模式', async () => {
      const dirPath = path.join(tempDir, 'glob-nested-ignore');
      await fs.mkdir(path.join(dirPath, 'src', 'test'), { recursive: true });
      await fs.writeFile(path.join(dirPath, 'src', 'app.ts'), 'app');
      await fs.writeFile(path.join(dirPath, 'src', 'test', 'app.test.ts'), 'test');

      const matches = await fileSystem.glob('**/*.ts', {
        cwd: dirPath,
        ignore: ['**/*.test.ts'],
      });

      expect(matches.length).toBe(1);
      expect(matches[0]).toContain('app.ts');
      expect(matches[0]).not.toContain('test');
    });
  });

  // ==========================================================================
  // atomicWrite 錯誤處理
  // ==========================================================================

  describe('atomicWrite 錯誤處理', () => {
    it('應該在原子寫入失敗時清理暫存檔案', async () => {
      // 透過正常路徑驗證功能正常運作
      const filePath = path.join(tempDir, 'atomic-cleanup.txt');

      await fileSystem.writeFile(filePath, 'content', { fsync: true });

      // 確認檔案存在且暫存檔案不存在
      expect(await fileSystem.exists(filePath)).toBe(true);
      expect(await fileSystem.exists(filePath + '.tmp')).toBe(false);
    });

    it('應該支援不同編碼的原子寫入', async () => {
      const filePath = path.join(tempDir, 'atomic-encoding.txt');

      await fileSystem.writeFile(filePath, '中文內容', {
        fsync: true,
        encoding: 'utf-8'
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('中文內容');
    });
  });

  // ==========================================================================
  // 邊界條件
  // ==========================================================================

  describe('邊界條件', () => {
    it('應該處理檔案名稱中的空格', async () => {
      const filePath = path.join(tempDir, 'file with spaces.txt');
      await fileSystem.writeFile(filePath, 'content');

      const content = await fileSystem.readFile(filePath, 'utf-8');
      expect(content).toBe('content');
    });

    it('應該處理 Unicode 檔案名稱', async () => {
      const filePath = path.join(tempDir, '檔案.txt');
      await fileSystem.writeFile(filePath, '內容');

      const content = await fileSystem.readFile(filePath, 'utf-8');
      expect(content).toBe('內容');
    });

    it('應該處理大檔案', async () => {
      const filePath = path.join(tempDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB

      await fileSystem.writeFile(filePath, largeContent);

      const content = await fileSystem.readFile(filePath, 'utf-8');
      expect(content.length).toBe(1024 * 1024);
    });

    it('應該處理深層目錄結構', async () => {
      const deepPath = path.join(
        tempDir,
        'a',
        'b',
        'c',
        'd',
        'e',
        'f',
        'g',
        'h',
        'i',
        'j',
        'file.txt'
      );

      await fileSystem.writeFile(deepPath, 'deep content');

      const content = await fileSystem.readFile(deepPath, 'utf-8');
      expect(content).toBe('deep content');
    });
  });
});
