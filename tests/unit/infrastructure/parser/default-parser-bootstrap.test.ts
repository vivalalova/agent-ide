import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ParserRegistry,
  disposeRegisteredParserModules,
  initializeDefaultParsers,
  initializeParserModules,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import type { ParserPlugin } from '@infrastructure/parser/index.js';
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

  it('registers unclaimed extensions from a parser that also lists existing extensions', () => {
    registerDefaultParserFactory(() => createHybridToyParser());

    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);

    expect(registry.getParser('.ts')?.name).toBe('typescript');
    expect(registry.getParser('.toy')?.name).toBe('hybrid-toy');
  });

  it('disposes a factory parser when registration fails before it enters the registry', () => {
    const dispose = vi.fn();
    registerDefaultParserFactory(() => ({
      ...createToyParser(),
      name: 'typescript',
      supportedExtensions: ['.toy'],
      dispose
    }));

    const registry = ParserRegistry.getInstance();

    expect(() => initializeDefaultParsers(registry)).toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('does not dispose direct ParserPlugin module exports during task cleanup', async () => {
    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);
    const moduleUrl = createDirectParserModuleUrl();

    const first = await initializeParserModules(registry, [moduleUrl]);
    expect(first[0]).toMatchObject({ name: 'direct-toy', disposeOnUnregister: false });

    const second = await initializeParserModules(registry, [moduleUrl]);
    expect(second[0]).toMatchObject({ name: 'direct-toy', disposeOnUnregister: false });
    await disposeRegisteredParserModules(registry, second);

    const parserModuleBeforeFinalRelease = await import(moduleUrl) as { disposeCount: number };
    expect(parserModuleBeforeFinalRelease.disposeCount).toBe(0);
    expect(registry.getParser('.toy')?.name).toBe('direct-toy');

    await disposeRegisteredParserModules(registry, first);
    const parserModule = await import(moduleUrl) as { disposeCount: number };
    expect(parserModule.disposeCount).toBe(1);

    const third = await initializeParserModules(registry, [moduleUrl]);
    expect(third[0]).toMatchObject({ name: 'direct-toy', disposeOnUnregister: false });
    await expect(registry.getParser('.toy')?.parse('', '/tmp/file.toy')).resolves.toBeDefined();
    await disposeRegisteredParserModules(registry, third);
  });

  it('keeps shared factory parser modules alive until every owner releases them', async () => {
    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);
    const moduleUrl = createFactoryParserModuleUrl();

    const first = await initializeParserModules(registry, [moduleUrl]);
    expect(first[0]).toMatchObject({ name: 'factory-toy' });

    const second = await initializeParserModules(registry, [moduleUrl]);
    expect(second[0]).toMatchObject({ name: 'factory-toy', disposeOnUnregister: false });

    await disposeRegisteredParserModules(registry, first);
    await expect(registry.getParser('.toy')?.parse('', '/tmp/file.toy')).resolves.toBeDefined();

    const parserModuleBeforeFinalRelease = await import(moduleUrl) as { disposeCount: number };
    expect(parserModuleBeforeFinalRelease.disposeCount).toBe(0);

    await disposeRegisteredParserModules(registry, second);
    const parserModule = await import(moduleUrl) as { disposeCount: number };
    expect(parserModule.disposeCount).toBe(1);
  });
});

function createHybridToyParser(): ParserPlugin {
  const parser = createToyParser();
  return new Proxy(parser, {
    get(target, property, receiver) {
      if (property === 'name') {
        return 'hybrid-toy';
      }
      if (property === 'supportedExtensions') {
        return ['.ts', '.toy'];
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function createDirectParserModuleUrl(): string {
  const moduleSource = `
    function createRange(line, column, length) {
      return { start: { line, column }, end: { line, column: column + length } };
    }

    export let disposeCount = 0;

    export default {
      name: 'direct-toy',
      version: '1.0.0',
      supportedExtensions: ['.toy'],
      supportedLanguages: ['toy'],
      async parse(code, filePath) {
        if (this.disposed) {
          throw new Error('disposed parser reused');
        }
        return {
          sourceFile: filePath,
          root: {
            type: 'ToyProgram',
            range: createRange(1, 1, Math.max(code.length, 1)),
            properties: { code },
            children: []
          },
          metadata: {
            language: 'toy',
            version: '1.0.0',
            parserOptions: {},
            parseTime: 0,
            nodeCount: 1
          }
        };
      },
      async extractSymbols() { return []; },
      async findReferences() { return []; },
      async extractDependencies() { return []; },
      async rename() { return []; },
      async findDefinition() { return null; },
      async findUsages() { return []; },
      async validate() { return { valid: true, errors: [], warnings: [] }; },
      async dispose() {
        disposeCount++;
        this.disposed = true;
      }
    };
  `;

  return `data:text/javascript,${encodeURIComponent(moduleSource)}`;
}

function createFactoryParserModuleUrl(): string {
  const moduleSource = `
    function createRange(line, column, length) {
      return { start: { line, column }, end: { line, column: column + length } };
    }

    export let disposeCount = 0;

    export function createParser() {
      return {
        name: 'factory-toy',
        version: '1.0.0',
        supportedExtensions: ['.toy'],
        supportedLanguages: ['toy'],
        async parse(code, filePath) {
          if (this.disposed) {
            throw new Error('disposed parser reused');
          }
          return {
            sourceFile: filePath,
            root: {
              type: 'ToyProgram',
              range: createRange(1, 1, Math.max(code.length, 1)),
              properties: { code },
              children: []
            },
            metadata: {
              language: 'toy',
              version: '1.0.0',
              parserOptions: {},
              parseTime: 0,
              nodeCount: 1
            }
          };
        },
        async extractSymbols() { return []; },
        async findReferences() { return []; },
        async extractDependencies() { return []; },
        async rename() { return []; },
        async findDefinition() { return null; },
        async findUsages() { return []; },
        async validate() { return { valid: true, errors: [], warnings: [] }; },
        async dispose() {
          disposeCount++;
          this.disposed = true;
        }
      };
    }
  `;

  return `data:text/javascript,${encodeURIComponent(moduleSource)}`;
}
