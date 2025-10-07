/**
 * TypeScript Parser 插件統一匯出
 */
export { TypeScriptParser } from './parser.js';
export { TypeScriptSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';
export { TypeScriptDependencyAnalyzer, createDependencyAnalyzer } from './dependency-analyzer.js';
export { DEFAULT_COMPILER_OPTIONS, SYNTAX_KIND_MAP, SYMBOL_TYPE_MAP, MODIFIER_MAP, tsPositionToPosition, tsNodeToRange, positionToTsPosition, getNodeModifiers, getNodeName, isSymbolDeclaration, isDependencyNode, getDependencyPath, isRelativePath, getImportedSymbols, createTypeScriptASTNode, isValidIdentifier, TypeScriptParseError, createParseError } from './types.js';
//# sourceMappingURL=index.js.map