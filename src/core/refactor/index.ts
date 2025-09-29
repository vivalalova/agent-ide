/**
 * Refactor 模組統一匯出
 * 提供程式碼重構功能，包括函式提取、內聯和設計模式應用
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

// 函式內聯重構
export {
  FunctionInliner,
  InlineAnalyzer,
  type InlineResult,
  type InlineConfig,
  type FunctionDefinition,
  type FunctionCall
} from './inline-function.js';

// 設計模式重構
export {
  DesignPatternRefactorer,
  DesignPatternAnalyzer,
  type PatternRefactorResult,
  type PatternRefactorConfig,
  type PatternSuggestion,
  type DesignPattern,
  type ClassInfo,
  type MethodInfo,
  type PropertyInfo
} from './design-patterns.js';