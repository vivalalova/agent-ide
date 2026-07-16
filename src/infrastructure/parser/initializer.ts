/**
 * Parser 初始化工具
 * 負責註冊預設的 Parser 插件到 ParserRegistry
 * 這個模組作為 core 和 plugins 之間的橋樑，避免 core 直接依賴 plugins
 */

import { pathToFileURL } from 'node:url';
import type { ParserPlugin } from './interface.js';
import { isParserPlugin } from './interface.js';
import type { ParserRegistry } from './registry.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';

export type ParserFactory = () => ParserPlugin;

export interface RegisteredParserModule {
  readonly name: string;
  readonly disposeOnUnregister: boolean;
  readonly persistentModuleKey?: string;
}

export interface InitializeParserModulesOptions {
  readonly isolateModuleInstances?: boolean;
}

const builtInParserFactories: readonly ParserFactory[] = [
  () => new TypeScriptParser(),
  () => new JavaScriptParser()
];

const extraParserFactories: ParserFactory[] = [];
interface PersistentParserModuleRecord {
  readonly parser: ParserPlugin;
  readonly registeredName: string;
  readonly reloadAfterDispose: boolean;
  refCount: number;
}

const persistentParserModules = new Map<string, PersistentParserModuleRecord>();
const persistentParserModuleGenerations = new Map<string, number>();
/**
 * moduleKey → 進行中的 import+register in-flight promise（單飛去重）。
 * 兩個 engine 同時初始化同一 persistent module 時，後到者共享同一個 promise 的結果，
 * 而非各自 get-check-miss 後各跑一次 import+register（會導致其一被判定為「額外」而
 * 提早 dispose、refCount 少計，見 disposePersistentParserModules 的提前 unregister 問題）。
 */
const persistentParserModuleInitializations = new Map<string, Promise<PersistentParserModuleRecord | null>>();

function registerParserIfMissing(
  registry: ParserRegistry,
  parser: ParserPlugin,
  disposeIfUnregistered = true
): string | null {
  const unclaimedExtensions = parser.supportedExtensions.filter(extension => !registry.getParser(extension));
  if (unclaimedExtensions.length === parser.supportedExtensions.length) {
    registerParserOrDispose(registry, parser);
    return parser.name;
  }

  if (unclaimedExtensions.length > 0) {
    registerParserOrDispose(registry, createParserForExtensions(parser, unclaimedExtensions), parser);
    return parser.name;
  }

  if (disposeIfUnregistered) {
    disposeUnregisteredParser(parser);
  }
  return null;
}

/**
 * 註冊 parser，失敗（例如重名撞上既有 parser）一律 dispose 掉建構出的實例並重拋。
 *
 * 這裡的「失敗即 dispose」與 `disposeIfUnregistered`/`disposeOnUnregister` 的語意是
 * 兩件不同的事，不可混用同一個旗標：後者管的是「成功註冊過的 parser，之後被刻意
 * unregister/release 時要不要 dispose」（例如 persistent module 的單例需要跨 task
 * 存活，不能被中途 dispose）；而這裡的失敗代表 parser 從未成功進入 registry，
 * 沒有任何地方把它當「持久實例」在追蹤，不 dispose 就是孤兒——不論呼叫端傳入的
 * disposeIfUnregistered 是 true 或 false 都必須清理，否則就是本檔案曾經修過的
 * 資源洩漏缺陷同款重演。
 */
function registerParserOrDispose(
  registry: ParserRegistry,
  parserToRegister: ParserPlugin,
  underlyingParserForDisposal: ParserPlugin | null = null
): void {
  try {
    registry.register(parserToRegister);
  } catch (error) {
    disposeUnregisteredParser(underlyingParserForDisposal ?? parserToRegister);
    throw error;
  }
}

function createParserForExtensions(
  parser: ParserPlugin,
  supportedExtensions: readonly string[]
): ParserPlugin {
  return new Proxy(parser, {
    get(target, property, receiver) {
      if (property === 'supportedExtensions') {
        return supportedExtensions;
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

function disposeUnregisteredParser(parser: ParserPlugin): void {
  try {
    const disposeResult = parser.dispose();
    if (disposeResult instanceof Promise) {
      void disposeResult.catch(() => undefined);
    }
  } catch {
    // Best-effort cleanup for a parser instance that never entered the registry.
  }
}

/**
 * 初始化預設的 Parser 插件
 * 將 TypeScript 和 JavaScript Parser 註冊到 ParserRegistry
 * 如果 Parser 已經註冊，則跳過
 *
 * @param registry - Parser 註冊中心
 */
export function initializeDefaultParsers(registry: ParserRegistry): void {
  for (const createParser of getDefaultParserFactories()) {
    registerParserIfMissing(registry, createParser());
  }
}

/**
 * 註冊額外的預設 Parser 工廠。
 * 測試和外部啟動流程可用它讓 CLI/IndexEngine/worker 共用同一組 Parser。
 */
export function registerDefaultParserFactory(factory: ParserFactory): void {
  extraParserFactories.push(factory);
}

/**
 * 讀取預設 Parser 工廠。
 */
export function getDefaultParserFactories(): readonly ParserFactory[] {
  return [...builtInParserFactories, ...extraParserFactories];
}

/**
 * 測試專用：清除額外註冊的 Parser 工廠。
 */
export function resetDefaultParserFactoriesForTesting(): void {
  extraParserFactories.length = 0;
  persistentParserModules.clear();
  persistentParserModuleGenerations.clear();
  persistentParserModuleInitializations.clear();
  isolatedModuleCache.clear();
}

/**
 * 從外部模組載入 Parser。
 * 支援 default export、createParser()、createParserPlugin() 或直接 export ParserPlugin。
 */
export async function initializeParserModules(
  registry: ParserRegistry,
  modulePaths: readonly string[] = [],
  options: InitializeParserModulesOptions = {}
): Promise<readonly RegisteredParserModule[]> {
  const registeredParsers: RegisteredParserModule[] = [];

  try {
    for (const modulePath of modulePaths) {
      const moduleKey = toBaseImportSpecifier(modulePath);

      if (!options.isolateModuleInstances) {
        const acquired = await acquirePersistentParserModule(registry, modulePath, moduleKey, options);
        if (acquired) {
          registeredParsers.push({
            name: acquired.registeredName,
            disposeOnUnregister: false,
            persistentModuleKey: moduleKey
          });
        }
        continue;
      }

      const parserModule = await loadIsolatedParserModule(modulePath, moduleKey);
      const parserModuleInstance = createParserFromModule(parserModule, modulePath, options);
      const registeredParserName = registerParserIfMissing(
        registry,
        parserModuleInstance.parser,
        parserModuleInstance.disposeOnUnregister
      );
      if (registeredParserName) {
        registeredParsers.push({
          name: registeredParserName,
          disposeOnUnregister: parserModuleInstance.disposeOnUnregister
        });
      }
    }
  } catch (error) {
    await disposeRegisteredParserModules(registry, registeredParsers);
    throw error;
  }

  return registeredParsers;
}

/**
 * 取得（或建立）persistent parser module 記錄，對同一 moduleKey 的併發初始化單飛去重。
 * 已存在 → 直接 +1 refCount；進行中 → 等同一個 in-flight promise，完成後各自 +1 refCount；
 * 都沒有 → 成為 leader，實際跑 import+register 並寫入 map（refCount 從 1 起算）。
 */
async function acquirePersistentParserModule(
  registry: ParserRegistry,
  modulePath: string,
  moduleKey: string,
  options: InitializeParserModulesOptions
): Promise<{ registeredName: string } | null> {
  const existingRecord = persistentParserModules.get(moduleKey);
  if (existingRecord) {
    existingRecord.refCount++;
    return { registeredName: existingRecord.registeredName };
  }

  let initPromise = persistentParserModuleInitializations.get(moduleKey);
  const isLeader = !initPromise;
  if (isLeader) {
    initPromise = importAndRegisterPersistentModule(registry, modulePath, moduleKey, options);
    persistentParserModuleInitializations.set(moduleKey, initPromise);
    const cleanup = (): void => {
      persistentParserModuleInitializations.delete(moduleKey);
    };
    // 兩個 handler 都不重拋，避免產生第二條無人接手的 rejected promise chain
    void initPromise.then(cleanup, cleanup);
  }

  const record = await initPromise;
  if (!record) {
    return null;
  }
  if (!isLeader) {
    // leader 已把自己算進 refCount:1，這裡是額外的等待者，各自 +1
    record.refCount++;
  }
  return { registeredName: record.registeredName };
}

async function importAndRegisterPersistentModule(
  registry: ParserRegistry,
  modulePath: string,
  moduleKey: string,
  options: InitializeParserModulesOptions
): Promise<PersistentParserModuleRecord | null> {
  const parserModule = await import(toImportSpecifier(modulePath, options.isolateModuleInstances ?? false));
  const parserModuleInstance = createParserFromModule(parserModule, modulePath, options);
  const registeredParserName = registerParserIfMissing(
    registry,
    parserModuleInstance.parser,
    parserModuleInstance.disposeOnUnregister
  );

  if (!registeredParserName) {
    disposeUnregisteredParser(parserModuleInstance.parser);
    if (parserModuleInstance.reloadAfterDispose) {
      bumpPersistentParserModuleGeneration(moduleKey);
    }
    return null;
  }

  const record: PersistentParserModuleRecord = {
    parser: parserModuleInstance.parser,
    registeredName: registeredParserName,
    reloadAfterDispose: parserModuleInstance.reloadAfterDispose,
    refCount: 1
  };
  persistentParserModules.set(moduleKey, record);
  return record;
}

export async function disposePersistentParserModules(
  disposedByRegistry: ReadonlySet<ParserPlugin> = new Set()
): Promise<void> {
  for (const [moduleKey, record] of persistentParserModules) {
    persistentParserModules.delete(moduleKey);
    if (disposedByRegistry.has(record.parser)) {
      if (record.reloadAfterDispose) {
        bumpPersistentParserModuleGeneration(moduleKey);
      }
      continue;
    }

    try {
      await record.parser.dispose();
    } catch {
      // Best-effort cleanup for parser module singletons during worker teardown.
    }
    if (record.reloadAfterDispose) {
      bumpPersistentParserModuleGeneration(moduleKey);
    }
  }
}

export async function disposeRegisteredParserModules(
  registry: ParserRegistry,
  registeredParsers: readonly RegisteredParserModule[]
): Promise<void> {
  for (const registeredParser of [...registeredParsers].reverse()) {
    if (registeredParser.persistentModuleKey) {
      await releasePersistentParserModule(registry, registeredParser);
      continue;
    }

    const parser = registry.getParserByName(registeredParser.name);
    try {
      registry.unregister(registeredParser.name);
    } catch {
      // Continue cleanup for the remaining task-scoped parsers.
    }

    if (parser && registeredParser.disposeOnUnregister) {
      try {
        await parser.dispose();
      } catch {
        // Cleanup must not mask the original initialization failure.
      }
    }
  }
}

async function releasePersistentParserModule(
  registry: ParserRegistry,
  registeredParser: RegisteredParserModule
): Promise<void> {
  const moduleKey = registeredParser.persistentModuleKey;
  if (!moduleKey) {
    return;
  }

  const record = persistentParserModules.get(moduleKey);
  if (!record) {
    return;
  }

  record.refCount--;
  if (record.refCount > 0) {
    return;
  }

  persistentParserModules.delete(moduleKey);
  if (record.reloadAfterDispose) {
    bumpPersistentParserModuleGeneration(moduleKey);
  }

  try {
    registry.unregister(record.registeredName);
  } catch {
    // Continue cleanup even if another owner already unregistered it.
  }

  try {
    await record.parser.dispose();
  } catch {
    // Cleanup must not mask the caller's result.
  }
}

/**
 * 從模組物件解析出 parser candidate（factory 函式或直接的 ParserPlugin 實例）。
 * 欄位優先序是模組契約的唯一權威定義，`createParserFromModule` 與
 * isolate 模式的 factory 分類都引用這裡，禁各自重複一份判斷順序。
 */
function resolveParserCandidate(parserModule: unknown): unknown {
  const moduleRecord = parserModule as Record<string, unknown>;
  return (
    moduleRecord.default ??
    moduleRecord.parser ??
    moduleRecord.createParser ??
    moduleRecord.createParserPlugin
  );
}

function createParserFromModule(
  parserModule: unknown,
  modulePath: string,
  options: InitializeParserModulesOptions
): {
  parser: ParserPlugin;
  disposeOnUnregister: boolean;
  persistentModuleKey?: string;
  reloadAfterDispose: boolean;
} {
  const parserCandidate = resolveParserCandidate(parserModule);
  const createdFromFactory = typeof parserCandidate === 'function';
  const parser = createdFromFactory ? parserCandidate() : parserCandidate;

  if (!isParserPlugin(parser)) {
    throw new Error(`Parser module does not export a valid ParserPlugin: ${modulePath}`);
  }

  return {
    parser,
    // isolate 語意的本體是「每 task 全新 parser 實例」而非「每 task 全新模組副本」：
    // factory 模組每次呼叫 factory() 就已經是全新物件，dispose 它不影響下次 factory() 的結果，
    // 可放心每 task dispose。直接 export 單例的模組不然——dispose 會讓模組頂層那個唯一物件
    // 永久不可用，若每 task 都 dispose 它，下個 task 勢必得重新 import 才能拿到未 disposed 的
    // 實例，而 Node ESM loader 對每個不同 query string 的 import 永不 GC，就是 worker 記憶體隨
    // task 數線性增長的根因。因此非 factory 模組在 isolate 模式下不隨 task dispose，讓
    // loadIsolatedParserModule 快取的單一模組實例整個 worker 生命週期內重複使用；
    // registry 的 register/unregister 仍然逐 task 進行，不影響「不污染後續任務」的語意。
    disposeOnUnregister: createdFromFactory,
    reloadAfterDispose: !createdFromFactory,
    ...(!options.isolateModuleInstances
      ? { persistentModuleKey: toBaseImportSpecifier(modulePath) }
      : {})
  };
}

let isolatedModuleCounter = 0;

/**
 * moduleKey → 已快取的模組命名空間（in-flight promise，天然對併發 import 單飛去重）。
 * isolate 模式下每個 moduleKey 只用唯一 query string 實際 import 一次：
 * factory 模組靠呼叫端每 task 重新呼叫 factory() 取得新 parser 實例；
 * 直接 export 單例的模組則靠 createParserFromModule 不再逐 task dispose 它來維持可重用。
 * 兩種情況下模組實例數都有界於「相異模組路徑數」，不隨 task 數無界增長
 * （見 `direct-disposable-toy-parser.mjs` 契約與其 regression test）。
 */
const isolatedModuleCache = new Map<string, Promise<unknown>>();

async function loadIsolatedParserModule(modulePath: string, moduleKey: string): Promise<unknown> {
  const cachedModule = isolatedModuleCache.get(moduleKey);
  if (cachedModule) {
    return cachedModule;
  }

  const modulePromise = import(toImportSpecifier(modulePath, true));
  isolatedModuleCache.set(moduleKey, modulePromise);
  return modulePromise;
}

function toImportSpecifier(modulePath: string, isolateModuleInstance: boolean): string {
  const specifier = toBaseImportSpecifier(modulePath);
  const generation = persistentParserModuleGenerations.get(specifier) ?? 0;
  if (!isolateModuleInstance && generation === 0) { return specifier; }

  const [withoutHash, hash = ''] = specifier.split('#');
  const separator = withoutHash.includes('?') ? '&' : '?';
  const cacheKey = isolateModuleInstance
    ? `agentIdeParserInstance=${++isolatedModuleCounter}`
    : `agentIdeParserGeneration=${generation}`;
  if (specifier.startsWith('data:')) {
    return `${specifier}#${cacheKey}`;
  }

  return `${withoutHash}${separator}${cacheKey}${hash ? `#${hash}` : ''}`;
}

function bumpPersistentParserModuleGeneration(moduleKey: string): void {
  persistentParserModuleGenerations.set(
    moduleKey,
    (persistentParserModuleGenerations.get(moduleKey) ?? 0) + 1
  );
}

function toBaseImportSpecifier(modulePath: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(modulePath)) {
    return modulePath;
  }

  return pathToFileURL(modulePath).href;
}
