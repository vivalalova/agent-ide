/**
 * JavaScript Parser 插件導出模組
 * 提供 JavaScript 解析能力的統一入口
 */
export type { JavaScriptAST, JavaScriptASTNode, JavaScriptSymbol, JavaScriptParseOptions, BabelPlugin } from './types.js';
export { DEFAULT_PARSE_OPTIONS, JavaScriptParseError, createJavaScriptASTNode, createParseError, babelLocationToPosition, getNodeName, isValidIdentifier, isSymbolDeclaration, isDependencyNode, getDependencyPath, isRelativePath, getImportedSymbols, getPluginsForFile, getScopeType, isReservedWord, BABEL_NODE_TYPE_MAP, BABEL_SYMBOL_TYPE_MAP } from './types.js';
import { JavaScriptParser } from './parser.js';
import type { JavaScriptParseOptions } from './types.js';
export { JavaScriptParser };
export declare function createJavaScriptParser(options?: Partial<JavaScriptParseOptions>): JavaScriptParser;
export default JavaScriptParser;
//# sourceMappingURL=index.d.ts.map