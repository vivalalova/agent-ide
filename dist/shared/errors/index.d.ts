/**
 * 錯誤處理系統統一匯出
 */
import { Location } from '../types/core.js';
export { BaseError, isBaseError } from './base-error.js';
export { ParserError, DuplicateParserError, ParserNotFoundError, IncompatibleVersionError, ParserInitializationError, ParserFactoryError, isParserError, isDuplicateParserError, isParserNotFoundError, isIncompatibleVersionError, isParserInitializationError, isParserFactoryError } from './parser-error.js';
export { FileError, isFileError } from './file-error.js';
export { ValidationError, isValidationError } from './validation-error.js';
export { ConfigError, isConfigError } from './config-error.js';
import { BaseError } from './base-error.js';
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
export declare function createError(type: 'parser' | 'file' | 'validation' | 'config', message: string, options?: ErrorOptions): BaseError;
/**
 * 格式化錯誤訊息
 * 提供統一的錯誤格式化輸出
 */
export declare function formatError(error: BaseError): string;
/**
 * 常用錯誤代碼常量
 */
export declare const ErrorCodes: {
    readonly SYNTAX_ERROR: "SYNTAX_ERROR";
    readonly UNEXPECTED_TOKEN: "UNEXPECTED_TOKEN";
    readonly INVALID_SYNTAX: "INVALID_SYNTAX";
    readonly DUPLICATE_PARSER_ERROR: "DUPLICATE_PARSER_ERROR";
    readonly PARSER_NOT_FOUND_ERROR: "PARSER_NOT_FOUND_ERROR";
    readonly INCOMPATIBLE_VERSION_ERROR: "INCOMPATIBLE_VERSION_ERROR";
    readonly PARSER_INITIALIZATION_ERROR: "PARSER_INITIALIZATION_ERROR";
    readonly PARSER_FACTORY_ERROR: "PARSER_FACTORY_ERROR";
    readonly FILE_NOT_FOUND: "FILE_NOT_FOUND";
    readonly FILE_READ_ERROR: "FILE_READ_ERROR";
    readonly FILE_WRITE_ERROR: "FILE_WRITE_ERROR";
    readonly PERMISSION_DENIED: "PERMISSION_DENIED";
    readonly REQUIRED_FIELD: "REQUIRED_FIELD";
    readonly INVALID_FORMAT: "INVALID_FORMAT";
    readonly OUT_OF_RANGE: "OUT_OF_RANGE";
    readonly INVALID_CONFIG: "INVALID_CONFIG";
    readonly MISSING_CONFIG: "MISSING_CONFIG";
    readonly CONFIG_TYPE_MISMATCH: "CONFIG_TYPE_MISMATCH";
};
//# sourceMappingURL=index.d.ts.map