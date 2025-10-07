/**
 * Shared 模組統一匯出
 * 提供整個專案共用的型別、錯誤和常量
 */
export * from './types/index.js';
export * from './errors/index.js';
export { createPosition, createRange, createLocation, isPosition, isRange, isLocation, isPositionBefore, isPositionInRange } from './types/core.js';
export { createScope, createSymbol, createReference, createDependency, isScope, isSymbol, isReference, isDependency, getScopeDepth, isSameScope, getScopePath } from './types/symbol.js';
export { createASTNode, createASTMetadata, createAST, isASTNode, isASTMetadata, isAST, findNodeByPosition, findNodesByType, getNodePath, getNodeDepth, isNodeAncestorOf } from './types/ast.js';
export { BaseError, ParserError, DuplicateParserError, ParserNotFoundError, IncompatibleVersionError, ParserInitializationError, ParserFactoryError, FileError, ValidationError, ConfigError, isBaseError, isParserError, isDuplicateParserError, isParserNotFoundError, isIncompatibleVersionError, isParserInitializationError, isParserFactoryError, isFileError, isValidationError, isConfigError, createError, formatError, ErrorCodes } from './errors/index.js';
//# sourceMappingURL=index.d.ts.map