/**
 * Swift Parser Plugin
 * 匯出所有 Swift Parser 相關功能
 */

// 主 Parser 類別
export { SwiftParser, createSwiftParser } from './parser.js';

// 型別定義
export type {
  SwiftAST,
  SwiftASTNode,
  SwiftSymbol,
  SwiftDiagnostic,
  SwiftCLIRequest,
  SwiftCLIResponse
} from './types.js';

export {
  SwiftNodeKind,
  SwiftAccessLevel,
  SwiftParseError,
  createSwiftASTNode,
  createParseError,
  isDeclarationNode,
  isTypeDeclarationNode,
  swiftKindToSymbolType,
  getNodeName,
  isValidIdentifier,
  extractModifiers,
  extractAttributes
} from './types.js';

// 符號提取器
export { SwiftSymbolExtractor, createSymbolExtractor } from './symbol-extractor.js';

// 依賴分析器
export { SwiftDependencyAnalyzer, createDependencyAnalyzer } from './dependency-analyzer.js';

/**
 * 註冊 Swift Parser 到 Parser Registry
 */
export function registerSwiftParser(): void {
  // TODO: 實作註冊邏輯
  // 當 Parser Registry 準備好時，這裡會註冊 SwiftParser
}
