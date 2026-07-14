import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import type { ParserPlugin, ValidationResult } from '@infrastructure/parser/index.js';
import { createToyParser } from '../../../helpers/toy-parser.js';

describe('ParserRegistry lifecycle', () => {
  afterEach(() => {
    ParserRegistry.resetInstance();
  });

  it('revalidates parsers registered after initialization', async () => {
    const registry = ParserRegistry.getInstance();
    await registry.initialize();

    const validate = vi.fn<() => Promise<ValidationResult>>(
      async () => ({ valid: true, errors: [], warnings: [] })
    );
    const lateParser = new Proxy(createToyParser(), {
      get(target, property, receiver) {
        if (property === 'name') {
          return 'late-toy';
        }
        if (property === 'supportedExtensions') {
          return ['.late-toy'];
        }
        if (property === 'supportedLanguages') {
          return ['late-toy'];
        }
        if (property === 'validate') {
          return validate;
        }
        return Reflect.get(target, property, receiver);
      }
    }) as ParserPlugin;

    registry.register(lateParser);
    await registry.initialize();

    expect(validate).toHaveBeenCalledTimes(1);
  });
});
