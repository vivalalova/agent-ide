/**
 * Swift Parser 插件匯出
 * 提供 Swift Parser 的統一匯出介面
 */

// 主要類別和介面
export { SwiftParser } from './parser.js';

// 型別定義
export type {
  SwiftAST,
  SwiftASTNode,
  SwiftSymbol,
  SwiftParseError as SwiftParseErrorType,
  SwiftCompilerOptions
} from './types.js';

export {
  SwiftNodeType,
  SwiftSymbolType,
  SwiftVisibility,
  SwiftParseError,
  DEFAULT_SWIFT_COMPILER_OPTIONS,
  createSwiftASTNode,
  createSwiftSymbol,
  createSwiftParseError,
  mapSwiftSymbolTypeToSymbolType,
  isDeclarationNode,
  isTypeDeclarationNode,
  isValidSwiftIdentifier,
  isSwiftKeyword,
  createSwiftRange,
  positionToRange
} from './types.js';

// 工廠函式
import { SwiftParser } from './parser.js';

export function createSwiftParser(): SwiftParser {
  return new SwiftParser();
}

// 預設匯出
export default SwiftParser;