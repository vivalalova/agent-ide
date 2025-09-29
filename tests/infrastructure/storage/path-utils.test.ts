import { describe, it, expect } from 'vitest';
import { PathUtils } from '../../../src/infrastructure/storage/path-utils';
import path from 'path';

describe('PathUtils', () => {
  describe('normalize', () => {
    it('應該正規化路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.normalize('/test//path///file.txt')).toBe('/test/path/file.txt');
      expect(PathUtils.normalize('/test/./path/../file.txt')).toBe('/test/file.txt');
      expect(PathUtils.normalize('test/path/file.txt')).toBe('test/path/file.txt');
    });

    it('應該處理空路徑和點路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.normalize('')).toBe('.');
      expect(PathUtils.normalize('.')).toBe('.');
      expect(PathUtils.normalize('./')).toBe('./'); // path.normalize('./')在某些平台返回 './'
      expect(PathUtils.normalize('../')).toBe('../'); // 同樣調整
    });
  });

  describe('resolve', () => {
    it('應該解析為絕對路徑', () => {
      // Arrange
      const relativePath = 'test/file.txt';
      const expected = path.resolve(relativePath);

      // Act
      const result = PathUtils.resolve(relativePath);

      // Assert
      expect(result).toBe(expected);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('應該解析多個路徑片段', () => {
      // Arrange
      const segments = ['test', 'nested', 'file.txt'];
      const expected = path.resolve(...segments);

      // Act
      const result = PathUtils.resolve(...segments);

      // Assert
      expect(result).toBe(expected);
    });
  });

  describe('join', () => {
    it('應該組合路徑片段', () => {
      // Arrange & Act & Assert
      expect(PathUtils.join('test', 'path', 'file.txt')).toBe('test/path/file.txt');
      expect(PathUtils.join('/root', 'test', 'file.txt')).toBe('/root/test/file.txt');
      expect(PathUtils.join('test/', '/path/', 'file.txt')).toBe('test/path/file.txt');
    });

    it('應該處理空字串和單點', () => {
      // Arrange & Act & Assert
      expect(PathUtils.join('test', '', 'file.txt')).toBe('test/file.txt');
      expect(PathUtils.join('test', '.', 'file.txt')).toBe('test/file.txt');
    });
  });

  describe('relative', () => {
    it('應該計算相對路徑', () => {
      // Arrange
      const from = '/test/current';
      const to = '/test/target/file.txt';

      // Act
      const result = PathUtils.relative(from, to);

      // Assert
      expect(result).toBe('../target/file.txt');
    });

    it('應該處理同一目錄的情況', () => {
      // Arrange
      const from = '/test/dir';
      const to = '/test/dir/file.txt';

      // Act
      const result = PathUtils.relative(from, to);

      // Assert
      expect(result).toBe('file.txt');
    });
  });

  describe('isAbsolute', () => {
    it('應該正確識別絕對路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.isAbsolute('/test/file.txt')).toBe(true);
      expect(PathUtils.isAbsolute('test/file.txt')).toBe(false);
      expect(PathUtils.isAbsolute('./test/file.txt')).toBe(false);
      expect(PathUtils.isAbsolute('../test/file.txt')).toBe(false);
    });

    it('應該處理 Windows 風格的路徑', () => {
      // 只在 Windows 環境下測試
      if (process.platform === 'win32') {
        expect(PathUtils.isAbsolute('C:\\test\\file.txt')).toBe(true);
        expect(PathUtils.isAbsolute('\\\\server\\share')).toBe(true);
      }
    });
  });

  describe('dirname', () => {
    it('應該返回目錄名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.dirname('/test/path/file.txt')).toBe('/test/path');
      expect(PathUtils.dirname('test/path/file.txt')).toBe('test/path');
      expect(PathUtils.dirname('file.txt')).toBe('.');
      expect(PathUtils.dirname('/')).toBe('/');
    });
  });

  describe('basename', () => {
    it('應該返回基礎檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.basename('/test/path/file.txt')).toBe('file.txt');
      expect(PathUtils.basename('/test/path/file.txt', '.txt')).toBe('file');
      expect(PathUtils.basename('/test/path/')).toBe('path');
      expect(PathUtils.basename('file.txt')).toBe('file.txt');
    });
  });

  describe('extname', () => {
    it('應該返回副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.extname('file.txt')).toBe('.txt');
      expect(PathUtils.extname('file.min.js')).toBe('.js');
      expect(PathUtils.extname('file')).toBe('');
      expect(PathUtils.extname('/test/path/file.txt')).toBe('.txt');
    });
  });

  describe('parse', () => {
    it('應該解析路徑為組件', () => {
      // Arrange
      const filePath = '/test/path/file.txt';

      // Act
      const result = PathUtils.parse(filePath);

      // Assert
      expect(result.root).toBe('/');
      expect(result.dir).toBe('/test/path');
      expect(result.base).toBe('file.txt');
      expect(result.ext).toBe('.txt');
      expect(result.name).toBe('file');
    });

    it('應該處理相對路徑', () => {
      // Arrange
      const filePath = 'test/path/file.min.js';

      // Act
      const result = PathUtils.parse(filePath);

      // Assert
      expect(result.root).toBe('');
      expect(result.dir).toBe('test/path');
      expect(result.base).toBe('file.min.js');
      expect(result.ext).toBe('.js');
      expect(result.name).toBe('file.min');
    });
  });

  describe('format', () => {
    it('應該從組件格式化路徑', () => {
      // Arrange
      const pathObj = {
        dir: '/test/path',
        name: 'file',
        ext: '.txt'
      };

      // Act
      const result = PathUtils.format(pathObj);

      // Assert
      expect(result).toBe('/test/path/file.txt');
    });

    it('應該處理 base 覆蓋 name 和 ext', () => {
      // Arrange
      const pathObj = {
        dir: '/test/path',
        base: 'override.js',
        name: 'file',
        ext: '.txt'
      };

      // Act
      const result = PathUtils.format(pathObj);

      // Assert
      expect(result).toBe('/test/path/override.js');
    });
  });

  describe('isSubPath', () => {
    it('應該檢查是否為子路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.isSubPath('/test', '/test/sub/file.txt')).toBe(true);
      expect(PathUtils.isSubPath('/test/', '/test/sub/file.txt')).toBe(true);
      expect(PathUtils.isSubPath('/test', '/test')).toBe(false); // 相同路徑不算子路徑
      expect(PathUtils.isSubPath('/test', '/other/file.txt')).toBe(false);
      expect(PathUtils.isSubPath('/test', '/testing/file.txt')).toBe(false); // 避免前綴匹配
    });
  });

  describe('getCommonPath', () => {
    it('應該找到路徑的共同前綴', () => {
      // Arrange
      const paths = ['/test/a/file1.txt', '/test/b/file2.txt', '/test/c/file3.txt'];

      // Act
      const result = PathUtils.getCommonPath(paths);

      // Assert
      expect(result).toBe('/test');
    });

    it('應該處理沒有共同路徑的情況', () => {
      // Arrange
      const paths = ['/test/file.txt', '/other/file.txt'];

      // Act
      const result = PathUtils.getCommonPath(paths);

      // Assert
      expect(result).toBe('/');
    });

    it('應該處理單一路徑', () => {
      // Arrange
      const paths = ['/test/path/file.txt'];

      // Act
      const result = PathUtils.getCommonPath(paths);

      // Assert
      expect(result).toBe('/test/path');
    });

    it('應該處理空陣列', () => {
      // Arrange
      const paths: string[] = [];

      // Act & Assert
      expect(() => PathUtils.getCommonPath(paths)).toThrow('至少需要一個路徑');
    });
  });

  describe('ensureExtension', () => {
    it('應該確保檔案有指定副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.ensureExtension('file', '.txt')).toBe('file.txt');
      expect(PathUtils.ensureExtension('file.txt', '.txt')).toBe('file.txt');
      expect(PathUtils.ensureExtension('file.js', '.txt')).toBe('file.js'); // 不覆蓋現有副檔名
    });

    it('應該處理沒有點的副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.ensureExtension('file', 'txt')).toBe('file.txt');
    });
  });

  describe('changeExtension', () => {
    it('應該變更檔案副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.changeExtension('file.txt', '.js')).toBe('file.js');
      expect(PathUtils.changeExtension('path/file.min.js', '.ts')).toBe('path/file.min.ts');
      expect(PathUtils.changeExtension('file', '.txt')).toBe('file.txt');
    });

    it('應該處理沒有點的副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.changeExtension('file.txt', 'js')).toBe('file.js');
    });
  });

  describe('removeExtension', () => {
    it('應該移除檔案副檔名', () => {
      // Arrange & Act & Assert
      expect(PathUtils.removeExtension('file.txt')).toBe('file');
      expect(PathUtils.removeExtension('path/file.min.js')).toBe('path/file.min');
      expect(PathUtils.removeExtension('file')).toBe('file');
    });
  });

  describe('toUnix', () => {
    it('應該轉換為 Unix 風格路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.toUnix('test\\path\\file.txt')).toBe('test/path/file.txt');
      expect(PathUtils.toUnix('C:\\Windows\\System32')).toBe('C:/Windows/System32');
      expect(PathUtils.toUnix('test/path/file.txt')).toBe('test/path/file.txt');
    });
  });

  describe('toPosix', () => {
    it('應該轉換為 POSIX 路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.toPosix('test\\path\\file.txt')).toBe('test/path/file.txt');
      expect(PathUtils.toPosix('test/path/file.txt')).toBe('test/path/file.txt');
    });
  });

  describe('isValidPath', () => {
    it('應該驗證有效路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.isValidPath('test/path/file.txt')).toBe(true);
      expect(PathUtils.isValidPath('/test/path/file.txt')).toBe(true);
      expect(PathUtils.isValidPath('file.txt')).toBe(true);
    });

    it('應該識別無效路徑', () => {
      // Arrange & Act & Assert
      expect(PathUtils.isValidPath('')).toBe(false);
      expect(PathUtils.isValidPath('test/path/<invalid>.txt')).toBe(false);
      expect(PathUtils.isValidPath('test/path/|invalid|.txt')).toBe(false);

      // Windows 特有的無效字元
      if (process.platform === 'win32') {
        expect(PathUtils.isValidPath('test:invalid.txt')).toBe(false);
        expect(PathUtils.isValidPath('test*invalid.txt')).toBe(false);
      }
    });
  });
});