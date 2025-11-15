import { describe, it, expect } from 'vitest';
import { PathUtils } from '@infrastructure/storage/path-utils';
import * as path from 'path';

describe('PathUtils', () => {
  describe('基本路徑操作', () => {
    it('應該正規化路徑', () => {
      const result = PathUtils.normalize('/foo/bar//baz/');
      expect(result).toMatch(/foo.*bar.*baz/);
    });

    it('應該解析絕對路徑', () => {
      const result = PathUtils.resolve('foo', 'bar');
      expect(PathUtils.isAbsolute(result)).toBe(true);
    });

    it('應該組合路徑片段', () => {
      const result = PathUtils.join('foo', 'bar', 'baz');
      expect(result).toContain('foo');
      expect(result).toContain('bar');
      expect(result).toContain('baz');
    });

    it('應該計算相對路徑', () => {
      const from = '/foo/bar';
      const to = '/foo/baz';
      const result = PathUtils.relative(from, to);
      expect(result).toMatch(/baz/);
    });

    it('應該檢查是否為絕對路徑', () => {
      expect(PathUtils.isAbsolute('/foo/bar')).toBe(true);
      expect(PathUtils.isAbsolute('foo/bar')).toBe(false);
    });

    it('應該獲取目錄名', () => {
      expect(PathUtils.dirname('/foo/bar/baz.txt')).toMatch(/bar/);
    });

    it('應該獲取基礎檔名', () => {
      expect(PathUtils.basename('/foo/bar/baz.txt')).toBe('baz.txt');
      expect(PathUtils.basename('/foo/bar/baz.txt', '.txt')).toBe('baz');
    });

    it('應該獲取副檔名', () => {
      expect(PathUtils.extname('file.txt')).toBe('.txt');
      expect(PathUtils.extname('file')).toBe('');
    });
  });

  describe('路徑解析和格式化', () => {
    it('應該解析路徑為組件', () => {
      const result = PathUtils.parse('/foo/bar/baz.txt');
      expect(result.name).toBe('baz');
      expect(result.ext).toBe('.txt');
      expect(result.base).toBe('baz.txt');
    });

    it('應該從組件格式化路徑', () => {
      const result = PathUtils.format({
        dir: '/foo/bar',
        name: 'baz',
        ext: '.txt'
      });
      expect(result).toContain('baz.txt');
    });
  });

  describe('副檔名操作', () => {
    it('應該確保檔案有指定副檔名', () => {
      expect(PathUtils.ensureExtension('file', '.txt')).toBe('file.txt');
      expect(PathUtils.ensureExtension('file', 'txt')).toBe('file.txt');
      expect(PathUtils.ensureExtension('file.txt', '.md')).toBe('file.txt');
    });

    it('應該變更檔案副檔名', () => {
      expect(PathUtils.changeExtension('file.txt', '.md')).toMatch(/\.md$/);
      expect(PathUtils.changeExtension('file.txt', 'md')).toMatch(/\.md$/);
    });

    it('應該移除檔案副檔名', () => {
      const result = PathUtils.removeExtension('file.txt');
      expect(result).not.toContain('.txt');
      expect(result).toContain('file');
    });
  });

  describe('路徑比較', () => {
    it('應該檢查是否為子路徑', () => {
      expect(PathUtils.isSubPath('/foo', '/foo/bar')).toBe(true);
      expect(PathUtils.isSubPath('/foo', '/foo')).toBe(false);
      expect(PathUtils.isSubPath('/foo', '/bar')).toBe(false);
    });

    it('應該檢查兩個路徑是否相等', () => {
      const path1 = PathUtils.normalize('/foo/bar/./baz');
      const path2 = PathUtils.normalize('/foo/bar/baz');
      expect(PathUtils.equals(path1, path2)).toBe(true);
    });

    it('應該獲取路徑深度', () => {
      expect(PathUtils.getDepth('/foo/bar/baz')).toBeGreaterThan(0);
      expect(PathUtils.getDepth('/foo')).toBeLessThan(PathUtils.getDepth('/foo/bar'));
    });
  });

  describe('共同路徑', () => {
    it('應該找到路徑的共同前綴', () => {
      const paths = ['/foo/bar/a.txt', '/foo/bar/b.txt', '/foo/bar/c.txt'];
      const common = PathUtils.getCommonPath(paths);
      expect(common).toContain('foo');
      expect(common).toContain('bar');
    });

    it('應該處理單一路徑', () => {
      const result = PathUtils.getCommonPath(['/foo/bar/baz.txt']);
      expect(result).toBeDefined();
    });

    it('應該在沒有共同前綴時返回根路徑', () => {
      const paths = ['/foo/bar', '/baz/qux'];
      const result = PathUtils.getCommonPath(paths);
      expect(result).toBe(path.sep);
    });

    it('應該拋出錯誤當路徑陣列為空', () => {
      expect(() => PathUtils.getCommonPath([])).toThrow('至少需要一個路徑');
    });
  });

  describe('路徑轉換', () => {
    it('應該轉換為 Unix 風格路徑', () => {
      const result = PathUtils.toUnix('foo\\bar\\baz');
      expect(result).toBe('foo/bar/baz');
    });

    it('應該轉換為 POSIX 路徑', () => {
      const result = PathUtils.toPosix('foo\\bar\\baz');
      expect(result).not.toContain('\\');
    });
  });

  describe('路徑驗證', () => {
    it('應該驗證有效路徑', () => {
      expect(PathUtils.isValidPath('/foo/bar')).toBe(true);
      expect(PathUtils.isValidPath('foo/bar')).toBe(true);
    });

    it('應該拒絕無效路徑', () => {
      expect(PathUtils.isValidPath('')).toBe(false);
      expect(PathUtils.isValidPath('   ')).toBe(false);
    });

    it('應該拒絕包含無效字元的路徑', () => {
      if (process.platform === 'win32') {
        expect(PathUtils.isValidPath('foo<bar')).toBe(false);
        expect(PathUtils.isValidPath('foo>bar')).toBe(false);
        expect(PathUtils.isValidPath('foo|bar')).toBe(false);
      }
    });
  });

  describe('檔案名稱處理', () => {
    it('應該清理檔案名稱', () => {
      const result = PathUtils.sanitizeFilename('foo<bar>baz.txt');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('應該處理空檔案名稱', () => {
      expect(PathUtils.sanitizeFilename('')).toBe('unnamed');
      expect(PathUtils.sanitizeFilename('   ')).toBe('unnamed');
    });

    it('應該處理過長的檔案名稱', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = PathUtils.sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result).toContain('.txt');
    });
  });

  describe('唯一檔案路徑', () => {
    it('應該返回原路徑如果不存在', async () => {
      const existsChecker = async () => false;
      const result = await PathUtils.getUniqueFilePath('/foo/bar.txt', existsChecker);
      expect(result).toBe('/foo/bar.txt');
    });

    it('應該添加數字後綴如果檔案已存在', async () => {
      let callCount = 0;
      const existsChecker = async (p: string) => {
        callCount++;
        return callCount <= 2; // 前兩次返回 true（存在）
      };
      const result = await PathUtils.getUniqueFilePath('/foo/bar.txt', existsChecker);
      expect(result).toContain('(');
      expect(result).toContain(')');
    });
  });
});
