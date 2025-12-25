/**
 * Parse Worker
 * 在 Worker 執行緒中執行 AST 解析和符號提取
 *
 * 注意：此檔案在獨立的 Worker 執行緒中執行，
 * 每個 Worker 會初始化自己的 ParserRegistry 實例。
 */

import * as path from 'path';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import { TypeScriptParser } from '@plugins/typescript/parser.js';
import { JavaScriptParser } from '@plugins/javascript/parser.js';
import type { ParseTask, ParseResult } from '../types.js';

// Worker 初始化（每個 Worker 執行一次）
const registry = ParserRegistry.getInstance();

// 確保 Parser 已註冊
if (!registry.getParser('.ts')) {
  registry.register(new TypeScriptParser());
}

if (!registry.getParser('.js')) {
  registry.register(new JavaScriptParser());
}

/**
 * 解析單一檔案
 * 這是 Tinypool 呼叫的 default export 函式
 *
 * @param task 解析任務（包含 filePath 和 content）
 * @returns 解析結果
 */
export default async function parseFile(task: ParseTask): Promise<ParseResult> {
  const { filePath, content } = task;
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

  try {
    const ast = await parser.parse(content, filePath);
    const symbols = await parser.extractSymbols(ast);
    const dependencies = await parser.extractDependencies(ast);

    return {
      filePath,
      symbols,
      dependencies,
      errors: []
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      filePath,
      symbols: [],
      dependencies: [],
      errors: [errorMessage]
    };
  }
}
