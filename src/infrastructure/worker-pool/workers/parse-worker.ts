/**
 * Parse Worker
 * 在 Worker 執行緒中執行 AST 解析和符號提取
 *
 * 注意：此檔案在獨立的 Worker 執行緒中執行，
 * 每個 Worker 會初始化自己的 ParserRegistry 實例。
 */

import * as path from 'path';
import {
  ParserRegistry,
  disposeRegisteredParserModules,
  initializeDefaultParsers,
  initializeParserModules,
  type RegisteredParserModule
} from '@infrastructure/parser/index.js';
import type { ParseTask, ParseResult } from '../types.js';
import { getErrorMessage } from '@shared/errors/index.js';

// Worker 初始化（每個 Worker 執行一次）
const registry = ParserRegistry.getInstance();
initializeDefaultParsers(registry);

/**
 * 解析單一檔案
 * 這是 Tinypool 呼叫的 default export 函式
 *
 * @param task 解析任務（包含 filePath 和 content）
 * @returns 解析結果
 */
export default async function parseFile(task: ParseTask): Promise<ParseResult> {
  const { filePath, content } = task;
  let registeredParsers: readonly RegisteredParserModule[] = [];
  try {
    registeredParsers = await initializeParserModules(registry, task.parserModulePaths ?? [], {
      isolateModuleInstances: true
    });
    const ext = path.extname(filePath);
    const parser = registry.getParser(ext);

    if (!parser) {
      return {
        filePath,
        symbols: [],
        dependencies: [],
        errors: [`No parser for extension: ${ext}`]
      };
    }

    const ast = await parser.parse(content, filePath);
    const symbols = await parser.extractSymbols(ast);
    const dependencies = await parser.extractDependencies(ast);

    // 移除 TypeScript 特有的不可序列化屬性（tsNode, tsSymbol 包含循環引用）
    const cleanedSymbols = symbols.map(symbol => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { tsNode: _tsNode, tsSymbol: _tsSymbol, ...rest } = symbol as any;
      return rest;
    });

    return {
      filePath,
      symbols: cleanedSymbols,
      dependencies,
      errors: []
    } as ParseResult;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    return {
      filePath,
      symbols: [],
      dependencies: [],
      errors: [errorMessage]
    };
  } finally {
    await disposeTaskParsers(registeredParsers);
  }
}

async function disposeTaskParsers(registeredParsers: readonly RegisteredParserModule[]): Promise<void> {
  await disposeRegisteredParserModules(registry, registeredParsers);
}
