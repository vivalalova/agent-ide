/**
 * Parser 相關錯誤
 */
import { BaseError } from './base-error.js';
import { Location } from '../types/core.js';
/**
 * Parser 錯誤類別
 */
export declare class ParserError extends BaseError {
    readonly location: Location;
    readonly syntaxElement: string | undefined;
    constructor(message: string, location: Location, code?: string, syntaxElement?: string, cause?: Error);
    /**
     * 覆寫 toString 以包含位置資訊
     */
    toString(): string;
}
/**
 * Parser 註冊中心重複註冊錯誤
 */
export declare class DuplicateParserError extends ParserError {
    constructor(parserName: string, cause?: Error);
}
/**
 * Parser 註冊中心找不到 Parser 錯誤
 */
export declare class ParserNotFoundError extends ParserError {
    constructor(identifier: string, identifierType: 'name' | 'extension' | 'language', cause?: Error);
}
/**
 * Parser 版本不相容錯誤
 */
export declare class IncompatibleVersionError extends ParserError {
    constructor(parserName: string, expectedVersion: string, actualVersion: string, cause?: Error);
}
/**
 * Parser 初始化錯誤
 */
export declare class ParserInitializationError extends ParserError {
    constructor(parserName: string, reason: string, cause?: Error);
}
/**
 * Parser 工廠錯誤
 */
export declare class ParserFactoryError extends ParserError {
    constructor(message: string, cause?: Error);
}
/**
 * ParserError 型別守衛
 */
export declare function isParserError(value: unknown): value is ParserError;
/**
 * DuplicateParserError 型別守衛
 */
export declare function isDuplicateParserError(value: unknown): value is DuplicateParserError;
/**
 * ParserNotFoundError 型別守衛
 */
export declare function isParserNotFoundError(value: unknown): value is ParserNotFoundError;
/**
 * IncompatibleVersionError 型別守衛
 */
export declare function isIncompatibleVersionError(value: unknown): value is IncompatibleVersionError;
/**
 * ParserInitializationError 型別守衛
 */
export declare function isParserInitializationError(value: unknown): value is ParserInitializationError;
/**
 * ParserFactoryError 型別守衛
 */
export declare function isParserFactoryError(value: unknown): value is ParserFactoryError;
//# sourceMappingURL=parser-error.d.ts.map