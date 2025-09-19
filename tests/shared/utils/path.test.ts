import { describe, it, expect } from 'vitest';
import {
  isAbsolute,
  normalize,
  relative,
  changeExtension,
  ensureExtension,
  getFileNameWithoutExt,
  isSubPath,
  toUnixPath,
  toWindowsPath
} from '../../../src/shared/utils/path';

describe('路徑工具函式', () => {
  describe('isAbsolute', () => {
    it('應該識別絕對路徑', () => {
      expect(isAbsolute('/usr/local/bin')).toBe(true);
      expect(isAbsolute('/home/user')).toBe(true);
      expect(isAbsolute('C:\\Program Files')).toBe(true);
      expect(isAbsolute('D:\\Users\\user')).toBe(true);
    });

    it('應該識別相對路徑', () => {
      expect(isAbsolute('src/utils')).toBe(false);
      expect(isAbsolute('./src/utils')).toBe(false);
      expect(isAbsolute('../utils')).toBe(false);
      expect(isAbsolute('utils')).toBe(false);
    });

    it('應該處理空字串', () => {
      expect(isAbsolute('')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('應該正規化路徑', () => {
      expect(normalize('src//utils///path.ts')).toBe('src/utils/path.ts');
      expect(normalize('src/./utils/path.ts')).toBe('src/utils/path.ts');
      expect(normalize('src/../src/utils/path.ts')).toBe('src/utils/path.ts');
      expect(normalize('./src/utils')).toBe('src/utils');
    });

    it('應該處理絕對路徑', () => {
      expect(normalize('/src//utils///path.ts')).toBe('/src/utils/path.ts');
      expect(normalize('/src/../utils/path.ts')).toBe('/utils/path.ts');
    });

    it('應該處理 Windows 路徑', () => {
      expect(normalize('C:\\src\\\\utils\\path.ts')).toBe('C:/src/utils/path.ts');
      expect(normalize('C:\\src\\..\\utils\\path.ts')).toBe('C:/utils/path.ts');
    });

    it('應該處理空字串', () => {
      expect(normalize('')).toBe('');
    });
  });

  describe('relative', () => {
    it('應該計算相對路徑', () => {
      expect(relative('/src/utils', '/src/utils/path.ts')).toBe('path.ts');
      expect(relative('/src/utils', '/src/shared/types.ts')).toBe('../shared/types.ts');
      expect(relative('/src', '/src/utils/path.ts')).toBe('utils/path.ts');
    });

    it('應該處理相同路徑', () => {
      expect(relative('/src/utils', '/src/utils')).toBe('.');
    });

    it('應該處理根目錄', () => {
      expect(relative('/', '/src/utils')).toBe('src/utils');
      expect(relative('/src/utils', '/')).toBe('../..');
    });
  });

  describe('changeExtension', () => {
    it('應該變更副檔名', () => {
      expect(changeExtension('file.txt', '.js')).toBe('file.js');
      expect(changeExtension('path/to/file.ts', '.d.ts')).toBe('path/to/file.d.ts');
      expect(changeExtension('file.test.js', '.ts')).toBe('file.test.ts');
    });

    it('應該處理沒有副檔名的檔案', () => {
      expect(changeExtension('file', '.txt')).toBe('file.txt');
      expect(changeExtension('path/to/file', '.js')).toBe('path/to/file.js');
    });

    it('應該處理移除副檔名', () => {
      expect(changeExtension('file.txt', '')).toBe('file');
      expect(changeExtension('path/to/file.js', '')).toBe('path/to/file');
    });

    it('應該處理空字串', () => {
      expect(changeExtension('', '.txt')).toBe('');
    });
  });

  describe('ensureExtension', () => {
    it('應該確保副檔名存在', () => {
      expect(ensureExtension('file', '.txt')).toBe('file.txt');
      expect(ensureExtension('path/to/file', '.js')).toBe('path/to/file.js');
    });

    it('應該保留現有的副檔名', () => {
      expect(ensureExtension('file.txt', '.txt')).toBe('file.txt');
      expect(ensureExtension('path/to/file.js', '.js')).toBe('path/to/file.js');
    });

    it('應該處理不同的副檔名', () => {
      expect(ensureExtension('file.txt', '.js')).toBe('file.txt');
      expect(ensureExtension('file.js', '.ts')).toBe('file.js');
    });

    it('應該處理空字串', () => {
      expect(ensureExtension('', '.txt')).toBe('');
    });
  });

  describe('getFileNameWithoutExt', () => {
    it('應該取得不含副檔名的檔名', () => {
      expect(getFileNameWithoutExt('file.txt')).toBe('file');
      expect(getFileNameWithoutExt('path/to/file.js')).toBe('file');
      expect(getFileNameWithoutExt('/usr/local/bin/node')).toBe('node');
    });

    it('應該處理多個副檔名', () => {
      expect(getFileNameWithoutExt('file.test.js')).toBe('file.test');
      expect(getFileNameWithoutExt('component.d.ts')).toBe('component.d');
    });

    it('應該處理沒有副檔名的檔案', () => {
      expect(getFileNameWithoutExt('file')).toBe('file');
      expect(getFileNameWithoutExt('path/to/file')).toBe('file');
    });

    it('應該處理隱藏檔案', () => {
      expect(getFileNameWithoutExt('.gitignore')).toBe('.gitignore');
      expect(getFileNameWithoutExt('.env.local')).toBe('.env');
    });

    it('應該處理空字串', () => {
      expect(getFileNameWithoutExt('')).toBe('');
    });
  });

  describe('isSubPath', () => {
    it('應該識別子路徑', () => {
      expect(isSubPath('/src', '/src/utils')).toBe(true);
      expect(isSubPath('/src/utils', '/src/utils/path.ts')).toBe(true);
      expect(isSubPath('/usr/local', '/usr/local/bin/node')).toBe(true);
    });

    it('應該識別非子路徑', () => {
      expect(isSubPath('/src/utils', '/src/shared')).toBe(false);
      expect(isSubPath('/usr/local', '/usr/bin')).toBe(false);
      expect(isSubPath('/src', '/source')).toBe(false);
    });

    it('應該處理相同路徑', () => {
      expect(isSubPath('/src/utils', '/src/utils')).toBe(true);
    });

    it('應該處理相對路徑', () => {
      expect(isSubPath('src', 'src/utils')).toBe(true);
      expect(isSubPath('./src', './src/utils')).toBe(true);
    });
  });

  describe('toUnixPath', () => {
    it('應該轉換 Windows 路徑為 Unix 路徑', () => {
      expect(toUnixPath('C:\\src\\utils\\path.ts')).toBe('C:/src/utils/path.ts');
      expect(toUnixPath('src\\utils\\path.ts')).toBe('src/utils/path.ts');
      expect(toUnixPath('..\\..\\utils\\path.ts')).toBe('../../utils/path.ts');
    });

    it('應該保留 Unix 路徑不變', () => {
      expect(toUnixPath('/src/utils/path.ts')).toBe('/src/utils/path.ts');
      expect(toUnixPath('./src/utils/path.ts')).toBe('./src/utils/path.ts');
    });

    it('應該處理混合路徑', () => {
      expect(toUnixPath('C:/src\\utils/path.ts')).toBe('C:/src/utils/path.ts');
    });

    it('應該處理空字串', () => {
      expect(toUnixPath('')).toBe('');
    });
  });

  describe('toWindowsPath', () => {
    it('應該轉換 Unix 路徑為 Windows 路徑', () => {
      expect(toWindowsPath('/src/utils/path.ts')).toBe('\\src\\utils\\path.ts');
      expect(toWindowsPath('src/utils/path.ts')).toBe('src\\utils\\path.ts');
      expect(toWindowsPath('../../utils/path.ts')).toBe('..\\..\\utils\\path.ts');
    });

    it('應該保留 Windows 路徑不變', () => {
      expect(toWindowsPath('C:\\src\\utils\\path.ts')).toBe('C:\\src\\utils\\path.ts');
      expect(toWindowsPath('src\\utils\\path.ts')).toBe('src\\utils\\path.ts');
    });

    it('應該處理混合路徑', () => {
      expect(toWindowsPath('C:/src\\utils/path.ts')).toBe('C:\\src\\utils\\path.ts');
    });

    it('應該處理空字串', () => {
      expect(toWindowsPath('')).toBe('');
    });
  });
});