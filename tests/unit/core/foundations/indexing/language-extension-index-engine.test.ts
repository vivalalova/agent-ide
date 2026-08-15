import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IndexEngine,
  createIndexConfig
} from '@core/foundations/indexing/index.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import { createToyParser } from '../../../../helpers/toy-parser.js';

const TOY_PARSER_MODULE = path.resolve('tests/fixtures/toy-parser.mjs');
const DIRECT_TOY_PARSER_MODULE = path.resolve('tests/fixtures/direct-disposable-toy-parser.mjs');

describe('IndexEngine language extension support', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('indexes files for extensions declared by registered parsers', async () => {
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      '/project/src/main.toy': 'symbol Alpha\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', { enablePersistence: false }),
      fileSystem
    );

    await engine.indexProject('/project');

    expect(engine.getConfig().includeExtensions).toContain('.toy');
    const results = await engine.findSymbol('Alpha');
    expect(results).toHaveLength(1);
    expect(results[0].fileInfo.language).toBe('toy');
    expect(results[0].symbol.location.filePath).toBe('/project/src/main.toy');
  });

  it('indexes files for parser modules declared in config', async () => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();

    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      '/project/src/main.toy': 'symbol ModuleAlpha\n'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', {
        enablePersistence: false,
        parserModulePaths: [TOY_PARSER_MODULE]
      }),
      fileSystem
    );

    await engine.indexProject('/project');

    expect(engine.getConfig().includeExtensions).toContain('.toy');
    const results = await engine.findSymbol('ModuleAlpha');
    expect(results).toHaveLength(1);
    expect(results[0].fileInfo.language).toBe('toy');
    expect(results[0].symbol.location.filePath).toBe('/project/src/main.toy');
  });

  it('keeps shared direct parser modules alive until every IndexEngine releases them', async () => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();

    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      '/project/src/main.toy': 'symbol SharedAlpha\n'
    });

    const config = createIndexConfig('/project', {
      enablePersistence: false,
      parserModulePaths: [DIRECT_TOY_PARSER_MODULE]
    });
    const firstEngine = new IndexEngine(config, fileSystem);
    const secondEngine = new IndexEngine(config, fileSystem);

    try {
      await firstEngine.initializeConfiguredParserModules();
      await secondEngine.initializeConfiguredParserModules();
      await secondEngine.disposeAsync();

      await firstEngine.indexProject('/project');
      const results = await firstEngine.findSymbol('SharedAlpha');
      expect(results).toHaveLength(1);
    } finally {
      await firstEngine.disposeAsync();
    }
  });

  it('keeps shared factory parser modules alive until every IndexEngine releases them', async () => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();

    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      '/project/src/main.toy': 'symbol SharedFactoryAlpha\n'
    });

    const config = createIndexConfig('/project', {
      enablePersistence: false,
      parserModulePaths: [TOY_PARSER_MODULE]
    });
    const firstEngine = new IndexEngine(config, fileSystem);
    const secondEngine = new IndexEngine(config, fileSystem);

    try {
      await firstEngine.initializeConfiguredParserModules();
      await secondEngine.initializeConfiguredParserModules();
      await firstEngine.disposeAsync();

      await secondEngine.indexProject('/project');
      const results = await secondEngine.findSymbol('SharedFactoryAlpha');
      expect(results).toHaveLength(1);
    } finally {
      await secondEngine.disposeAsync();
    }
  });
});
