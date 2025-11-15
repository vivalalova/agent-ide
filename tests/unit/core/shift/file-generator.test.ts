import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileGenerator } from '@core/shift/file-generator';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock fs module
vi.mock('node:fs');

describe('FileGenerator', () => {
  let generator: FileGenerator;

  beforeEach(() => {
    generator = new FileGenerator();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateUniqueFilename', () => {
    it('應該回傳原始路徑當檔案不存在時', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateUniqueFilename('/test/file', '.ts');

      expect(result.filePath).toBe('/test/file.ts');
      expect(result.isNew).toBe(true);
      expect(result.hasConflict).toBe(false);
      expect(result.originalName).toBeUndefined();
    });

    it('應該生成帶編號的檔名當檔案存在時', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true) // /test/file.ts 存在
        .mockReturnValueOnce(false); // /test/file01.ts 不存在

      const result = generator.generateUniqueFilename('/test/file', '.ts');

      expect(result.filePath).toBe('/test/file01.ts');
      expect(result.isNew).toBe(true);
      expect(result.hasConflict).toBe(true);
      expect(result.originalName).toBe('file.ts');
    });

    it('應該生成帶補零的編號', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true) // /test/file.ts
        .mockReturnValueOnce(true) // /test/file01.ts
        .mockReturnValueOnce(true) // /test/file02.ts
        .mockReturnValueOnce(false); // /test/file03.ts

      const result = generator.generateUniqueFilename('/test/file', '.ts');

      expect(result.filePath).toBe('/test/file03.ts');
      expect(result.hasConflict).toBe(true);
    });

    it('應該拋出錯誤當達到 100 個檔案限制', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      expect(() => {
        generator.generateUniqueFilename('/test/file', '.ts');
      }).toThrow('無法生成唯一檔名：已存在 100 個相同名稱的檔案');
    });

    it('應該處理不同的副檔名', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const tsResult = generator.generateUniqueFilename('/test/file', '.ts');
      expect(tsResult.filePath).toBe('/test/file.ts');

      const jsResult = generator.generateUniqueFilename('/test/file', '.js');
      expect(jsResult.filePath).toBe('/test/file.js');
    });

    it('應該處理空的基礎路徑', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateUniqueFilename('', '.ts');
      expect(result.filePath).toBe('.ts');
    });
  });

  describe('generateFromTargetPath', () => {
    it('應該使用目標路徑的副檔名當已指定時', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateFromTargetPath('/target/file.js', '.ts', '/output');

      expect(result.filePath).toBe(path.join('/output', 'file.js'));
      expect(result.hasConflict).toBe(false);
    });

    it('應該使用來源副檔名當目標路徑沒有副檔名時', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateFromTargetPath('/target/file', '.ts', '/output');

      expect(result.filePath).toBe(path.join('/output', 'file.ts'));
    });

    it('應該處理目標路徑為 newfile 的情況', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateFromTargetPath('newfile', '.ts', '/output');

      expect(result.filePath).toBe(path.join('/output', 'newfile.ts'));
    });

    it('應該處理檔名衝突', () => {
      vi.spyOn(fs, 'existsSync')
        .mockReturnValueOnce(true) // 原檔案存在
        .mockReturnValueOnce(false); // 編號檔案不存在

      const result = generator.generateFromTargetPath('/target/file.ts', '.ts', '/output');

      expect(result.filePath).toBe(path.join('/output', 'file01.ts'));
      expect(result.hasConflict).toBe(true);
    });

    it('應該處理複雜的目標路徑', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateFromTargetPath('/some/nested/path/file.ts', '.js', '/output/dir');

      expect(result.filePath).toBe(path.join('/output/dir', 'file.ts'));
    });
  });

  describe('ensureDirectoryExists', () => {
    it('應該建立不存在的目錄', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      generator.ensureDirectoryExists('/test/dir');

      expect(mkdirSpy).toHaveBeenCalledWith('/test/dir', { recursive: true });
    });

    it('應該不建立已存在的目錄', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      generator.ensureDirectoryExists('/test/dir');

      expect(mkdirSpy).not.toHaveBeenCalled();
    });

    it('應該使用遞迴選項建立巢狀目錄', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);

      generator.ensureDirectoryExists('/test/nested/deep/dir');

      expect(mkdirSpy).toHaveBeenCalledWith('/test/nested/deep/dir', { recursive: true });
    });
  });

  describe('createFile', () => {
    it('應該建立檔案和父目錄', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      generator.createFile('/test/dir/file.ts', 'content');

      expect(mkdirSpy).toHaveBeenCalledWith('/test/dir', { recursive: true });
      expect(writeSpy).toHaveBeenCalledWith('/test/dir/file.ts', 'content', 'utf-8');
    });

    it('應該建立空檔案', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      generator.createFile('/test/file.ts', '');

      expect(writeSpy).toHaveBeenCalledWith('/test/file.ts', '', 'utf-8');
    });

    it('應該處理根目錄的檔案', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      generator.createFile('/file.ts', 'content');

      expect(writeSpy).toHaveBeenCalledWith('/file.ts', 'content', 'utf-8');
    });

    it('應該寫入多行內容', () => {
      const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

      const content = 'line1\nline2\nline3';
      generator.createFile('/test/file.ts', content);

      expect(writeSpy).toHaveBeenCalledWith('/test/file.ts', content, 'utf-8');
    });
  });

  describe('邊界情況', () => {
    it('應該處理 existsSync 拋出錯誤', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = generator.generateUniqueFilename('/test/file', '.ts');

      // 當 existsSync 拋出錯誤時，fileExists 回傳 false
      expect(result.filePath).toBe('/test/file.ts');
      expect(result.hasConflict).toBe(false);
    });

    it('應該處理特殊字元的檔名', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateUniqueFilename('/test/file-name_with.special', '.ts');

      expect(result.filePath).toBe('/test/file-name_with.special.ts');
    });

    it('應該處理沒有路徑分隔符的檔名', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateFromTargetPath('file.ts', '.js', '/output');

      expect(result.filePath).toBe(path.join('/output', 'file.ts'));
    });

    it('應該處理空字串的副檔名', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const result = generator.generateUniqueFilename('/test/file', '');

      expect(result.filePath).toBe('/test/file');
    });
  });
});
