import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vol } from 'memfs';

// Mock modules
vi.mock('fs/promises', async () => {
  const memfs = await vi.importActual('memfs') as any;
  return memfs.fs.promises;
});

vi.mock('fs', async () => {
  const memfs = await vi.importActual('memfs') as any;
  return memfs.fs;
});

vi.mock('glob', () => ({
  glob: vi.fn(async (pattern: string) => {
    // 基本的 glob 模擬
    if (pattern.includes('*.txt')) {
      if (pattern.includes('**')) {
        // 遞迴搜尋
        return ['/test/file1.txt', '/test/sub/file2.txt', '/test/sub/deep/file3.txt'];
      } else {
        // 單層搜尋
        return ['/test/file1.txt', '/test/file2.txt'];
      }
    }
    return [];
  }),
}));

// 在 mock 之後 import FileSystem
import { FileSystem } from '../../../src/infrastructure/storage/file-system';
import { FileNotFoundError, DirectoryNotFoundError, PermissionError, DirectoryNotEmptyError } from '../../../src/infrastructure/storage/types';

describe('FileSystem Fixed Tests', () => {
  let fs: FileSystem;

  beforeEach(() => {
    vol.reset();
    fs = new FileSystem();
  });

  describe('基本檔案操作', () => {
    it('應該能夠讀取存在的檔案', async () => {
      // Arrange
      const filePath = '/test.txt';
      const content = 'Hello, World!';
      vol.fromJSON({ [filePath]: content });

      // Act
      const result = await fs.readFile(filePath, 'utf8');

      // Assert
      expect(result).toBe(content);
    });

    it('應該能夠寫入檔案', async () => {
      // Arrange
      const filePath = '/test.txt';
      const content = 'New content';

      // Act
      await fs.writeFile(filePath, content);

      // Assert
      const result = vol.readFileSync(filePath, 'utf8');
      expect(result).toBe(content);
    });

    it('應該能夠檢查檔案是否存在', async () => {
      // Arrange
      const existingFile = '/existing.txt';
      const nonExistingFile = '/non-existing.txt';
      vol.fromJSON({ [existingFile]: 'content' });

      // Act & Assert
      expect(await fs.exists(existingFile)).toBe(true);
      expect(await fs.exists(nonExistingFile)).toBe(false);
    });

    it('應該能夠刪除檔案', async () => {
      // Arrange
      const filePath = '/test.txt';
      vol.fromJSON({ [filePath]: 'content' });

      // Act
      await fs.deleteFile(filePath);

      // Assert
      expect(vol.existsSync(filePath)).toBe(false);
    });

    it('讀取不存在的檔案時應該拋出 FileNotFoundError', async () => {
      // Arrange
      const filePath = '/non-existent.txt';

      // Act & Assert
      await expect(fs.readFile(filePath)).rejects.toThrow(FileNotFoundError);
    });
  });

  describe('目錄操作', () => {
    it('應該能夠建立目錄', async () => {
      // Arrange
      const dirPath = '/test-dir';

      // Act
      await fs.createDirectory(dirPath);

      // Assert
      expect(vol.existsSync(dirPath)).toBe(true);
    });

    it('應該能夠讀取目錄內容', async () => {
      // Arrange
      vol.fromJSON({
        '/test/file1.txt': 'content1',
        '/test/file2.js': 'content2',
        '/test/subdir/nested.txt': 'nested'
      });

      // Act
      const entries = await fs.readDirectory('/test');

      // Assert
      expect(entries).toHaveLength(3);
      const fileEntry = entries.find(e => e.name === 'file1.txt');
      expect(fileEntry).toBeDefined();
      expect(fileEntry!.isFile).toBe(true);
    });
  });

  describe('批次操作', () => {
    it('應該能夠複製檔案', async () => {
      // Arrange
      const srcPath = '/source.txt';
      const destPath = '/destination.txt';
      const content = 'Content to copy';
      vol.fromJSON({ [srcPath]: content });

      // Act
      await fs.copyFile(srcPath, destPath);

      // Assert
      expect(vol.readFileSync(destPath, 'utf8')).toBe(content);
      expect(vol.existsSync(srcPath)).toBe(true); // 原檔案應該還在
    });

    it('應該能夠移動檔案', async () => {
      // Arrange
      const srcPath = '/source.txt';
      const destPath = '/destination.txt';
      const content = 'Content to move';
      vol.fromJSON({ [srcPath]: content });

      // Act
      await fs.moveFile(srcPath, destPath);

      // Assert
      expect(vol.readFileSync(destPath, 'utf8')).toBe(content);
      expect(vol.existsSync(srcPath)).toBe(false); // 原檔案應該不存在
    });
  });

  describe('glob 搜尋', () => {
    it('應該能夠搜尋符合模式的檔案', async () => {
      // Arrange - glob 會被 mock 處理
      const pattern = '/test/*.txt';

      // Act
      const results = await fs.glob(pattern);

      // Assert
      expect(results).toHaveLength(2);
      expect(results).toContain('/test/file1.txt');
      expect(results).toContain('/test/file2.txt');
    });
  });
});