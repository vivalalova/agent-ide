/**
 * Parser 基礎設施統一匯出
 */
// 匯出所有接口和型別
export { isParserPlugin, supportsExtension, supportsLanguage, getFileExtension, findPluginForFile } from './interface.js';
export { createCodeEdit, createDefinition, createUsage, createValidationResult, createValidationSuccess, createValidationFailure, isCodeEdit, isDefinition, isUsage, isValidationResult, isParserCapabilities } from './types.js';
// 匯出基礎實作
export { BaseParserPlugin } from './base.js';
// 匯出註冊中心和工廠
export { ParserRegistry } from './registry.js';
export { ParserFactory } from './factory.js';
//# sourceMappingURL=index.js.map