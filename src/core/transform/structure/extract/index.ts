/**
 * Extract 子模組
 * 函式提取重構功能
 */

// 函式提取重構
export {
  FunctionExtractor,
  ExtractionAnalyzer,
  type ExtractionResult,
  type ExtractConfig,
  type VariableInfo,
  type Range,
  type CodeEdit
} from './extract-function.js';

// Swift 專用提取器
export { SwiftExtractor } from './swift-extractor.js';
