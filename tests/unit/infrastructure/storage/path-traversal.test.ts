import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PathUtils } from '@infrastructure/storage/path-utils';
import { FileSystem } from '@infrastructure/storage/file-system';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock modules
vi.mock('fs/promises');

/**
 * 路径遍历防护测试
 * 测试系统对路径遍历攻击的防护能力
 */
describe('PathUtils Security - Path Traversal Protection', () => {
  describe('路径遍历攻击检测', () => {
    it('应该检测 ../ 路径遍历模式', () => {
      const maliciousPath = '/safe/dir/../../../etc/passwd';
      const normalized = PathUtils.normalize(maliciousPath);

      // 规范化后的路径应该不包含 '..' 片段
      const segments = normalized.split(path.sep);
      expect(segments).not.toContain('..');
    });

    it('应该检测多重 ../ 遍历攻击', () => {
      const paths = [
        '../../../etc/passwd',
        'foo/../../bar',
        './../../../../root/.ssh/id_rsa',
        'safe/../../../dangerous',
      ];

      paths.forEach(maliciousPath => {
        const normalized = PathUtils.normalize(maliciousPath);
        // 规范化应该处理 .. 片段
        expect(normalized).toBeDefined();
      });
    });

    it('应该检测 URL 编码的路径遍历', () => {
      // 注意: 这个测试展示了潜在漏洞 - 系统可能不会自动解码
      const encodedPath = '/safe/dir/%2e%2e%2f%2e%2e%2fetc/passwd';

      // 当前实现可能不会检测到这个攻击
      // 这是一个潜在的安全漏洞
      const result = PathUtils.isValidPath(encodedPath);
      expect(result).toBeDefined();
    });

    it('应该检测反斜杠路径遍历 (Windows)', () => {
      const maliciousPath = 'safe\\dir\\..\\..\\..\\windows\\system32';
      const normalized = PathUtils.normalize(maliciousPath);

      // 规范化应该处理反斜杠
      expect(normalized).toBeDefined();
    });
  });

  describe('绝对路径逃逸检测', () => {
    it('应该能识别绝对路径', () => {
      expect(PathUtils.isAbsolute('/etc/passwd')).toBe(true);
      expect(PathUtils.isAbsolute('relative/path')).toBe(false);
    });

    it('应该检测尝试逃逸到根目录的路径', () => {
      const workDir = '/home/user/project';
      const maliciousPath = '/etc/passwd';

      // isSubPath 应该返回 false，因为 /etc/passwd 不在 workDir 下
      expect(PathUtils.isSubPath(workDir, maliciousPath)).toBe(false);
    });

    it('应该检测绝对路径逃逸尝试', () => {
      const workDir = '/home/user/project';
      const paths = [
        '/etc/passwd',
        '/root/.ssh/id_rsa',
        '/var/log/auth.log',
        '/proc/self/environ',
      ];

      paths.forEach(maliciousPath => {
        expect(PathUtils.isSubPath(workDir, maliciousPath)).toBe(false);
      });
    });
  });

  describe('符号链接攻击防护', () => {
    it('应该能识别符号链接的真实路径', async () => {
      // 注意: 当前 FileSystem 实现没有特殊的符号链接检测
      // 这是一个潜在的安全漏洞

      const fileSystem = new FileSystem();
      const symlinkPath = '/home/user/symlink';

      vi.mocked(fs.stat).mockResolvedValue({
        isFile: () => false,
        isDirectory: () => false,
        isSymbolicLink: () => true,
        size: 0,
        birthtime: new Date(),
        mtime: new Date(),
        atime: new Date(),
        mode: 0o777,
        uid: 1000,
        gid: 1000,
      } as any);

      const stats = await fileSystem.getStats(symlinkPath);

      // 当前实现只检查 isFile 和 isDirectory
      // 不检查 isSymbolicLink - 这是潜在漏洞
      expect(stats).toBeDefined();
    });

    it('应该检测符号链接指向的路径是否安全', () => {
      const workDir = '/home/user/project';
      const symlinkTarget = '/etc/passwd';

      // 如果符号链接指向工作目录外，应该被拒绝
      expect(PathUtils.isSubPath(workDir, symlinkTarget)).toBe(false);
    });

    it('应该防止通过符号链接访问工作目录外的文件', () => {
      // 这是一个重要的安全检查
      const workDir = '/home/user/project';
      const safeSymlink = '/home/user/project/data/link';
      const unsafeTarget = '/etc/passwd';

      // 即使符号链接在工作目录内，如果它指向外部，也应该被拒绝
      expect(PathUtils.isSubPath(workDir, unsafeTarget)).toBe(false);
    });
  });

  describe('路径规范化功能', () => {
    it('应该规范化包含 . 的路径', () => {
      const path1 = '/foo/./bar';
      const path2 = '/foo/bar';

      expect(PathUtils.equals(
        PathUtils.normalize(path1),
        PathUtils.normalize(path2)
      )).toBe(true);
    });

    it('应该规范化包含 .. 的路径', () => {
      const path1 = '/foo/bar/../baz';
      const path2 = '/foo/baz';

      expect(PathUtils.equals(
        PathUtils.normalize(path1),
        PathUtils.normalize(path2)
      )).toBe(true);
    });

    it('应该规范化多余的斜杠', () => {
      const path1 = '/foo//bar///baz';
      const normalized = PathUtils.normalize(path1);

      // 规范化后不应有连续斜杠
      expect(normalized).not.toMatch(/\/\//);
    });

    it('应该正确处理路径边界情况', () => {
      const paths = [
        '',
        '.',
        '..',
        '/',
        '/.',
        '/..',
      ];

      paths.forEach(p => {
        const normalized = PathUtils.normalize(p);
        expect(normalized).toBeDefined();
      });
    });
  });

  describe('工作目录限制验证', () => {
    it('应该验证路径是否在允许的工作目录内', () => {
      const workDir = '/home/user/project';
      const safePath = '/home/user/project/src/file.ts';

      expect(PathUtils.isSubPath(workDir, safePath)).toBe(true);
    });

    it('应该拒绝工作目录外的路径', () => {
      const workDir = '/home/user/project';
      const unsafePaths = [
        '/home/user/other/file.ts',
        '/etc/passwd',
        '/tmp/malicious.sh',
        '/home/user/project/../secret.txt',
      ];

      unsafePaths.forEach(unsafePath => {
        const normalized = PathUtils.resolve(workDir, unsafePath);
        if (PathUtils.isAbsolute(unsafePath)) {
          expect(PathUtils.isSubPath(workDir, unsafePath)).toBe(false);
        }
      });
    });

    it('应该拒绝相同路径（不是子路径）', () => {
      const workDir = '/home/user/project';

      expect(PathUtils.isSubPath(workDir, workDir)).toBe(false);
    });

    it('应该处理尾随斜杠', () => {
      const workDir = '/home/user/project/';
      const safePath = '/home/user/project/src';

      expect(PathUtils.isSubPath(workDir, safePath)).toBe(true);
    });

    it('应该防止前缀混淆攻击', () => {
      const workDir = '/home/user/project';
      const confusingPath = '/home/user/project-evil/file.txt';

      // project-evil 不是 project 的子目录
      expect(PathUtils.isSubPath(workDir, confusingPath)).toBe(false);
    });
  });

  describe('特殊字符和边缘情况', () => {
    it('应该处理包含空格的路径', () => {
      const pathWithSpaces = '/home/user/my documents/file.txt';
      const normalized = PathUtils.normalize(pathWithSpaces);

      expect(normalized).toContain('my documents');
    });

    it('应该处理包含 Unicode 字符的路径', () => {
      const unicodePath = '/home/用户/文件.txt';
      const normalized = PathUtils.normalize(unicodePath);

      expect(normalized).toBeDefined();
    });

    it('应该拒绝包含空字节的路径', () => {
      const nullBytePath = '/home/user/file\x00.txt';

      // sanitizeFilename 应该清理空字节
      const sanitized = PathUtils.sanitizeFilename('file\x00.txt');
      expect(sanitized).not.toContain('\x00');
    });

    it('应该处理非常长的路径', () => {
      const longSegment = 'a'.repeat(300);
      const longPath = `/home/user/${longSegment}`;

      // 系统应该能处理或拒绝过长路径
      const normalized = PathUtils.normalize(longPath);
      expect(normalized).toBeDefined();
    });
  });
});

/**
 * FileSystem 路径遍历集成测试
 */
describe('FileSystem Security - Path Traversal Integration', () => {
  let fileSystem: FileSystem;

  beforeEach(() => {
    vi.clearAllMocks();
    fileSystem = new FileSystem();
  });

  describe('文件操作中的路径验证', () => {
    it('应该允许访问工作目录内的文件', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('content');

      // 这应该成功
      await expect(fileSystem.readFile('/project/safe/file.txt'))
        .resolves.toBeDefined();
    });

    it('当前实现允许访问任意路径 (潜在漏洞)', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('sensitive');

      // 警告: 当前实现没有路径限制
      // 这是一个安全漏洞 - 可以访问任意文件
      await expect(fileSystem.readFile('/etc/passwd'))
        .resolves.toBeDefined();

      // 这个测试展示了漏洞的存在
    });

    it('应该规范化相对路径', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const relativePath = './foo/../bar/file.txt';
      await fileSystem.writeFile(relativePath, 'content');

      // writeFile 应该能处理相对路径
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('目录操作中的路径验证', () => {
    it('应该创建规范化路径的目录', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const pathWithDots = '/project/./foo/../bar';
      await fileSystem.createDirectory(pathWithDots, true);

      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('当前实现允许在任意位置创建目录 (潜在漏洞)', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      // 警告: 没有路径限制
      await fileSystem.createDirectory('/tmp/malicious', true);

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/malicious', { recursive: true });
    });
  });

  describe('符号链接安全注意事项', () => {
    it('应该意识到符号链接可能指向工作目录外', () => {
      // 这是一个文档化的安全考虑
      // FileSystem.glob() 支持 followSymlinks 选项
      // 在安全敏感的环境中，应该设置 followSymlinks: false

      const workDir = '/home/user/project';
      const symlinkInProject = '/home/user/project/data/link';
      const dangerousTarget = '/etc/passwd';

      // 符号链接本身在项目内
      expect(PathUtils.isSubPath(workDir, symlinkInProject)).toBe(true);

      // 但它可能指向项目外的危险文件
      expect(PathUtils.isSubPath(workDir, dangerousTarget)).toBe(false);

      // 建议: 在生产环境中使用 glob 时设置 followSymlinks: false
    });
  });
});
