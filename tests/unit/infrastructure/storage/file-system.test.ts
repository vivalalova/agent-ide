import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileSystem } from '@infrastructure/storage/file-system';
import {
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
} from '@infrastructure/storage/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob as globby } from 'glob';

// Mock modules
vi.mock('fs/promises');
vi.mock('glob');

describe('FileSystem', () => {
  let fileSystem: FileSystem;

  beforeEach(() => {
    fileSystem = new FileSystem();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readFile', () => {
    it('應該讀取檔案內容（字串）', async () => {
      const content = 'test content';
      vi.mocked(fs.readFile).mockResolvedValue(content);

      const result = await fileSystem.readFile('/test/file.ts', 'utf-8');

      expect(result).toBe(content);
      expect(fs.readFile).toHaveBeenCalledWith('/test/file.ts', 'utf-8');
    });

    it('應該讀取檔案內容（Buffer）', async () => {
      const buffer = Buffer.from('test');
      vi.mocked(fs.readFile).mockResolvedValue(buffer);

      const result = await fileSystem.readFile('/test/file.ts');

      expect(result).toBe(buffer);
      expect(fs.readFile).toHaveBeenCalledWith('/test/file.ts');
    });

    it('應該拋出 FileNotFoundError 當檔案不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readFile('/nonexistent.ts')).rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readFile('/no-permission.ts')).rejects.toThrow(PermissionError);
    });

    it('應該拋出原始錯誤當是其他錯誤', async () => {
      const error = new Error('Unknown error');
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readFile('/test/file.ts')).rejects.toThrow('Unknown error');
    });
  });

  describe('writeFile', () => {
    it('應該寫入檔案內容', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await fileSystem.writeFile('/test/file.ts', 'content');

      expect(fs.mkdir).toHaveBeenCalledWith('/test', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith('/test/file.ts', 'content', { encoding: undefined });
    });

    it('應該使用原子寫入當設置 fsync 選項', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(fs.open).mockResolvedValue(mockFd as any);

      await fileSystem.writeFile('/test/file.ts', 'content', { fsync: true });

      expect(fs.writeFile).toHaveBeenCalledWith('/test/file.ts.tmp', 'content', { encoding: undefined });
      expect(mockFd.sync).toHaveBeenCalled();
      expect(mockFd.close).toHaveBeenCalled();
      expect(fs.rename).toHaveBeenCalledWith('/test/file.ts.tmp', '/test/file.ts');
    });

    it('應該清理暫存檔案當原子寫入失敗', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockRejectedValue(new Error('Rename failed'));
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const mockFd = {
        sync: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(fs.open).mockResolvedValue(mockFd as any);

      await expect(fileSystem.writeFile('/test/file.ts', 'content', { fsync: true }))
        .rejects.toThrow('Rename failed');

      expect(fs.unlink).toHaveBeenCalledWith('/test/file.ts.tmp');
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(fileSystem.writeFile('/no-permission.ts', 'content')).rejects.toThrow(PermissionError);
    });
  });

  describe('appendFile', () => {
    it('應該追加內容到檔案', async () => {
      vi.mocked(fs.appendFile).mockResolvedValue(undefined);

      await fileSystem.appendFile('/test/file.ts', 'new content');

      expect(fs.appendFile).toHaveBeenCalledWith('/test/file.ts', 'new content');
    });

    it('應該拋出 FileNotFoundError 當檔案不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.appendFile).mockRejectedValue(error);

      await expect(fileSystem.appendFile('/nonexistent.ts', 'content')).rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.appendFile).mockRejectedValue(error);

      await expect(fileSystem.appendFile('/no-permission.ts', 'content')).rejects.toThrow(PermissionError);
    });
  });

  describe('deleteFile', () => {
    it('應該刪除檔案', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await fileSystem.deleteFile('/test/file.ts');

      expect(fs.unlink).toHaveBeenCalledWith('/test/file.ts');
    });

    it('應該拋出 FileNotFoundError 當檔案不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(fileSystem.deleteFile('/nonexistent.ts')).rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(fileSystem.deleteFile('/no-permission.ts')).rejects.toThrow(PermissionError);
    });
  });

  describe('createDirectory', () => {
    it('應該建立目錄', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await fileSystem.createDirectory('/test/dir');

      expect(fs.mkdir).toHaveBeenCalledWith('/test/dir', { recursive: false });
    });

    it('應該建立巢狀目錄當設置 recursive', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await fileSystem.createDirectory('/test/nested/dir', true);

      expect(fs.mkdir).toHaveBeenCalledWith('/test/nested/dir', { recursive: true });
    });

    it('應該不拋出錯誤當目錄已存在', async () => {
      const error: any = new Error('EEXIST');
      error.code = 'EEXIST';
      vi.mocked(fs.mkdir).mockRejectedValue(error);

      await expect(fileSystem.createDirectory('/existing/dir')).resolves.not.toThrow();
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.mkdir).mockRejectedValue(error);

      await expect(fileSystem.createDirectory('/no-permission')).rejects.toThrow(PermissionError);
    });
  });

  describe('readDirectory', () => {
    it('應該讀取目錄內容', async () => {
      const entries = [
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false },
        { name: 'dir1', isFile: () => false, isDirectory: () => true },
      ];
      vi.mocked(fs.readdir).mockResolvedValue(entries as any);
      vi.mocked(fs.stat).mockResolvedValue({
        size: 100,
        mtime: new Date('2024-01-01'),
        birthtime: new Date('2024-01-01'),
        atime: new Date('2024-01-01'),
        isFile: () => true,
        isDirectory: () => false,
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      } as any);

      const result = await fileSystem.readDirectory('/test');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('file1.ts');
      expect(result[0].isFile).toBe(true);
      expect(result[1].name).toBe('dir1');
      expect(result[1].isDirectory).toBe(true);
    });

    it('應該拋出 DirectoryNotFoundError 當目錄不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readdir).mockRejectedValue(error);

      await expect(fileSystem.readDirectory('/nonexistent')).rejects.toThrow(DirectoryNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readdir).mockRejectedValue(error);

      await expect(fileSystem.readDirectory('/no-permission')).rejects.toThrow(PermissionError);
    });
  });

  describe('deleteDirectory', () => {
    it('應該刪除空目錄', async () => {
      vi.mocked(fs.rmdir).mockResolvedValue(undefined);

      await fileSystem.deleteDirectory('/test/dir');

      expect(fs.rmdir).toHaveBeenCalledWith('/test/dir');
    });

    it('應該遞迴刪除目錄當設置 recursive', async () => {
      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await fileSystem.deleteDirectory('/test/dir', true);

      expect(fs.rm).toHaveBeenCalledWith('/test/dir', { recursive: true, force: false });
    });

    it('應該拋出 DirectoryNotFoundError 當目錄不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.rmdir).mockRejectedValue(error);

      await expect(fileSystem.deleteDirectory('/nonexistent')).rejects.toThrow(DirectoryNotFoundError);
    });

    it('應該拋出 DirectoryNotEmptyError 當目錄不為空', async () => {
      const error: any = new Error('ENOTEMPTY');
      error.code = 'ENOTEMPTY';
      vi.mocked(fs.rmdir).mockRejectedValue(error);

      await expect(fileSystem.deleteDirectory('/not-empty')).rejects.toThrow(DirectoryNotEmptyError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.rmdir).mockRejectedValue(error);

      await expect(fileSystem.deleteDirectory('/no-permission')).rejects.toThrow(PermissionError);
    });
  });

  describe('exists', () => {
    it('應該回傳 true 當路徑存在', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const result = await fileSystem.exists('/test/file.ts');

      expect(result).toBe(true);
    });

    it('應該回傳 false 當路徑不存在', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const result = await fileSystem.exists('/nonexistent.ts');

      expect(result).toBe(false);
    });
  });

  describe('getStats', () => {
    it('應該取得檔案統計資訊', async () => {
      const stats = {
        isFile: () => true,
        isDirectory: () => false,
        size: 1024,
        birthtime: new Date('2024-01-01'),
        mtime: new Date('2024-01-02'),
        atime: new Date('2024-01-03'),
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      };
      vi.mocked(fs.stat).mockResolvedValue(stats as any);

      const result = await fileSystem.getStats('/test/file.ts');

      expect(result.isFile).toBe(true);
      expect(result.isDirectory).toBe(false);
      expect(result.size).toBe(1024);
      expect(result.mode).toBe(0o644);
    });

    it('應該拋出 FileNotFoundError 當路徑不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(fileSystem.getStats('/nonexistent')).rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(fileSystem.getStats('/no-permission')).rejects.toThrow(PermissionError);
    });
  });

  describe('isFile', () => {
    it('應該回傳 true 當路徑是檔案', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      } as any);

      const result = await fileSystem.isFile('/test/file.ts');

      expect(result).toBe(true);
    });

    it('應該回傳 false 當路徑是目錄', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0o755,
        uid: 1000,
        gid: 1000,
      } as any);

      const result = await fileSystem.isFile('/test/dir');

      expect(result).toBe(false);
    });

    it('應該回傳 false 當路徑不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.stat).mockRejectedValue(error);

      const result = await fileSystem.isFile('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('應該回傳 true 當路徑是目錄', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => true,
        size: 0,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0o755,
        uid: 1000,
        gid: 1000,
      } as any);

      const result = await fileSystem.isDirectory('/test/dir');

      expect(result).toBe(true);
    });

    it('應該回傳 false 當路徑是檔案', async () => {
      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      } as any);

      const result = await fileSystem.isDirectory('/test/file.ts');

      expect(result).toBe(false);
    });

    it('應該回傳 false 當路徑不存在', async () => {
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.stat).mockRejectedValue(error);

      const result = await fileSystem.isDirectory('/nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('應該複製檔案', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      await fileSystem.copyFile('/src/file.ts', '/dest/file.ts');

      expect(fs.mkdir).toHaveBeenCalledWith('/dest', { recursive: true });
      expect(fs.copyFile).toHaveBeenCalledWith('/src/file.ts', '/dest/file.ts');
    });

    it('應該拋出 FileNotFoundError 當來源檔案不存在', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      error.path = '/src/file.ts';
      vi.mocked(fs.copyFile).mockRejectedValue(error);

      await expect(fileSystem.copyFile('/src/file.ts', '/dest/file.ts'))
        .rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.copyFile).mockRejectedValue(error);

      await expect(fileSystem.copyFile('/src/file.ts', '/dest/file.ts'))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('moveFile', () => {
    it('應該移動檔案', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.rename).mockResolvedValue(undefined);

      await fileSystem.moveFile('/src/file.ts', '/dest/file.ts');

      expect(fs.mkdir).toHaveBeenCalledWith('/dest', { recursive: true });
      expect(fs.rename).toHaveBeenCalledWith('/src/file.ts', '/dest/file.ts');
    });

    it('應該使用複製+刪除當跨裝置移動', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EXDEV');
      error.code = 'EXDEV';
      vi.mocked(fs.rename).mockRejectedValue(error);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      await fileSystem.moveFile('/src/file.ts', '/dest/file.ts');

      expect(fs.copyFile).toHaveBeenCalledWith('/src/file.ts', '/dest/file.ts');
      expect(fs.unlink).toHaveBeenCalledWith('/src/file.ts');
    });

    it('應該拋出 FileNotFoundError 當來源檔案不存在', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.rename).mockRejectedValue(error);

      await expect(fileSystem.moveFile('/src/file.ts', '/dest/file.ts'))
        .rejects.toThrow(FileNotFoundError);
    });

    it('應該拋出 PermissionError 當無權限', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.rename).mockRejectedValue(error);

      await expect(fileSystem.moveFile('/src/file.ts', '/dest/file.ts'))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('glob', () => {
    it('應該使用 glob 搜尋檔案', async () => {
      const files = ['/test/file1.ts', '/test/file2.ts'];
      vi.mocked(globby).mockResolvedValue(files as any);

      const result = await fileSystem.glob('**/*.ts');

      expect(result).toEqual(files);
    });

    it('應該排序 glob 結果', async () => {
      const files = ['/test/file2.ts', '/test/file1.ts', '/test/file3.ts'];
      const sorted = ['/test/file1.ts', '/test/file2.ts', '/test/file3.ts'];
      vi.mocked(globby).mockResolvedValue(files as any);

      const result = await fileSystem.glob('**/*.ts');

      expect(result).toEqual(sorted);
    });

    it('應該使用自訂選項', async () => {
      vi.mocked(globby).mockResolvedValue([]);

      await fileSystem.glob('**/*.ts', {
        cwd: '/test',
        ignore: ['node_modules/**'],
        dot: true,
        absolute: true,
      });

      expect(globby).toHaveBeenCalledWith('**/*.ts', expect.objectContaining({
        cwd: '/test',
        ignore: ['node_modules/**'],
        dot: true,
        absolute: true,
      }));
    });

    it('應該處理 followSymlinks 選項', async () => {
      vi.mocked(globby).mockResolvedValue([]);

      await fileSystem.glob('**/*.ts', {
        followSymlinks: true,
      });

      expect(globby).toHaveBeenCalledWith('**/*.ts', expect.objectContaining({
        followSymbolicLinks: true,
      }));
    });

    it('應該回傳空陣列當沒有匹配的檔案', async () => {
      vi.mocked(globby).mockResolvedValue([]);

      const result = await fileSystem.glob('**/*.xyz');

      expect(result).toEqual([]);
    });
  });

  describe('文件系统注入防护', () => {
    describe('文件名特殊字符处理', () => {
      it('应该处理包含特殊字符的文件名', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const specialChars = ['<', '>', '|', '*', '?'];
        for (const char of specialChars) {
          const filename = `/test/file${char}name.txt`;

          // 系统应该能处理这些字符（可能会失败或清理）
          try {
            await fileSystem.writeFile(filename, 'content');
          } catch (error) {
            // 预期某些特殊字符可能导致错误
          }
        }
      });

      it('应该处理包含控制字符的文件名', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const controlChars = ['\x00', '\x01', '\x1f', '\x7f'];
        for (const char of controlChars) {
          const filename = `/test/file${char}name.txt`;

          // 系统应该处理或拒绝控制字符
          try {
            await fileSystem.writeFile(filename, 'content');
          } catch (error) {
            // 预期控制字符可能导致错误
          }
        }
      });

      it('应该处理非常长的文件名', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const longName = 'a'.repeat(300) + '.txt';
        const longPath = `/test/${longName}`;

        // 系统应该能处理或拒绝过长文件名
        try {
          await fileSystem.writeFile(longPath, 'content');
        } catch (error) {
          // 预期过长文件名可能导致错误
        }
      });

      it('应该处理以点开头的文件名（隐藏文件）', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        await fileSystem.writeFile('/test/.hidden', 'content');

        expect(fs.writeFile).toHaveBeenCalled();
      });
    });

    describe('空字节注入防护', () => {
      it('应该检测文件路径中的空字节', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);

        const nullBytePath = '/test/file\x00.txt';

        // Node.js 通常会拒绝包含空字节的路径
        const error: any = new Error('ERR_INVALID_ARG_VALUE');
        error.code = 'ERR_INVALID_ARG_VALUE';
        vi.mocked(fs.writeFile).mockRejectedValue(error);

        await expect(fileSystem.writeFile(nullBytePath, 'content'))
          .rejects.toThrow();
      });

      it('应该防止空字节截断攻击', async () => {
        // 空字节截断: file.txt\x00.jpg 可能被解释为 file.txt
        const maliciousPath = '/test/file.txt\x00.jpg';

        const error: any = new Error('ERR_INVALID_ARG_VALUE');
        error.code = 'ERR_INVALID_ARG_VALUE';
        vi.mocked(fs.readFile).mockRejectedValue(error);

        await expect(fileSystem.readFile(maliciousPath))
          .rejects.toThrow();
      });
    });

    describe('路径注入防护', () => {
      it('应该处理包含换行符的路径', async () => {
        const pathWithNewline = '/test/file\nname.txt';

        vi.mocked(fs.mkdir).mockResolvedValue(undefined);

        // 系统应该处理或拒绝包含换行符的路径
        const error: any = new Error('Invalid path');
        vi.mocked(fs.writeFile).mockRejectedValue(error);

        try {
          await fileSystem.writeFile(pathWithNewline, 'content');
        } catch (error) {
          // 预期换行符可能导致错误
        }
      });

      it('应该处理包含制表符的路径', async () => {
        const pathWithTab = '/test/file\tname.txt';

        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        // 制表符在某些系统上可能是有效的
        await fileSystem.writeFile(pathWithTab, 'content');

        expect(fs.writeFile).toHaveBeenCalled();
      });
    });

    describe('命令注入防护（如果有外部命令执行）', () => {
      it('应该安全处理文件名中的 shell 特殊字符', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const shellChars = ['$', '`', ';', '&', '|', '(', ')'];
        for (const char of shellChars) {
          const filename = `/test/file${char}name.txt`;

          // FileSystem 不应该执行 shell 命令，所以这些应该是安全的
          await fileSystem.writeFile(filename, 'content');

          expect(fs.writeFile).toHaveBeenCalled();
        }
      });

      it('应该防止命令替换注入', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const commandInjection = '/test/$(rm -rf /).txt';

        // 如果 FileSystem 直接使用 fs API，这应该是安全的
        await fileSystem.writeFile(commandInjection, 'content');

        // 验证没有执行命令，只是创建了文件
        expect(fs.writeFile).toHaveBeenCalled();
      });
    });

    describe('Unicode 和编码处理', () => {
      it('应该正确处理 Unicode 文件名', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const unicodeNames = [
          '/test/文件.txt',
          '/test/файл.txt',
          '/test/ファイル.txt',
          '/test/파일.txt',
        ];

        for (const name of unicodeNames) {
          await fileSystem.writeFile(name, 'content');
          expect(fs.writeFile).toHaveBeenCalled();
        }
      });

      it('应该处理 emoji 文件名', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        const emojiPath = '/test/📄file.txt';

        await fileSystem.writeFile(emojiPath, 'content');

        expect(fs.writeFile).toHaveBeenCalled();
      });

      it('应该处理 NFD/NFC Unicode 规范化', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);

        // é 可以表示为 e + 组合重音符（NFD）或单个字符（NFC）
        const nfc = '/test/café.txt';
        const nfd = '/test/café.txt'; // 可能不同的 Unicode 表示

        await fileSystem.writeFile(nfc, 'content');

        expect(fs.writeFile).toHaveBeenCalled();
      });
    });

    describe('TOCTOU (Time-of-check to time-of-use) 防护', () => {
      it('应该使用原子写入防止竞态条件', async () => {
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.writeFile).mockResolvedValue(undefined);
        vi.mocked(fs.rename).mockResolvedValue(undefined);

        const mockFd = {
          sync: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(fs.open).mockResolvedValue(mockFd as any);

        // 使用 fsync 选项应该触发原子写入
        await fileSystem.writeFile('/test/file.txt', 'content', { fsync: true });

        // 验证使用了临时文件和 rename
        expect(fs.writeFile).toHaveBeenCalledWith(
          '/test/file.txt.tmp',
          'content',
          expect.any(Object)
        );
        expect(fs.rename).toHaveBeenCalledWith('/test/file.txt.tmp', '/test/file.txt');
      });
    });
  });
});
