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
      const existingPersistentModule = options.isolateModuleInstances
        ? undefined
        : persistentParserModules.get(moduleKey);
      if (existingPersistentModule) {
        existingPersistentModule.refCount++;
        registeredParsers.push({
          name: existingPersistentModule.registeredName,
          disposeOnUnregister: false,
          persistentModuleKey: moduleKey
        });
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
        const registeredParser: RegisteredParserModule = {
          name: registeredParserName,
          disposeOnUnregister: parserModuleInstance.disposeOnUnregister
        };

        if (parserModuleInstance.persistentModuleKey) {
          persistentParserModules.set(parserModuleInstance.persistentModuleKey, {
            parser: parserModuleInstance.parser,
            registeredName: registeredParserName,
            reloadAfterDispose: parserModuleInstance.reloadAfterDispose,
            refCount: 1
          });
          registeredParsers.push({
            ...registeredParser,
            persistentModuleKey: parserModuleInstance.persistentModuleKey
          });
        } else {
          registeredParsers.push(registeredParser);
        }
      } else if (parserModuleInstance.persistentModuleKey) {
        disposeUnregisteredParser(parserModuleInstance.parser);
        if (parserModuleInstance.reloadAfterDispose) {
          bumpPersistentParserModuleGeneration(parserModuleInstance.persistentModuleKey);
        }
      }
    }
  } catch (error) {
    await disposeRegisteredParserModules(registry, registeredParsers);
    throw error;
  }

  return registeredParsers;
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
