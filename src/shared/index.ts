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
  createPosition,
  createRange,
  createLocation,
  isPosition,
  isRange,
  isLocation,
  isPositionBefore,
  isPositionInRange
} from './types/core.js';

export {
  // Symbol 創建函式
  createScope,
  createSymbol,
  createReference,
  createDependency,
  isScope,
  isSymbol,
  isReference,
  isDependency,
  getScopeDepth,
  isSameScope,
  getScopePath
} from './types/symbol.js';

export {
  // AST 創建函式
  createASTNode,
  createASTMetadata,
  createAST,
  isASTNode,
  isASTMetadata,
  isAST,
  findNodeByPosition,
  findNodesByType,
  getNodePath,
  getNodeDepth,
  isNodeAncestorOf
} from './types/ast.js';

export {
  // 內容雜湊
  computeContentHash
} from './content-hash.js';

export {
  // 正則表達式跳脫
  escapeRegex
} from './regex-utils.js';

export {
  // 通用排除目錄（廣清單：唯讀/索引/效能掃描用）
  COMMON_EXCLUDE_DIR_NAMES,
  // 變更類命令引用掃描排除目錄（窄清單：正確性優先）
  MUTATION_SCAN_EXCLUDE_DIR_NAMES
} from './exclude-dirs.js';

export {
  // offset ↔ position 換算
  offsetToPosition
} from './position-utils.js';

export {
  // 路徑樣式比對
  matchesGlobPattern,
  matchesAnyGlobPattern,
  matchesPathSegment,
  matchesPathFragment,
  relativizeToRoot
} from './path-pattern.js';

export {
  // tsconfig path-alias 解析
  createPathAliasMap,
  createStructuredPathAliasMap,
  findPathAliasMatch,
  getPathAliasEntries,
  mergePathAliasMaps,
  resolveBarePathAlias,
  resolveBarePathAliasAsync,
  withLegacyPathAliasWildcards
} from './path-alias-resolver.js';

export type {
  PathAliasEntry,
  PathAliasInput,
  PathAliasMap,
  PathAliasMatch,
  PathAliasExists
} from './path-alias-resolver.js';

export {
  // 錯誤處理
  BaseError,
  ParserError,
  DuplicateParserError,
  ParserNotFoundError,
  IncompatibleVersionError,
  ParserInitializationError,
  ParserFactoryError,
  FileError,
  ValidationError,
  ConfigError,
  isBaseError,
  isParserError,
  isDuplicateParserError,
  isParserNotFoundError,
  isIncompatibleVersionError,
  isParserInitializationError,
  isParserFactoryError,
  isFileError,
  isValidationError,
  isConfigError,
  createError,
  formatError,
  ErrorCodes
} from './errors/index.js';
