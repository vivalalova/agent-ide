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
    registerParserOrDispose(registry, parser, disposeIfUnregistered);
    return parser.name;
  }

  if (unclaimedExtensions.length > 0) {
    registerParserOrDispose(
      registry,
      createParserForExtensions(parser, unclaimedExtensions),
      disposeIfUnregistered
        ? parser
        : null
    );
    return parser.name;
  }

  if (disposeIfUnregistered) {
    disposeUnregisteredParser(parser);
  }
  return null;
}

function registerParserOrDispose(
  registry: ParserRegistry,
  parserToRegister: ParserPlugin,
  parserToDisposeOnFailure: ParserPlugin | boolean | null
): void {
  try {
    registry.register(parserToRegister);
  } catch (error) {
    if (parserToDisposeOnFailure) {
      disposeUnregisteredParser(
        parserToDisposeOnFailure === true ? parserToRegister : parserToDisposeOnFailure
      );
    }
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

      const parserModule = await import(toImportSpecifier(modulePath, options.isolateModuleInstances ?? false));
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
  const moduleRecord = parserModule as Record<string, unknown>;
  const parserCandidate =
    moduleRecord.default ??
    moduleRecord.parser ??
    moduleRecord.createParser ??
    moduleRecord.createParserPlugin;
  const createdFromFactory = typeof parserCandidate === 'function';
  const parser = createdFromFactory ? parserCandidate() : parserCandidate;

  if (!isParserPlugin(parser)) {
    throw new Error(`Parser module does not export a valid ParserPlugin: ${modulePath}`);
  }

  return {
    parser,
    disposeOnUnregister: createdFromFactory || (options.isolateModuleInstances ?? false),
    reloadAfterDispose: !createdFromFactory,
    ...(!options.isolateModuleInstances
      ? { persistentModuleKey: toBaseImportSpecifier(modulePath) }
      : {})
  };
}

let isolatedModuleCounter = 0;

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
