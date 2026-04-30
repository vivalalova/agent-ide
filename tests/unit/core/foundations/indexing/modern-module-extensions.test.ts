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
});
