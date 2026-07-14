import { describe, expect, it } from 'vitest';
import {
  CLI_INDEX_DEFAULTS,
  createIndexConfig,
  shouldIndexFile
} from '@core/foundations/indexing/index.js';

describe('indexing modern module extensions', () => {
  const modernModuleExtensions = ['.mts', '.cts', '.mjs', '.cjs'] as const;

  it('includes TypeScript and JavaScript modern module extensions in CLI defaults', () => {
    expect(CLI_INDEX_DEFAULTS.includeExtensions).toEqual(
      expect.arrayContaining([...modernModuleExtensions])
    );
  });

  it.each(modernModuleExtensions)('indexes %s files with default index config', (extension) => {
    const config = createIndexConfig('/workspace');

    expect(shouldIndexFile(`/workspace/src/module${extension}`, config)).toBe(true);
  });

  it('respects explicit false for persistence', () => {
    const config = createIndexConfig('/workspace', { enablePersistence: false });

    expect(config.enablePersistence).toBe(false);
  });

  it('respects explicitly empty include and exclude pattern lists', () => {
    const config = createIndexConfig('/workspace', {
      includeExtensions: [],
      excludePatterns: []
    });

    expect(config.includeExtensions).toEqual([]);
    expect(config.excludePatterns).toEqual([]);
  });

  it('does not index files under the default dist exclusion directory', () => {
    const config = createIndexConfig('/workspace');

    expect(shouldIndexFile('/workspace/dist/generated.ts', config)).toBe(false);
  });

  // 祖先目錄名撞排除樣式（尚未修復）：shouldIndexFile 直接對絕對檔案路徑套用
  // excludePatterns（如預設的 'dist/**'），未先換算成相對於 workspace root 的路徑，
  // 導致 workspace root 之外的祖先路徑若含與排除樣式同名的完整 segment（如
  // /home/dist/myproj），會被誤判成整個專案都位於排除目錄之下，即使專案內部完全
  // 沒有 dist 目錄。排除樣式的比對基準應是 workspace 相對路徑，不該延伸到 workspace
  // 之外的祖先目錄。
  it('錯誤重現點：workspace root 之外的祖先路徑含 dist 完整 segment 時，不應誤排除整個專案', () => {
    const config = createIndexConfig('/home/dist/myproj');

    expect(shouldIndexFile('/home/dist/myproj/src/a.ts', config)).toBe(true);
  });

  it('釘住既有正確行為：workspace 內部真正的 dist 目錄仍應被排除', () => {
    const config = createIndexConfig('/home/dist/myproj');

    expect(shouldIndexFile('/home/dist/myproj/dist/generated.ts', config)).toBe(false);
  });

  // '..' 前綴誤判（尚未修復）：shouldIndexFile（types.ts:391-395）用
  // `relativePath.startsWith('..')` 判斷「相對化結果是否代表跳出 workspace」，但這是
  // 字串層級的判斷，未區分「字面上以 '..' 開頭的合法目錄名稱」（如 K8s ConfigMap/Secret
  // 掛載卷常見的 `..data` symlink 目錄）與「真正的父目錄跳出」（`..`、`../foo`）。
  // path.relative('/home/dist/myproj', '/home/dist/myproj/..data/foo.ts') 算出的結果是
  // workspace 內部合法的 '..data/foo.ts'（並未跳出 workspace），但其字串恰好以 '..' 開頭，
  // 被誤判為「跳出 workspace」而退回比對絕對路徑 filePath，讓 workspace 之外的祖先
  // segment 'dist'（/home/dist/myproj 的 /home/dist）又誤傷了這個原本合法的檔案。
  it('錯誤重現點：workspace 內字面以 .. 開頭的目錄名稱不應被誤判為跳出 workspace', () => {
    const config = createIndexConfig('/home/dist/myproj');

    expect(shouldIndexFile('/home/dist/myproj/..data/foo.ts', config)).toBe(true);
  });
});
