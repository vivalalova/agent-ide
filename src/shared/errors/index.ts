/**
 * 錯誤處理系統統一匯出
 */

import { Location } from '../types/core';

// 匯出所有錯誤類別
export { BaseError, isBaseError } from './base-error';
export {
  ParserError,
  DuplicateParserError,
  ParserNotFoundError,
  IncompatibleVersionError,
  ParserInitializationError,
  ParserFactoryError,
  isParserError,
  isDuplicateParserError,
  isParserNotFoundError,
  isIncompatibleVersionError,
  isParserInitializationError,
  isParserFactoryError
} from './parser-error';
export { FileError, isFileError } from './file-error';
export { ValidationError, isValidationError } from './validation-error';
export { ConfigError, isConfigError } from './config-error';

// 重新匯出類別以方便使用
import { BaseError } from './base-error';
import { ParserError } from './parser-error';
import { FileError } from './file-error';
import { ValidationError } from './validation-error';
import { ConfigError } from './config-error';

/**
 * 錯誤工廠函式選項
 */
interface ErrorOptions {
  location?: Location;
  filePath?: string;
  operation?: string;
  field?: string;
  value?: any;
  configPath?: string;
  expectedType?: string;
  syntaxElement?: string;
  code?: string;
  cause?: Error;
}

/**
 * 錯誤工廠函式
 * 根據類型建立對應的錯誤實例
 */
export function createError(
  type: 'parser' | 'file' | 'validation' | 'config',
  message: string,
  options: ErrorOptions = {}
): BaseError {
  const { code, cause } = options;

  switch (type) {
  case 'parser': {
    if (!options.location) {
      throw new Error('ParserError 需要 location 參數');
    }
    return new ParserError(
      message,
      options.location,
      code || 'PARSER_ERROR',
      options.syntaxElement,
      cause
    );
  }

  case 'file': {
    if (!options.filePath) {
      throw new Error('FileError 需要 filePath 參數');
    }
    return new FileError(
      message,
      options.filePath,
      code || 'FILE_ERROR',
      options.operation,
      cause
    );
  }

  case 'validation': {
    if (!options.field) {
      throw new Error('ValidationError 需要 field 參數');
    }
    return new ValidationError(
      message,
      options.field,
      code || 'VALIDATION_ERROR',
      options.value,
      cause
    );
  }

  case 'config': {
    if (!options.configPath) {
      throw new Error('ConfigError 需要 configPath 參數');
    }
    return new ConfigError(
      message,
      options.configPath,
      code || 'CONFIG_ERROR',
      options.expectedType,
      cause
    );
  }

  default:
    throw new Error('未知的錯誤類型');
  }
}

/**
 * 格式化錯誤訊息
 * 提供統一的錯誤格式化輸出
 */
export function formatError(error: BaseError): string {
  let formatted = `[${error.timestamp.toISOString()}] ${error.name} (${error.code}): ${error.message}`;

  if (error instanceof ParserError) {
    formatted += `\n  位置: ${error.location.filePath}:${error.location.range.start.line}:${error.location.range.start.column}`;
    if (error.syntaxElement) {
      formatted += `\n  語法元素: ${error.syntaxElement}`;
    }
  }

  if (error instanceof FileError) {
    formatted += `\n  檔案: ${error.filePath}`;
    if (error.operation) {
      formatted += `\n  操作: ${error.operation}`;
    }
  }

  if (error instanceof ValidationError) {
    formatted += `\n  欄位: ${error.field}`;
    if (error.value !== undefined) {
      formatted += `\n  值: ${JSON.stringify(error.value)}`;
    }
  }

  if (error instanceof ConfigError) {
    formatted += `\n  配置路徑: ${error.configPath}`;
    if (error.expectedType) {
      formatted += `\n  預期類型: ${error.expectedType}`;
    }
  }

  if (error.cause) {
    formatted += `\n  原因: ${error.cause.message}`;
  }

  if (error.details && Object.keys(error.details).length > 0) {
    formatted += `\n  詳細資料: ${JSON.stringify(error.details, null, 4)}`;
  }

  return formatted;
}

/**
 * 常用錯誤代碼常量
 */
export const ErrorCodes = {
  // Parser 錯誤
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  UNEXPECTED_TOKEN: 'UNEXPECTED_TOKEN',
  INVALID_SYNTAX: 'INVALID_SYNTAX',
  DUPLICATE_PARSER_ERROR: 'DUPLICATE_PARSER_ERROR',
  PARSER_NOT_FOUND_ERROR: 'PARSER_NOT_FOUND_ERROR',
  INCOMPATIBLE_VERSION_ERROR: 'INCOMPATIBLE_VERSION_ERROR',
  PARSER_INITIALIZATION_ERROR: 'PARSER_INITIALIZATION_ERROR',
  PARSER_FACTORY_ERROR: 'PARSER_FACTORY_ERROR',

  // 檔案錯誤
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',

  // 驗證錯誤
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  OUT_OF_RANGE: 'OUT_OF_RANGE',

  // 配置錯誤
  INVALID_CONFIG: 'INVALID_CONFIG',
  MISSING_CONFIG: 'MISSING_CONFIG',
  CONFIG_TYPE_MISMATCH: 'CONFIG_TYPE_MISMATCH'
} as const;