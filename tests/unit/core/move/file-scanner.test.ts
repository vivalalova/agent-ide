import { describe, expect, it } from 'vitest';
import { FileScanner } from '@core/move/file-scanner.js';
import { ImportResolver } from '@core/move/import-resolver.js';
import { ALLOWED_EXTENSIONS } from '@core/move/path-utils.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';

describe('Move FileScanner', () => {
  it('不應因目錄名稱包含 dist 而跳過合法的 distance 目錄', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/src/distance/module.ts': 'export const moduleValue = 1;\n',
      '/project/dist/generated.ts': 'export const generated = 1;\n'
    });
    const importResolver = new ImportResolver({
      pathAliases: {},
      supportedExtensions: ALLOWED_EXTENSIONS
    });
    const scanner = new FileScanner(fileSystem, importResolver);

    const files = await scanner.getAllProjectFiles('/project');

    expect(files).toContain('/project/src/distance/module.ts');
    expect(files).not.toContain('/project/dist/generated.ts');
  });
});
