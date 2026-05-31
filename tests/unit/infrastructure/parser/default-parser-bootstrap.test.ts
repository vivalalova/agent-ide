import { afterEach, describe, expect, it } from 'vitest';
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
});
