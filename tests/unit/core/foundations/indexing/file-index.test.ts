import { describe, expect, it } from 'vitest';
import { FileIndex } from '@core/foundations/indexing/file-index.js';
import { createIndexConfig, type FileInfo } from '@core/foundations/indexing/index.js';

function createFileInfo(filePath: string, modifiedTime: Date, size: number): FileInfo {
  return {
    filePath,
    lastModified: modifiedTime,
    size,
    extension: '.ts',
    language: 'typescript',
    checksum: 'checksum'
  };
}

describe('FileIndex', () => {
  it('檔案大小在相同修改時間內變更時，應需要重新索引', async () => {
    const filePath = '/project/src/main.ts';
    const modifiedTime = new Date('2026-07-14T00:00:00.000Z');
    const fileIndex = new FileIndex(createIndexConfig('/project'));

    await fileIndex.addFile(createFileInfo(filePath, modifiedTime, 10));
    await fileIndex.setFileSymbols(filePath, []);

    expect(fileIndex.needsReindexing(filePath, modifiedTime, 20)).toBe(true);
  });
});
