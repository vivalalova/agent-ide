import { describe, expect, it } from 'vitest';
import { FileUtils } from '@core/foundations/file-utils.js';

describe('FileUtils', () => {
  describe('getFileExtension', () => {
    it('不應把含點號的父目錄誤判成檔案副檔名', () => {
      expect(FileUtils.getFileExtension('/project.v1/src/README')).toBe('');
    });

    it('不應把純隱藏檔名當成副檔名', () => {
      expect(FileUtils.getFileExtension('/project/.gitignore')).toBe('');
    });
  });
});
