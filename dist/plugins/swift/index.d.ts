/**
 * Swift Parser 插件匯出
 * 提供 Swift Parser 的統一匯出介面
 */
export { SwiftParser } from './parser.js';
export type { SwiftAST, SwiftASTNode, SwiftSymbol, SwiftParseError as SwiftParseErrorType, SwiftCompilerOptions } from './types.js';
export { SwiftNodeType, SwiftSymbolType, SwiftVisibility, SwiftParseError, DEFAULT_SWIFT_COMPILER_OPTIONS, createSwiftASTNode, createSwiftSymbol, createSwiftParseError, mapSwiftSymbolTypeToSymbolType, isDeclarationNode, isTypeDeclarationNode, isValidSwiftIdentifier, isSwiftKeyword, createSwiftRange, positionToRange } from './types.js';
import { SwiftParser } from './parser.js';
export declare function createSwiftParser(): SwiftParser;
export default SwiftParser;
//# sourceMappingURL=index.d.ts.map