/**
 * Parser 初始化工具
 * 負責註冊預設的 Parser 插件到 ParserRegistry
 * 這個模組作為 core 和 plugins 之間的橋樑，避免 core 直接依賴 plugins
 */

import type { ParserRegistry } from './registry.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';

/**
 * 初始化預設的 Parser 插件
 * 將 TypeScript 和 JavaScript Parser 註冊到 ParserRegistry
 * 如果 Parser 已經註冊，則跳過
 *
 * @param registry - Parser 註冊中心
 */
export function initializeDefaultParsers(registry: ParserRegistry): void {
  // 註冊 TypeScript Parser（支援 .ts, .tsx）
  if (!registry.getParser('.ts')) {
    const tsParser = new TypeScriptParser();
    registry.register(tsParser);
  }

  // 註冊 JavaScript Parser（支援 .js, .jsx）
  if (!registry.getParser('.js')) {
    const jsParser = new JavaScriptParser();
    registry.register(jsParser);
  }
}
