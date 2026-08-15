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

  it('isolate 模式重複載入直接 export 的 ParserPlugin 模組不應每次都重新 import（worker 記憶體洩漏迴歸）', async () => {
    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);
    const moduleUrl = createTrackedDirectParserModuleUrl();
    const globalKey = '__agentIdeIsolateDirectLoadCount__';
    (globalThis as Record<string, unknown>)[globalKey] = 0;

    try {
      // 模擬 worker 對同一個 parserModulePaths 連續處理多個 task：
      // 每個 task 各自 initialize → parse → dispose，如同 parse-worker.ts 的 try/finally。
      for (let taskIndex = 0; taskIndex < 5; taskIndex++) {
        const registered = await initializeParserModules(registry, [moduleUrl], {
          isolateModuleInstances: true
        });
        await expect(
          registry.getParser('.toy')?.parse('', '/tmp/file.toy')
        ).resolves.toBeDefined();
        await disposeRegisteredParserModules(registry, registered);
      }

      // 根因斷言：module 只應被 Node ESM loader 實際 evaluate 一次，
      // 不隨 task 數線性增長（修復前每個 task 都用全新 query string 重新 import，
      // 這裡會是 5，代表 5 個永遠不會被回收的模組實例）。
      expect((globalThis as Record<string, unknown>)[globalKey]).toBe(1);
    } finally {
      delete (globalThis as Record<string, unknown>)[globalKey];
    }
  });

  it('disposes an orphaned direct parser instance when duplicate-name registration throws (persistent mode)', async () => {
    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);
    const disposeCountKey = '__agentIdeDuplicateNamePersistentDisposeCount__';
    (globalThis as Record<string, unknown>)[disposeCountKey] = 0;
    const moduleUrl = createDuplicateNameDirectParserModuleUrl(disposeCountKey);

    try {
      await expect(initializeParserModules(registry, [moduleUrl])).rejects.toThrow();

      // 註冊本來就沒成功（'typescript' 名稱已被內建 parser 佔用），不該留下 persistent
      // 記錄，且建構出的 parser 實例不該變成孤兒——必須被 dispose 掉。
      expect((globalThis as Record<string, unknown>)[disposeCountKey]).toBe(1);
      expect(registry.getParser('.toy')).toBeNull();
    } finally {
      delete (globalThis as Record<string, unknown>)[disposeCountKey];
    }
  });

  it('disposes an orphaned direct parser instance when duplicate-name registration throws (isolate mode)', async () => {
    const registry = ParserRegistry.getInstance();
    initializeDefaultParsers(registry);
    const disposeCountKey = '__agentIdeDuplicateNameIsolateDisposeCount__';
    (globalThis as Record<string, unknown>)[disposeCountKey] = 0;
    const moduleUrl = createDuplicateNameDirectParserModuleUrl(disposeCountKey);

    try {
      await expect(
        initializeParserModules(registry, [moduleUrl], { isolateModuleInstances: true })
      ).rejects.toThrow();

      // isolate 模式下 loadIsolatedParserModule 每次用不同 query string 重新 import，
      // 測試無法從外部重建該 specifier 拿回同一個模組實例，改用 globalThis 側channel
      // 觀察 dispose() 是否真的被呼叫，不受「重新 import 拿到全新模組副本」影響。
      expect((globalThis as Record<string, unknown>)[disposeCountKey]).toBe(1);
      expect(registry.getParser('.toy')).toBeNull();
    } finally {
      delete (globalThis as Record<string, unknown>)[disposeCountKey];
    }
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

/**
 * 直接 export 一個「名稱與內建 parser 衝突」的 ParserPlugin 單例（name: 'typescript'，
 * 佔用未被使用的 .toy 副檔名），用來重現 registerParserOrDispose 的孤兒實例迴歸：
 * 註冊時因重名撞上內建 parser 而 throw，實例必須被 dispose、不能既未進 registry
 * 也未被清理。dispose() 記錄到呼叫端傳入的 globalThis key，而非 module 內的
 * export 變數——isolate 模式下每次 import 都用不同 query string 取得全新模組副本，
 * 測試端無法重建該 specifier 拿回同一份 export，只有 globalThis 側channel 能跨
 * 「哪個模組副本」觀察 dispose 是否真的發生。
 */
function createDuplicateNameDirectParserModuleUrl(disposeCountKey: string): string {
  const moduleSource = `
    const globalKey = '${disposeCountKey}';

    function createRange(line, column, length) {
      return { start: { line, column }, end: { line, column: column + length } };
    }

    export default {
      name: 'typescript',
      version: '1.0.0',
      supportedExtensions: ['.toy'],
      supportedLanguages: ['toy'],
      async parse(code, filePath) {
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
        globalThis[globalKey] = (globalThis[globalKey] ?? 0) + 1;
      }
    };
  `;

  return `data:text/javascript,${encodeURIComponent(moduleSource)}`;
}

/**
 * 與 createDirectParserModuleUrl 同型的直接 export 模組，但額外在 module 頂層
 * 對 globalThis.__agentIdeIsolateDirectLoadCount__ 累加一次。isolate 模式下每次
 * import 都會用全新 query string 強制 Node 重新 evaluate 該模組的頂層程式碼，
 * 藉此偵測「同一個 moduleKey 被重複 import 幾次」而不必依賴真的把記憶體撐爆。
 */
function createTrackedDirectParserModuleUrl(): string {
  const moduleSource = `
    const globalKey = '__agentIdeIsolateDirectLoadCount__';
    globalThis[globalKey] = (globalThis[globalKey] ?? 0) + 1;

    function createRange(line, column, length) {
      return { start: { line, column }, end: { line, column: column + length } };
    }

    export default {
      name: 'tracked-direct-toy',
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
