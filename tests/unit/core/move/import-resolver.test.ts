import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { ImportResolver } from '@core/move/import-resolver.js';

describe('ImportResolver', () => {
  describe('calculateRelativePath', () => {
    it.each([
      ['component.ts', './component'],
      ['component.tsx', './component'],
      ['component.js', './component'],
      ['component.jsx', './component'],
      ['component.vue', './component']
    ])('Given a supported target file %s, when calculating a relative import, then strips the extension', (fileName, expected) => {
      const resolver = new ImportResolver({
        pathAliases: {},
        supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue']
      });
      const fromPath = path.join('/workspace/project/src/pages', 'home.ts');
      const toPath = path.join('/workspace/project/src/pages', fileName);

      expect(resolver.calculateRelativePath(fromPath, toPath)).toBe(expected);
    });

    it('Given an unsupported target file, when calculating a relative import, then keeps the extension', () => {
      const resolver = new ImportResolver({
        pathAliases: {},
        supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue']
      });

      expect(
        resolver.calculateRelativePath(
          '/workspace/project/src/pages/home.ts',
          '/workspace/project/src/pages/styles.css'
        )
      ).toBe('./styles.css');
    });
  });
});
