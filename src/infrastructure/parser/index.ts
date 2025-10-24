/**
 * Parser 基礎設施統一匯出
 */

// 匯出所有接口和型別
export { ParserPlugin, isParserPlugin, supportsExtension, supportsLanguage, getFileExtension, findPluginForFile } from './interface.js';
export type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities, DefinitionKind, UsageKind, ValidationError as ParserValidationError, ValidationWarning } from './types.js';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities } from './types.js';

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
} from './analysis-types.js';

// 匯出基礎實作
export { BaseParserPlugin } from './base.js';

// 匯出註冊中心和工廠
export { ParserRegistry } from './registry.js';
export type { ParserInfo, ParserRegistrationOptions } from './registry.js';
export { ParserFactory } from './factory.js';
export type { LazyLoaderFunction } from './factory.js';