import { describe, expect, it, vi } from 'vitest';
import { ReferenceUpdater } from '@core/rename/reference-updater.js';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { FileStats } from '@infrastructure/storage/types.js';

function createStats(size: number, modifiedTime: Date): FileStats {
  return {
    isFile: true,
    isDirectory: false,
    size,
    createdTime: modifiedTime,
    modifiedTime,
    accessedTime: modifiedTime,
    mode: 0o644
  };
}

describe('ReferenceUpdater', () => {
  it('內容在相同修改時間內變更時，不應繼續使用舊快取', async () => {
    const filePath = '/src/consumer.ts';
    const modifiedTime = new Date('2026-07-14T00:00:00.000Z');
    let content = 'oldName();';
    const fileSystem = {
      readFile: vi.fn(async () => content),
      getStats: vi.fn(async () => createStats(content.length, modifiedTime))
    } as unknown as IFileSystem;
    const updater = new ReferenceUpdater(undefined, fileSystem);

    await expect(updater.findReferencingFiles('oldName', [filePath])).resolves.toEqual([filePath]);

    content = 'replacement();';

    await expect(updater.findReferencingFiles('oldName', [filePath])).resolves.toEqual([]);
    expect(fileSystem.readFile).toHaveBeenCalledTimes(2);
  });
});
