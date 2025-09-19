/**
 * Parser 基礎設施統一匯出
 */

// 匯出所有接口和型別
export { ParserPlugin, isParserPlugin, supportsExtension, supportsLanguage, getFileExtension, findPluginForFile } from './interface';
export type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities, DefinitionKind, UsageKind, ValidationError as ParserValidationError, ValidationWarning } from './types';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities } from './types';

// 匯出基礎實作
export { BaseParserPlugin } from './base';

// 匯出註冊中心和工廠
export { ParserRegistry } from './registry';
export type { ParserInfo, ParserRegistrationOptions } from './registry';
export { ParserFactory } from './factory';
export type { LazyLoaderFunction } from './factory';