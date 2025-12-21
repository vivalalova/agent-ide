/**
 * JavaScript Parser 插件統一匯出
 */

// ===== 主要類別 =====
export { JavaScriptParser } from './parser.js';
export { JavaScriptSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';
export { JavaScriptDependencyExtractor, createDependencyExtractor } from './dependency-extractor.js';

// ===== 型別定義 =====
export type {
  JavaScriptAST,
  JavaScriptASTNode,
  JavaScriptSymbol,
  JavaScriptParseOptions,
  BabelPlugin
} from './types.js';

// ===== 常數和工具 =====
export {
  DEFAULT_PARSE_OPTIONS,
  JavaScriptParseError,
  createJavaScriptASTNode,
  createParseError,
  babelLocationToPosition,
  getNodeName,
  isSymbolDeclaration,
  isDependencyNode,
  getDependencyPath,
  getImportedSymbols,
  getPluginsForFile,
  getScopeType,
  BABEL_NODE_TYPE_MAP,
  BABEL_SYMBOL_TYPE_MAP
} from './types.js';

// ===== 共用工具 =====
export {
  isRelativePath,
  isValidIdentifier,
  isReservedWord,
  JS_RESERVED_WORDS
} from '../shared/index.js';

// ===== 工廠函式 =====
import { JavaScriptParser } from './parser.js';
import type { JavaScriptParseOptions } from './types.js';

export function createJavaScriptParser(options?: Partial<JavaScriptParseOptions>): JavaScriptParser {
  return new JavaScriptParser(options);
}

// ===== 預設匯出 =====
export default JavaScriptParser;
