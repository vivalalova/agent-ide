import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ParserRegistry,
  initializeDefaultParsers,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { createToyParser } from '../../../helpers/toy-parser.js';

describe('default parser bootstrap', () => {
  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('registers built-in parsers and extra parser factories through one bootstrap path', () => {
    registerDefaultParserFactory(() => createToyParser());

    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);

    expect(registry.getParser('.ts')?.name).toBe('typescript');
    expect(registry.getParser('.js')?.name).toBe('javascript');
    expect(registry.getParser('.toy')?.name).toBe('toy');
    expect(registry.getSupportedExtensions()).toContain('.toy');
  });

  it('disposes parser instances created for extensions that are already registered', () => {
    const duplicateDispose = vi.fn();
    registerDefaultParserFactory(() => createToyParser());
    registerDefaultParserFactory(() => ({
      ...createToyParser(),
      name: 'duplicate-toy',
      dispose: duplicateDispose
    }));

    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);

    expect(registry.getParser('.toy')?.name).toBe('toy');
    expect(duplicateDispose).toHaveBeenCalledTimes(1);
  });
});
