/**
 * Parser 基礎設施統一匯出
 */

// 匯出所有接口和型別
export {
  DEFAULT_PARSER_CAPABILITIES,
  findPluginForFile,
  getFileExtension,
  getParserCapabilities,
  isParserPlugin,
  parserSupportsCapability,
  supportsExtension,
  supportsLanguage
} from './interface.js';
export type { ParserPlugin, ImportDeclaration, ImportNamedSpecifier, FormattedSignature, FormattedParameter, Documentation, DocumentationTag, PatternInfo, PatternType, ScopedFindReferencesOptions, ScopedReference } from './interface.js';
export { ScopedReferenceKind } from './interface.js';
export type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities, DefinitionKind, UsageKind, ValidationError as ParserValidationError, ValidationWarning, TypeScriptASTExtension, BabelASTExtension } from './types.js';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities, hasTypeScriptSourceFile, getTypeScriptSourceFile, hasBabelAST } from './types.js';

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

// 匯出註冊中心
export { ParserRegistry } from './registry.js';
export type { ParserInfo, ParserRegistrationOptions } from './registry.js';

// 匯出 source extension contract
export { getRegisteredSourceFileExtensions } from './source-extensions.js';

// 匯出初始化函式
export {
  getDefaultParserFactories,
  initializeDefaultParsers,
  initializeParserModules,
  registerDefaultParserFactory,
  resetDefaultParserFactoriesForTesting
} from './initializer.js';
export type { ParserFactory } from './initializer.js';
