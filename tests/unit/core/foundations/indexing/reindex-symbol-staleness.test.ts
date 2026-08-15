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

describe('IndexEngine 重複 indexProject 的符號一致性', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => createToyParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  async function createIndexedEngine(): Promise<{ engine: IndexEngine; fileSystem: MemFileSystem }> {
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
    return { engine, fileSystem };
  }

  it('內容變更後重新 indexProject，不得再查到已不存在的舊符號', async () => {
    const { engine, fileSystem } = await createIndexedEngine();
    expect(await engine.findSymbol('Alpha')).toHaveLength(1);

    await fileSystem.writeFile('/project/src/main.toy', 'symbol Beta\n');
    await engine.indexProject('/project');

    expect(await engine.findSymbol('Beta')).toHaveLength(1);
    expect(await engine.findSymbol('Alpha')).toHaveLength(0);
  });

  it('內容未變重新 indexProject，同一符號不得重複累積', async () => {
    const { engine } = await createIndexedEngine();

    await engine.indexProject('/project');

    expect(await engine.findSymbol('Alpha')).toHaveLength(1);
  });
});
