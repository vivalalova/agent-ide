/**
 * Shared 模組統一匯出
 * 提供整個專案共用的型別、錯誤和常量
 */
// 匯出所有型別
export * from './types/index.js';
// 匯出錯誤處理
export * from './errors/index.js';
// 常用的重新匯出
export { 
// 核心型別創建函式
createPosition, createRange, createLocation, isPosition, isRange, isLocation, isPositionBefore, isPositionInRange } from './types/core.js';
export { 
// Symbol 創建函式
createScope, createSymbol, createReference, createDependency, isScope, isSymbol, isReference, isDependency, getScopeDepth, isSameScope, getScopePath } from './types/symbol.js';
export { 
// AST 創建函式
createASTNode, createASTMetadata, createAST, isASTNode, isASTMetadata, isAST, findNodeByPosition, findNodesByType, getNodePath, getNodeDepth, isNodeAncestorOf } from './types/ast.js';
export { 
// 錯誤處理
BaseError, ParserError, DuplicateParserError, ParserNotFoundError, IncompatibleVersionError, ParserInitializationError, ParserFactoryError, FileError, ValidationError, ConfigError, isBaseError, isParserError, isDuplicateParserError, isParserNotFoundError, isIncompatibleVersionError, isParserInitializationError, isParserFactoryError, isFileError, isValidationError, isConfigError, createError, formatError, ErrorCodes } from './errors/index.js';
//# sourceMappingURL=index.js.map