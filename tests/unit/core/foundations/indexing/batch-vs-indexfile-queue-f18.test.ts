/**
 * F18 — batch vs indexFile：generation 過期不得留下空索引／覆蓋較新結果
 *
 * worker batch 路徑不走 indexFileQueue，與並行 indexFile 交錯時：
 * 1. 舊 batch 寫入必須在 critical section 內 check gen，過期整段不碰索引
 * 2. remove + set 必須經 per-path 寫入互斥，禁 remove 後因過期 return 留下空索引
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IndexEngine,
  createIndexConfig,
  FileIndex,
  SymbolIndex,
  createFileInfo
} from '@core/foundations/indexing/index.js';
import { IndexBatchParser } from '@core/foundations/indexing/index-batch-parser.js';
import type { IndexBatchCoordination } from '@core/foundations/indexing/index-batch-parser.js';
import {
  ParserRegistry,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from '@infrastructure/parser/index.js';
import { MemFileSystem } from '@infrastructure/storage/mem-file-system.js';
import type {
  AST,
  CodeEdit,
  Definition,
  Dependency,
  Reference,
  Symbol,
  Usage,
  ValidationResult
} from '@shared/types/index.js';
import {
  SymbolType,
  createAST,
  createASTMetadata,
  createASTNode,
  createLocation,
  createPosition,
  createRange,
  createSymbol
} from '@shared/types/index.js';
import type { ParserCapabilities, ParserPlugin } from '@infrastructure/parser/index.js';
import type { ParseResult, ParseTask } from '@infrastructure/worker-pool/index.js';

function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** 內容對應符號名的假 parser */
class NamedContentParser implements ParserPlugin {
  readonly name = 'named-content';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.nc'] as const;
  readonly supportedLanguages = ['named-content'] as const;

  async parse(code: string, filePath: string): Promise<AST> {
    const root = createASTNode(
      'Program',
      createRange(createPosition(1, 1), createPosition(1, 1)),
      { code },
      []
    );
    return createAST(filePath, root, createASTMetadata('named-content', this.version));
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const code = String(ast.root.properties.code ?? '').trim();
    const range = createRange(createPosition(1, 1), createPosition(1, Math.max(1, code.length)));
    return [createSymbol(code, SymbolType.Variable, createLocation(ast.sourceFile, range))];
  }

  async findReferences(): Promise<Reference[]> {
    return [];
  }

  async extractDependencies(): Promise<Dependency[]> {
    return [];
  }

  async rename(): Promise<CodeEdit[]> {
    return [];
  }

  async findDefinition(): Promise<Definition | null> {
    return null;
  }

  async findUsages(): Promise<Usage[]> {
    return [];
  }

  async validate(): Promise<ValidationResult> {
    return { valid: true, errors: [], warnings: [] };
  }

  async dispose(): Promise<void> {}

  getCapabilities(): ParserCapabilities {
    return {
      supportsRename: false,
      supportsGoToDefinition: false,
      supportsFindUsages: false,
      supportsCodeActions: false,
      supportsChangeSignature: false,
      supportsCallHierarchy: false,
      supportsMoveMember: false
    };
  }
}

/**
 * 可控延遲的假 worker pool：第一次 parseFiles 可卡在 gate，模擬慢 batch。
 */
class GatedFakeParserPool {
  private gate: {
    reached: ReturnType<typeof createDeferred>;
    release: ReturnType<typeof createDeferred>;
  } | null = null;

  arm(): { reached: Promise<void>; release: () => void } {
    const reached = createDeferred();
    const release = createDeferred();
    this.gate = { reached, release };
    return { reached: reached.promise, release: release.resolve };
  }

  async parseFiles(tasks: ParseTask[]): Promise<ParseResult[]> {
    if (this.gate) {
      this.gate.reached.resolve();
      await this.gate.release.promise;
    }
    return tasks.map(task => {
      const code = task.content.trim();
      const range = createRange(createPosition(1, 1), createPosition(1, Math.max(1, code.length)));
      return {
        filePath: task.filePath,
        symbols: [createSymbol(code, SymbolType.Variable, createLocation(task.filePath, range))],
        dependencies: [],
        errors: []
      };
    });
  }
}

describe('F18：batch vs indexFile 佇列 / generation', () => {
  beforeEach(() => {
    ParserRegistry.resetInstance();
    resetDefaultParserFactoriesForTesting();
    registerDefaultParserFactory(() => new NamedContentParser());
  });

  afterEach(() => {
    resetDefaultParserFactoriesForTesting();
    ParserRegistry.resetInstance();
  });

  it('過期 batch 寫入不得在 remove 後留下空索引（critical section 過期整段不碰）', async () => {
    const filePath = '/project/src/a.nc';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'StaleBatch'
    });

    const config = createIndexConfig('/project', { enablePersistence: false });
    const fileIndex = new FileIndex(config);
    const symbolIndex = new SymbolIndex();
    const registry = ParserRegistry.getInstance();

    // 先寫入一筆「較新」結果（模擬 generation=N+1 已完成）
    const freshInfo = createFileInfo(filePath, new Date(), 10, '.nc', 'named-content', 'fresh');
    const freshRange = createRange(createPosition(1, 1), createPosition(1, 5));
    const freshSymbol = createSymbol(
      'FreshIndexFile',
      SymbolType.Variable,
      createLocation(filePath, freshRange)
    );
    await fileIndex.addFile(freshInfo);
    await symbolIndex.addSymbols([freshSymbol], freshInfo);

    let generation = 2; // 已有較新 gen
    const pathWriteQueue = new Map<string, Promise<unknown>>();
    const coordination: IndexBatchCoordination = {
      resolvePath: (p) => p,
      beginGeneration: () => {
        generation += 1;
        return generation;
      },
      isCurrentGeneration: (_p, gen) => gen === generation,
      runExclusiveWrite: async <T>(p: string, fn: () => Promise<T>): Promise<T> => {
        const previous = pathWriteQueue.get(p) ?? Promise.resolve();
        const run = previous.then(fn, fn);
        pathWriteQueue.set(p, run.then(() => undefined, () => undefined));
        return run;
      }
    };

    const fakePool = new GatedFakeParserPool();
    // 不 arm gate：parse 立刻完成，但 generation 在 prepare 時會再 +1 成 3，
    // 接著我們把 generation 推到 4 模擬較新 indexFile，使 batch 結果過期。

    const batchParser = new IndexBatchParser(
      fileSystem,
      registry,
      // IndexBatchParser 只呼叫 parseFiles，假 pool 即可
      fakePool as unknown as ConstructorParameters<typeof IndexBatchParser>[2],
      fileIndex,
      symbolIndex,
      async () => {
        /* single-thread 路徑不用 */
      },
      coordination
    );

    // 手動：begin gen=3（batch），再推進到 4（較新 indexFile），再餵過期 batch 結果
    const staleGen = coordination.beginGeneration(filePath); // 3
    coordination.beginGeneration(filePath); // 4 = 目前最新
    expect(staleGen).toBe(3);
    expect(coordination.isCurrentGeneration(filePath, staleGen)).toBe(false);

    const staleRange = createRange(createPosition(1, 1), createPosition(1, 10));
    const staleResult: ParseResult = {
      filePath,
      symbols: [
        createSymbol('StaleBatch', SymbolType.Variable, createLocation(filePath, staleRange))
      ],
      dependencies: [],
      errors: []
    };
    const staleInfo = createFileInfo(filePath, new Date(), 10, '.nc', 'named-content', 'stale');

    // 直接呼叫私有寫入路徑：經 prototype 取得（unit 驗證 critical section 契約）
    const update = (
      batchParser as unknown as {
        updateIndexFromParseResult: (
          result: ParseResult,
          fileInfo: typeof staleInfo,
          content: string,
          generation: number
        ) => Promise<void>;
      }
    ).updateIndexFromParseResult.bind(batchParser);

    await update(staleResult, staleInfo, 'StaleBatch', staleGen);

    // 過期寫入不得動索引：FreshIndexFile 仍在，StaleBatch 不得覆寫
    const fresh = await symbolIndex.findSymbol('FreshIndexFile');
    const stale = await symbolIndex.findSymbol('StaleBatch');
    expect(fresh.length).toBe(1);
    expect(stale.length).toBe(0);
  });

  it('慢 batch 完成時 generation 已前進 → 丟棄，findSymbol 只反映較新 indexFile', async () => {
    const filePath = '/project/src/race.nc';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'BatchOld'
    });

    const config = createIndexConfig('/project', {
      enablePersistence: false,
      includeExtensions: ['.nc']
    });
    const fileIndex = new FileIndex(config);
    const symbolIndex = new SymbolIndex();
    const registry = ParserRegistry.getInstance();

    let generation = 0;
    const gens = new Map<string, number>();
    const pathWriteQueue = new Map<string, Promise<unknown>>();

    const coordination: IndexBatchCoordination = {
      resolvePath: (p) => p,
      beginGeneration: (p) => {
        const next = (gens.get(p) ?? 0) + 1;
        gens.set(p, next);
        generation = next;
        return next;
      },
      isCurrentGeneration: (p, gen) => gens.get(p) === gen,
      runExclusiveWrite: async <T>(p: string, fn: () => Promise<T>): Promise<T> => {
        const previous = pathWriteQueue.get(p) ?? Promise.resolve();
        const run = previous.then(fn, fn);
        pathWriteQueue.set(p, run.then(() => undefined, () => undefined));
        return run;
      }
    };

    const fakePool = new GatedFakeParserPool();
    const gate = fakePool.arm();

    const batchParser = new IndexBatchParser(
      fileSystem,
      registry,
      fakePool as unknown as ConstructorParameters<typeof IndexBatchParser>[2],
      fileIndex,
      symbolIndex,
      async () => {},
      coordination
    );

    // 啟動慢 batch（prepare 時 begin gen=1，parse 卡住）
    const batchDone = batchParser.batchIndexFiles(
      [filePath],
      config,
      {
        batchSize: 10,
        progressCallback: () => {}
      }
    );

    await gate.reached;

    // 模擬較新 indexFile：推進 gen、直接寫入新符號
    const freshGen = coordination.beginGeneration(filePath); // 2
    expect(freshGen).toBe(2);

    const freshInfo = createFileInfo(filePath, new Date(), 10, '.nc', 'named-content', 'new');
    const freshRange = createRange(createPosition(1, 1), createPosition(1, 11));
    const freshSymbol = createSymbol(
      'IndexFileNew',
      SymbolType.Variable,
      createLocation(filePath, freshRange)
    );

    await coordination.runExclusiveWrite(filePath, async () => {
      if (!coordination.isCurrentGeneration(filePath, freshGen)) {
        return;
      }
      await fileIndex.addFile(freshInfo);
      await symbolIndex.removeFileSymbols(filePath);
      await fileIndex.setFileSymbols(filePath, [freshSymbol]);
      await symbolIndex.addSymbols([freshSymbol], freshInfo);
    });

    // 釋放慢 batch：過期結果應丟棄
    gate.release();
    await batchDone;

    const newHits = await symbolIndex.findSymbol('IndexFileNew');
    const oldHits = await symbolIndex.findSymbol('BatchOld');
    expect(newHits).toHaveLength(1);
    expect(oldHits).toHaveLength(0);
  });

  it('IndexEngine indexFile 過期寫入不留下空索引（與 generation 協調）', async () => {
    const filePath = '/project/src/b.nc';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'First'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', {
        enablePersistence: false,
        includeExtensions: ['.nc']
      }),
      fileSystem
    );

    await engine.indexFile(filePath);
    const first = await engine.findSymbol('First');
    expect(first).toHaveLength(1);

    // 改檔再 index：最終應為 Second
    await fileSystem.writeFile(filePath, 'Second');
    await engine.indexFile(filePath);
    expect(await engine.findSymbol('Second')).toHaveLength(1);
    expect(await engine.findSymbol('First')).toHaveLength(0);

    await engine.disposeAsync();
  });

  it('indexFile 失敗 catch 清 stale 時 gen 已過期 → 不得抹掉較新索引', async () => {
    const filePath = '/project/src/catch-gen.nc';
    const fileSystem = new MemFileSystem();
    await fileSystem.fromJSON({
      '/project/package.json': '{}',
      [filePath]: 'Initial'
    });

    const engine = new IndexEngine(
      createIndexConfig('/project', {
        enablePersistence: false,
        includeExtensions: ['.nc']
      }),
      fileSystem
    );

    await engine.indexFile(filePath);
    expect(await engine.findSymbol('Initial')).toHaveLength(1);

    // 卡住 readFile 再失敗：模擬舊 gen 已 begin、尚未寫入時讀檔失敗
    const readReached = createDeferred();
    const releaseFail = createDeferred();
    const originalRead = fileSystem.readFile.bind(fileSystem);
    let failOnce = true;
    vi.spyOn(fileSystem, 'readFile').mockImplementation(async (p, encoding) => {
      if (String(p).includes('catch-gen.nc') && failOnce) {
        failOnce = false;
        readReached.resolve();
        await releaseFail.promise;
        const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      return originalRead(p, encoding);
    });

    const failPromise = engine.indexFile(filePath);
    await readReached.promise;

    // 並行較新 gen 已寫入 FreshNew（batch 不走 indexFileQueue，可與卡住的 indexFile 交錯）
    type EnginePriv = {
      beginIndexGeneration: (p: string) => number;
      runPathWriteExclusive: <T>(p: string, fn: () => Promise<T>) => Promise<T>;
      isCurrentIndexGeneration: (p: string, gen: number) => boolean;
      fileIndex: FileIndex;
      symbolIndex: SymbolIndex;
    };
    const priv = engine as unknown as EnginePriv;
    const freshGen = priv.beginIndexGeneration(filePath);
    const freshInfo = createFileInfo(filePath, new Date(), 8, '.nc', 'named-content', 'fresh');
    const freshRange = createRange(createPosition(1, 1), createPosition(1, 8));
    const freshSymbol = createSymbol(
      'FreshNew',
      SymbolType.Variable,
      createLocation(filePath, freshRange)
    );
    await priv.runPathWriteExclusive(filePath, async () => {
      if (!priv.isCurrentIndexGeneration(filePath, freshGen)) return;
      await priv.fileIndex.addFile(freshInfo);
      await priv.symbolIndex.removeFileSymbols(filePath);
      await priv.fileIndex.setFileSymbols(filePath, [freshSymbol]);
      await priv.symbolIndex.addSymbols([freshSymbol], freshInfo);
    });

    releaseFail.resolve();
    await expect(failPromise).rejects.toThrow(/索引檔案失敗/);

    // 殘洞：catch 不查 gen 會把 FreshNew 抹掉；修後較新索引必須保留
    expect(await engine.findSymbol('FreshNew')).toHaveLength(1);
    expect(await engine.findSymbol('Initial')).toHaveLength(0);
    expect(engine.isIndexed(filePath)).toBe(true);

    await engine.disposeAsync();
  });
});
