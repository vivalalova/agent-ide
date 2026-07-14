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
});
