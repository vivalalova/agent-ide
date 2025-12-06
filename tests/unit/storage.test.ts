/**
 * Infrastructure Storage 單元測試
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { FileSystem } from '@infrastructure/storage/file-system.js';
import {
  FileSystemError,
  FileSystemErrorType,
  FileNotFoundError,
  DirectoryNotFoundError,
  PermissionError,
  DirectoryNotEmptyError,
  type DirectoryEntry,
  type FileStats
} from '@infrastructure/storage/types.js';

// ============================================
// FileSystem Tests
// ============================================

describe('FileSystem', () => {
  let fileSystem: FileSystem;
  let tempDir: string;

  beforeEach(async () => {
    fileSystem = new FileSystem();
    // Create a unique temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-test-'));
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('readFile', () => {
    it('should read file content as string with encoding', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const content = await fileSystem.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should read file content as Buffer without encoding', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const content = await fileSystem.readFile(filePath);
      expect(Buffer.isBuffer(content)).toBe(true);
      expect(content.toString()).toBe('Hello World');
    });

    it('should throw FileNotFoundError for missing file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      await expect(fileSystem.readFile(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('writeFile', () => {
    it('should write string content to file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fileSystem.writeFile(filePath, 'Hello World');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should write Buffer content to file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fileSystem.writeFile(filePath, Buffer.from('Hello World'));

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should create parent directories if they do not exist', async () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'test.txt');
      await fileSystem.writeFile(filePath, 'Hello World');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should support atomic write with fsync', async () => {
      const filePath = path.join(tempDir, 'atomic.txt');
      await fileSystem.writeFile(filePath, 'Atomic Content', { fsync: true });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Atomic Content');
    });

    it('should support custom temp suffix for atomic write', async () => {
      const filePath = path.join(tempDir, 'atomic2.txt');
      await fileSystem.writeFile(filePath, 'Atomic Content', {
        fsync: true,
        tempSuffix: '.temp'
      });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Atomic Content');
    });

    it('should support encoding option', async () => {
      const filePath = path.join(tempDir, 'encoded.txt');
      await fileSystem.writeFile(filePath, 'Hello World', { encoding: 'utf-8' });

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });
  });

  describe('appendFile', () => {
    it('should append content to existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello');
      await fileSystem.appendFile(filePath, ' World');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should create file if it does not exist', async () => {
      const filePath = path.join(tempDir, 'newfile.txt');
      await fileSystem.appendFile(filePath, 'content');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('content');
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello');
      await fileSystem.deleteFile(filePath);

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it('should throw FileNotFoundError for missing file', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      await expect(fileSystem.deleteFile(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('createDirectory', () => {
    it('should create directory', async () => {
      const dirPath = path.join(tempDir, 'newdir');
      await fileSystem.createDirectory(dirPath);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should create nested directories with recursive option', async () => {
      const dirPath = path.join(tempDir, 'a', 'b', 'c');
      await fileSystem.createDirectory(dirPath, true);

      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const dirPath = path.join(tempDir, 'existing');
      await fs.mkdir(dirPath);

      await expect(fileSystem.createDirectory(dirPath)).resolves.not.toThrow();
    });
  });

  describe('readDirectory', () => {
    it('should list directory contents', async () => {
      const dirPath = tempDir;
      await fs.writeFile(path.join(dirPath, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(dirPath, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(dirPath, 'subdir'));

      const entries = await fileSystem.readDirectory(dirPath);

      expect(entries.length).toBe(3);
      expect(entries.some((e: DirectoryEntry) => e.name === 'file1.txt' && e.isFile)).toBe(true);
      expect(entries.some((e: DirectoryEntry) => e.name === 'file2.txt' && e.isFile)).toBe(true);
      expect(entries.some((e: DirectoryEntry) => e.name === 'subdir' && e.isDirectory)).toBe(true);
    });

    it('should throw DirectoryNotFoundError for missing directory', async () => {
      const dirPath = path.join(tempDir, 'nonexistent');
      await expect(fileSystem.readDirectory(dirPath)).rejects.toThrow(DirectoryNotFoundError);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete empty directory', async () => {
      const dirPath = path.join(tempDir, 'emptydir');
      await fs.mkdir(dirPath);
      await fileSystem.deleteDirectory(dirPath);

      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('should delete directory recursively', async () => {
      const dirPath = path.join(tempDir, 'nested');
      await fs.mkdir(path.join(dirPath, 'sub'), { recursive: true });
      await fs.writeFile(path.join(dirPath, 'sub', 'file.txt'), 'content');

      await fileSystem.deleteDirectory(dirPath, true);

      await expect(fs.access(dirPath)).rejects.toThrow();
    });

    it('should throw DirectoryNotEmptyError for non-empty directory without recursive', async () => {
      const dirPath = path.join(tempDir, 'nonempty');
      await fs.mkdir(dirPath);
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');

      await expect(fileSystem.deleteDirectory(dirPath)).rejects.toThrow(DirectoryNotEmptyError);
    });

    it('should throw DirectoryNotFoundError for missing directory', async () => {
      const dirPath = path.join(tempDir, 'nonexistent');
      await expect(fileSystem.deleteDirectory(dirPath)).rejects.toThrow(DirectoryNotFoundError);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      expect(await fileSystem.exists(filePath)).toBe(true);
    });

    it('should return true for existing directory', async () => {
      expect(await fileSystem.exists(tempDir)).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      expect(await fileSystem.exists(filePath)).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return file stats', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'Hello World');

      const stats = await fileSystem.getStats(filePath);

      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
      expect(stats.size).toBe(11);
      expect(stats.createdTime).toBeInstanceOf(Date);
      expect(stats.modifiedTime).toBeInstanceOf(Date);
      expect(stats.accessedTime).toBeInstanceOf(Date);
    });

    it('should return directory stats', async () => {
      const stats = await fileSystem.getStats(tempDir);

      expect(stats.isFile).toBe(false);
      expect(stats.isDirectory).toBe(true);
    });

    it('should throw FileNotFoundError for missing path', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      await expect(fileSystem.getStats(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('isFile', () => {
    it('should return true for file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      expect(await fileSystem.isFile(filePath)).toBe(true);
    });

    it('should return false for directory', async () => {
      expect(await fileSystem.isFile(tempDir)).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      const filePath = path.join(tempDir, 'nonexistent.txt');
      expect(await fileSystem.isFile(filePath)).toBe(false);
    });
  });

  describe('isDirectory', () => {
    it('should return true for directory', async () => {
      expect(await fileSystem.isDirectory(tempDir)).toBe(true);
    });

    it('should return false for file', async () => {
      const filePath = path.join(tempDir, 'test.txt');
      await fs.writeFile(filePath, 'content');

      expect(await fileSystem.isDirectory(filePath)).toBe(false);
    });

    it('should return false for non-existent path', async () => {
      const dirPath = path.join(tempDir, 'nonexistent');
      expect(await fileSystem.isDirectory(dirPath)).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('should copy file to destination', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'Hello World');

      await fileSystem.copyFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should create destination directory if needed', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'nested', 'dest.txt');
      await fs.writeFile(srcPath, 'Hello World');

      await fileSystem.copyFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should throw FileNotFoundError for missing source', async () => {
      const srcPath = path.join(tempDir, 'nonexistent.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(fileSystem.copyFile(srcPath, destPath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('moveFile', () => {
    it('should move file to destination', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'dest.txt');
      await fs.writeFile(srcPath, 'Hello World');

      await fileSystem.moveFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Hello World');
      await expect(fs.access(srcPath)).rejects.toThrow();
    });

    it('should create destination directory if needed', async () => {
      const srcPath = path.join(tempDir, 'source.txt');
      const destPath = path.join(tempDir, 'nested', 'dest.txt');
      await fs.writeFile(srcPath, 'Hello World');

      await fileSystem.moveFile(srcPath, destPath);

      const content = await fs.readFile(destPath, 'utf-8');
      expect(content).toBe('Hello World');
    });

    it('should throw FileNotFoundError for missing source', async () => {
      const srcPath = path.join(tempDir, 'nonexistent.txt');
      const destPath = path.join(tempDir, 'dest.txt');

      await expect(fileSystem.moveFile(srcPath, destPath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('glob', () => {
    it('should find files matching pattern', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');
      await fs.writeFile(path.join(tempDir, 'file3.js'), 'content3');

      const results = await fileSystem.glob('*.txt', { cwd: tempDir });

      expect(results).toContain('file1.txt');
      expect(results).toContain('file2.txt');
      expect(results).not.toContain('file3.js');
    });

    it('should support ignore option', async () => {
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'content2');

      const results = await fileSystem.glob('*.txt', {
        cwd: tempDir,
        ignore: ['file2.txt']
      });

      expect(results).toContain('file1.txt');
      expect(results).not.toContain('file2.txt');
    });

    it('should support dot option for hidden files', async () => {
      await fs.writeFile(path.join(tempDir, '.hidden'), 'hidden');
      await fs.writeFile(path.join(tempDir, 'visible.txt'), 'visible');

      const resultsWithDot = await fileSystem.glob('*', { cwd: tempDir, dot: true });
      const resultsWithoutDot = await fileSystem.glob('*', { cwd: tempDir, dot: false });

      expect(resultsWithDot).toContain('.hidden');
      expect(resultsWithoutDot).not.toContain('.hidden');
    });

    it('should support absolute option', async () => {
      await fs.writeFile(path.join(tempDir, 'test.txt'), 'content');

      const results = await fileSystem.glob('*.txt', { cwd: tempDir, absolute: true });

      expect(results[0]).toContain(tempDir);
    });
  });
});

// ============================================
// Storage Types Tests
// ============================================

describe('FileSystemError', () => {
  it('should create error with all properties', () => {
    const cause = new Error('Original error');
    const error = new FileSystemError(
      FileSystemErrorType.FILE_NOT_FOUND,
      'Test message',
      '/path/to/file',
      cause
    );

    expect(error.type).toBe(FileSystemErrorType.FILE_NOT_FOUND);
    expect(error.message).toBe('Test message');
    expect(error.path).toBe('/path/to/file');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('FileSystemError');
  });
});

describe('FileNotFoundError', () => {
  it('should create error with path', () => {
    const error = new FileNotFoundError('/path/to/file');

    expect(error.type).toBe(FileSystemErrorType.FILE_NOT_FOUND);
    expect(error.message).toContain('/path/to/file');
    expect(error.path).toBe('/path/to/file');
    expect(error.name).toBe('FileNotFoundError');
  });

  it('should create error with cause', () => {
    const cause = new Error('Original');
    const error = new FileNotFoundError('/path/to/file', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('DirectoryNotFoundError', () => {
  it('should create error with path', () => {
    const error = new DirectoryNotFoundError('/path/to/dir');

    expect(error.type).toBe(FileSystemErrorType.DIRECTORY_NOT_FOUND);
    expect(error.message).toContain('/path/to/dir');
    expect(error.path).toBe('/path/to/dir');
    expect(error.name).toBe('DirectoryNotFoundError');
  });
});

describe('PermissionError', () => {
  it('should create error with path', () => {
    const error = new PermissionError('/path/to/file');

    expect(error.type).toBe(FileSystemErrorType.PERMISSION_DENIED);
    expect(error.message).toContain('/path/to/file');
    expect(error.path).toBe('/path/to/file');
    expect(error.name).toBe('PermissionError');
  });
});

describe('DirectoryNotEmptyError', () => {
  it('should create error with path', () => {
    const error = new DirectoryNotEmptyError('/path/to/dir');

    expect(error.type).toBe(FileSystemErrorType.DIRECTORY_NOT_EMPTY);
    expect(error.message).toContain('/path/to/dir');
    expect(error.path).toBe('/path/to/dir');
    expect(error.name).toBe('DirectoryNotEmptyError');
  });
});
