/**
 * JavaScript Parser 插件導出模組
 * 提供 JavaScript 解析能力的統一入口
 */
// 工具函式
export { DEFAULT_PARSE_OPTIONS, JavaScriptParseError, createJavaScriptASTNode, createParseError, babelLocationToPosition, getNodeName, isValidIdentifier, isSymbolDeclaration, isDependencyNode, getDependencyPath, isRelativePath, getImportedSymbols, getPluginsForFile, getScopeType, isReservedWord, BABEL_NODE_TYPE_MAP, BABEL_SYMBOL_TYPE_MAP } from './types.js';
// 主要 Parser 類別
import { JavaScriptParser } from './parser.js';
export { JavaScriptParser };
// 建立 Parser 實例的工廠函式
export function createJavaScriptParser(options) {
    return new JavaScriptParser(options);
}
// 預設導出
export default JavaScriptParser;
//# sourceMappingURL=index.js.map