import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FileSystem } from '@infrastructure/storage/file-system';
import { PermissionError } from '@infrastructure/storage/types';
import * as fs from 'fs/promises';

// Mock modules
vi.mock('fs/promises');

/**
 * 文件权限错误处理测试
 * 测试文件系统在权限不足时的错误处理行为
 */
describe('FileSystem Security - Permission Error Handling', () => {
  let fileSystem: FileSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem = new FileSystem();
  });

  describe('读取权限错误处理', () => {
    it('应该拋出 PermissionError 当读取无权限文件', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(fileSystem.readFile('/root/secret.txt'))
        .rejects.toThrow(PermissionError);
    });

    it('应该在 PermissionError 中包含正确的路径信息', async () => {
      const testPath = '/no-permission/file.txt';
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      try {
        await fileSystem.readFile(testPath);
        expect.fail('应该抛出错误');
      } catch (e: any) {
        expect(e).toBeInstanceOf(PermissionError);
        expect(e.path).toBe(testPath);
        expect(e.message).toContain(testPath);
      }
    });

    it('应该拋出 PermissionError 当读取无权限目录', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readdir).mockRejectedValue(error);

      await expect(fileSystem.readDirectory('/root'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当获取无权限文件统计信息', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.stat).mockRejectedValue(error);

      await expect(fileSystem.getStats('/root/secret.txt'))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('写入权限错误处理', () => {
    it('应该拋出 PermissionError 当写入无权限文件', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(fileSystem.writeFile('/root/file.txt', 'content'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当追加内容到无权限文件', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.appendFile).mockRejectedValue(error);

      await expect(fileSystem.appendFile('/root/file.txt', 'content'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当写入只读文件系统', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      error.syscall = 'open';
      vi.mocked(fs.writeFile).mockRejectedValue(error);

      await expect(fileSystem.writeFile('/readonly/file.txt', 'content'))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('删除权限错误处理', () => {
    it('应该拋出 PermissionError 当删除无权限文件', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(fileSystem.deleteFile('/root/file.txt'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当删除无权限目录', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.rmdir).mockRejectedValue(error);

      await expect(fileSystem.deleteDirectory('/root/dir'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当递归删除无权限目录', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.rm).mockRejectedValue(error);

      await expect(fileSystem.deleteDirectory('/root/dir', true))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('创建权限错误处理', () => {
    it('应该拋出 PermissionError 当创建无权限目录', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.mkdir).mockRejectedValue(error);

      await expect(fileSystem.createDirectory('/root/newdir'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当在只读目录中创建子目录', async () => {
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.mkdir).mockRejectedValue(error);

      await expect(fileSystem.createDirectory('/readonly/newdir', true))
        .rejects.toThrow(PermissionError);
    });
  });

  describe('复制和移动权限错误处理', () => {
    it('应该拋出 PermissionError 当复制到无权限目录', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      error.path = '/dest/file.txt';
      vi.mocked(fs.copyFile).mockRejectedValue(error);

      await expect(fileSystem.copyFile('/src/file.txt', '/dest/file.txt'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当从无权限位置复制文件', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      error.path = '/src/file.txt';
      vi.mocked(fs.copyFile).mockRejectedValue(error);

      await expect(fileSystem.copyFile('/src/file.txt', '/dest/file.txt'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当移动到无权限目录', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      error.path = '/dest/file.txt';
      vi.mocked(fs.rename).mockRejectedValue(error);

      await expect(fileSystem.moveFile('/src/file.txt', '/dest/file.txt'))
        .rejects.toThrow(PermissionError);
    });

    it('应该拋出 PermissionError 当跨设备移动且目标无权限', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // 首次 rename 失败（跨设备）
      const exdevError: any = new Error('EXDEV');
      exdevError.code = 'EXDEV';
      vi.mocked(fs.rename).mockRejectedValue(exdevError);

      // copyFile 成功
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      // unlink 失败（无权限）
      const eaccesError: any = new Error('EACCES');
      eaccesError.code = 'EACCES';
      vi.mocked(fs.unlink).mockRejectedValue(eaccesError);

      await expect(fileSystem.moveFile('/src/file.txt', '/dest/file.txt'))
        .rejects.toThrow();
    });
  });

  describe('权限错误的错误消息', () => {
    it('应该提供清晰的错误消息', async () => {
      const testPath = '/protected/file.txt';
      const error: any = new Error('EACCES');
      error.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      try {
        await fileSystem.readFile(testPath);
        expect.fail('应该抛出错误');
      } catch (e: any) {
        expect(e.message).toContain('Permission denied');
        expect(e.message).toContain(testPath);
      }
    });

    it('应该包含原始错误作为 cause', async () => {
      const originalError: any = new Error('EACCES: permission denied');
      originalError.code = 'EACCES';
      vi.mocked(fs.readFile).mockRejectedValue(originalError);

      try {
        await fileSystem.readFile('/test.txt');
        expect.fail('应该抛出错误');
      } catch (e: any) {
        expect(e.cause).toBe(originalError);
      }
    });
  });
});
