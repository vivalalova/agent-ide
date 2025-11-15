/**
 * Parser 基礎設施統一匯出
 */

// 匯出所有接口和型別
export { ParserPlugin, isParserPlugin, supportsExtension, supportsLanguage, getFileExtension, findPluginForFile } from '@infrastructure/parser/interface.js';
export type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities, DefinitionKind, UsageKind, ValidationError as ParserValidationError, ValidationWarning } from '@infrastructure/parser/types.js';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities } from '@infrastructure/parser/types.js';

// 匯出分析型別
export type {
  UnusedCode,
  ComplexityMetrics,
  CodeFragment,
  DuplicationResult,
  DuplicationGroup,
  PatternMatch,
  TypeSafetyIssue,
  ErrorHandlingIssue,
  SecurityIssue,
  NamingIssue,
  TestCoverageResult
} from '@infrastructure/parser/analysis-types.js';

// 匯出基礎實作
export { BaseParserPlugin } from '@infrastructure/parser/base.js';

// 匯出註冊中心和工廠
export { ParserRegistry } from '@infrastructure/parser/registry.js';
export type { ParserInfo, ParserRegistrationOptions } from '@infrastructure/parser/registry.js';
export { ParserFactory } from '@infrastructure/parser/factory.js';
export type { LazyLoaderFunction } from '@infrastructure/parser/factory.js';