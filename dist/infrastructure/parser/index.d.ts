/**
 * Parser 基礎設施統一匯出
 */
export { ParserPlugin, isParserPlugin, supportsExtension, supportsLanguage, getFileExtension, findPluginForFile } from './interface.js';
export type { CodeEdit, Definition, Usage, ValidationResult, ParserOptions, ParserCapabilities, DefinitionKind, UsageKind, ValidationError as ParserValidationError, ValidationWarning } from './types.js';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities } from './types.js';
export { BaseParserPlugin } from './base.js';
export { ParserRegistry } from './registry.js';
export type { ParserInfo, ParserRegistrationOptions } from './registry.js';
export { ParserFactory } from './factory.js';
export type { LazyLoaderFunction } from './factory.js';
//# sourceMappingURL=index.d.ts.map