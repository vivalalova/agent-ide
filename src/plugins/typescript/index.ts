/**
 * TypeScript Parser 插件統一匯出
 */

export { TypeScriptParser } from './parser';
export { TypeScriptSymbolExtractor, createSymbolExtractor } from './symbol-extractor';
export { TypeScriptDependencyAnalyzer, createDependencyAnalyzer } from './dependency-analyzer';

export type {
  TypeScriptAST,
  TypeScriptASTNode,
  TypeScriptSymbol,
  TypeScriptParseOptions,
  TypeScriptCompilerOptions
} from './types';

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
  isRelativePath,
  getImportedSymbols,
  createTypeScriptASTNode,
  isValidIdentifier,
  TypeScriptParseError,
  createParseError
} from './types';