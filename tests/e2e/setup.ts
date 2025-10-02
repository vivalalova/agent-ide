/**
 * E2E 測試環境設定
 * 初始化測試環境和全域設定
 */

import { beforeAll, afterAll } from 'vitest';
import { ParserRegistry } from '../../src/infrastructure/parser/registry';
import { TypeScriptParser } from '../../src/plugins/typescript/parser';
import { JavaScriptParser } from '../../src/plugins/javascript/parser';

// 全域測試設定
beforeAll(async () => {
  // 初始化 Parser Registry
  const registry = ParserRegistry.getInstance();

  // 註冊 TypeScript Parser
  try {
    const tsParser = new TypeScriptParser();
    if (!registry.getParserByName('typescript')) {
      registry.register(tsParser);
    }
  } catch (error) {
    console.warn('TypeScript Parser 註冊失敗:', error);
  }

  // 註冊 JavaScript Parser
  try {
    const jsParser = new JavaScriptParser();
    if (!registry.getParserByName('javascript')) {
      registry.register(jsParser);
    }
  } catch (error) {
    console.warn('JavaScript Parser 註冊失敗:', error);
  }
});

// 全域清理
afterAll(async () => {
  // 清理資源
  const registry = ParserRegistry.getInstance();
  await registry.dispose();
});
