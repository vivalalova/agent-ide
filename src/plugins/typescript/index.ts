/**
 * TypeScript Parser 插件統一匯出
 */

import { TypeScriptParser } from './parser.js';

export { TypeScriptParser } from './parser.js';
export { TypeScriptSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';
export { TypeScriptDependencyExtractor, createDependencyExtractor } from './dependency-extractor.js';

/**
 * 創建 TypeScript Parser 實例的工廠函式
 */
export function createTypeScriptParser(): TypeScriptParser {
  return new TypeScriptParser();
}

export default TypeScriptParser;

export type {
  TypeScriptAST,
  TypeScriptASTNode,
  TypeScriptSymbol,
  TypeScriptParseOptions,
  TypeScriptCompilerOptions
} from './types.js';

export {
  DEFAULT_COMPILER_OPTIONS,
  SYNTAX_KIND_MAP,
  SYMBOL_TYPE_MAP,
  MODIFIER_MAP,
  tsPositionToPosition,
  tsNodeToRange,
  positionToTsPosition,
  getNodeModifiers,
  getNodeName,
  isSymbolDeclaration,
  isDependencyNode,
  getDependencyPath,
  getImportedSymbols,
  createTypeScriptASTNode,
  TypeScriptParseError,
  createParseError
} from './types.js';

// 共用工具從 shared 匯出
export {
  isRelativePath,
  isValidTypeScriptIdentifier as isValidIdentifier,
  isTypeScriptReservedWord
} from '../shared/index.js';