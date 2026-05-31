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

const builtInParserFactories: readonly ParserFactory[] = [
  () => new TypeScriptParser(),
  () => new JavaScriptParser()
];

const extraParserFactories: ParserFactory[] = [];

function registerParserIfMissing(registry: ParserRegistry, parser: ParserPlugin): void {
  const alreadyRegistered = parser.supportedExtensions.some(extension => registry.getParser(extension));
  if (!alreadyRegistered) {
    registry.register(parser);
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
}

/**
 * 從外部模組載入 Parser。
 * 支援 default export、createParser()、createParserPlugin() 或直接 export ParserPlugin。
 */
export async function initializeParserModules(
  registry: ParserRegistry,
  modulePaths: readonly string[] = []
): Promise<void> {
  for (const modulePath of modulePaths) {
    const parserModule = await import(toImportSpecifier(modulePath));
    const parser = createParserFromModule(parserModule, modulePath);
    registerParserIfMissing(registry, parser);
  }
}

function createParserFromModule(parserModule: unknown, modulePath: string): ParserPlugin {
  const moduleRecord = parserModule as Record<string, unknown>;
  const parserCandidate =
    moduleRecord.default ??
    moduleRecord.parser ??
    moduleRecord.createParser ??
    moduleRecord.createParserPlugin;
  const parser = typeof parserCandidate === 'function' ? parserCandidate() : parserCandidate;

  if (!isParserPlugin(parser)) {
    throw new Error(`Parser module does not export a valid ParserPlugin: ${modulePath}`);
  }

  return parser;
}

function toImportSpecifier(modulePath: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(modulePath)) {
    return modulePath;
  }

  return pathToFileURL(modulePath).href;
}
