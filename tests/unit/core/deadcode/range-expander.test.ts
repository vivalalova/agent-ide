import { describe, expect, it, vi } from 'vitest';
import { RangeExpander } from '@core/deadcode/range-expander.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ParserPlugin } from '@infrastructure/parser/interface.js';
import { SymbolType } from '@shared/types/symbol.js';

function createParserRegistry(parser: Partial<ParserPlugin> | null): ParserRegistry {
  return {
    getParser: vi.fn().mockReturnValue(parser)
  } as unknown as ParserRegistry;
}

describe('RangeExpander', () => {
  it('does not include a separated file header when parser fullStart is too broad', () => {
    const content = [
      '/**',
      ' * File header',
      ' */',
      '',
      '/**',
      ' * Unused helper.',
      ' */',
      'function unused() {',
      '  return 1;',
      '}',
      ''
    ].join('\n');
    const parser = {
      getFullDeclarationRange: vi.fn().mockReturnValue({
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 10, column: 2, offset: content.length - 1 }
      })
    };
    const expander = new RangeExpander(createParserRegistry(parser));

    const range = expander.expandRangeToFullDeclaration(
      content,
      {
        start: { line: 8, column: 1, offset: 0 },
        end: { line: 10, column: 2, offset: 0 }
      },
      SymbolType.Function,
      'unused',
      '/src/file.ts'
    );

    expect(range.start.line).toBe(5);
  });

  it('falls back without crossing a blank line before a declaration', () => {
    const content = [
      '/**',
      ' * File header',
      ' */',
      '',
      'function unused() {',
      '  return 1;',
      '}',
      ''
    ].join('\n');
    const expander = new RangeExpander(createParserRegistry(null));

    const range = expander.expandRangeToFullDeclaration(
      content,
      {
        start: { line: 5, column: 1, offset: 0 },
        end: { line: 7, column: 2, offset: 0 }
      },
      SymbolType.Function,
      'unused',
      '/src/file.ts'
    );

    expect(range.start.line).toBe(5);
  });

  it('recovers the declaration line when the incoming range starts on a JSDoc closing line', () => {
    const content = [
      '/**',
      ' * File header',
      ' */',
      '',
      '/**',
      ' * Unused helper.',
      ' */',
      'function unused() {',
      '  return 1;',
      '}',
      ''
    ].join('\n');
    const expander = new RangeExpander(createParserRegistry(null));

    const range = expander.expandRangeToFullDeclaration(
      content,
      {
        start: { line: 7, column: 1, offset: 0 },
        end: { line: 10, column: 2, offset: 0 }
      },
      SymbolType.Function,
      'unused',
      '/src/file.ts'
    );

    expect(range.start.line).toBe(5);
  });
});
