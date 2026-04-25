import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TypeScriptParser } from '@plugins/typescript/parser.js';

describe('TypeScriptParser', () => {
  let parser: TypeScriptParser;

  beforeEach(() => {
    parser = new TypeScriptParser();
  });

  afterEach(async () => {
    await parser.dispose();
  });

  describe('modern TypeScript module extensions', () => {
    it('registers .mts and .cts as supported TypeScript source files', () => {
      expect(parser.supportedExtensions).toEqual(
        expect.arrayContaining(['.mts', '.cts', '.d.mts', '.d.cts'])
      );
    });

    it.each([
      ['/test/esm-module.mts'],
      ['/test/commonjs-module.cts']
    ])('parses and extracts symbols from %s', async (filePath) => {
      const ast = await parser.parse('export const moduleValue: number = 1;', filePath);
      const symbols = await parser.extractSymbols(ast);

      expect(symbols.map(symbol => symbol.name)).toContain('moduleValue');
    });

    it('recognizes .mts and .cts test files and exclude patterns', () => {
      expect(parser.isTestFile('/src/module.test.mts')).toBe(true);
      expect(parser.isTestFile('/src/module.spec.cts')).toBe(true);
      expect(parser.getDefaultExcludePatterns()).toEqual(
        expect.arrayContaining([
          '**/*.test.mts',
          '**/*.spec.mts',
          '**/*.test.cts',
          '**/*.spec.cts'
        ])
      );
    });
  });
});
