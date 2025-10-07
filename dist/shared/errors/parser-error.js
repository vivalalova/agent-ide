/**
 * Parser 相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * Parser 錯誤類別
 */
export class ParserError extends BaseError {
    location;
    syntaxElement;
    constructor(message, location, code = 'PARSER_ERROR', syntaxElement, cause) {
        super(code, message, { location, syntaxElement }, cause);
        this.location = location;
        this.syntaxElement = syntaxElement || undefined;
    }
    /**
     * 覆寫 toString 以包含位置資訊
     */
    toString() {
        let result = super.toString();
        result += `\n位置: ${this.location.filePath}:${this.location.range.start.line}:${this.location.range.start.column}`;
        if (this.syntaxElement) {
            result += `\n語法元素: ${this.syntaxElement}`;
        }
        return result;
    }
}
/**
 * Parser 註冊中心重複註冊錯誤
 */
export class DuplicateParserError extends ParserError {
    constructor(parserName, cause) {
        super(`Parser '${parserName}' 已經註冊`, { filePath: '', range: { start: { line: 0, column: 0, offset: undefined }, end: { line: 0, column: 0, offset: undefined } } }, 'DUPLICATE_PARSER_ERROR', undefined, cause);
    }
}
/**
 * Parser 註冊中心找不到 Parser 錯誤
 */
export class ParserNotFoundError extends ParserError {
    constructor(identifier, identifierType, cause) {
        super(`找不到 ${identifierType === 'name' ? 'Parser' : `支援${identifierType === 'extension' ? '副檔名' : '語言'}`} '${identifier}' 的 Parser`, { filePath: '', range: { start: { line: 0, column: 0, offset: undefined }, end: { line: 0, column: 0, offset: undefined } } }, 'PARSER_NOT_FOUND_ERROR', undefined, cause);
    }
}
/**
 * Parser 版本不相容錯誤
 */
export class IncompatibleVersionError extends ParserError {
    constructor(parserName, expectedVersion, actualVersion, cause) {
        super(`Parser '${parserName}' 版本不相容：期望 ${expectedVersion}，實際 ${actualVersion}`, { filePath: '', range: { start: { line: 0, column: 0, offset: undefined }, end: { line: 0, column: 0, offset: undefined } } }, 'INCOMPATIBLE_VERSION_ERROR', undefined, cause);
    }
}
/**
 * Parser 初始化錯誤
 */
export class ParserInitializationError extends ParserError {
    constructor(parserName, reason, cause) {
        super(`Parser '${parserName}' 初始化失敗：${reason}`, { filePath: '', range: { start: { line: 0, column: 0, offset: undefined }, end: { line: 0, column: 0, offset: undefined } } }, 'PARSER_INITIALIZATION_ERROR', undefined, cause);
    }
}
/**
 * Parser 工廠錯誤
 */
export class ParserFactoryError extends ParserError {
    constructor(message, cause) {
        super(message, { filePath: '', range: { start: { line: 0, column: 0, offset: undefined }, end: { line: 0, column: 0, offset: undefined } } }, 'PARSER_FACTORY_ERROR', undefined, cause);
    }
}
/**
 * ParserError 型別守衛
 */
export function isParserError(value) {
    return value instanceof ParserError;
}
/**
 * DuplicateParserError 型別守衛
 */
export function isDuplicateParserError(value) {
    return value instanceof DuplicateParserError;
}
/**
 * ParserNotFoundError 型別守衛
 */
export function isParserNotFoundError(value) {
    return value instanceof ParserNotFoundError;
}
/**
 * IncompatibleVersionError 型別守衛
 */
export function isIncompatibleVersionError(value) {
    return value instanceof IncompatibleVersionError;
}
/**
 * ParserInitializationError 型別守衛
 */
export function isParserInitializationError(value) {
    return value instanceof ParserInitializationError;
}
/**
 * ParserFactoryError 型別守衛
 */
export function isParserFactoryError(value) {
    return value instanceof ParserFactoryError;
}
//# sourceMappingURL=parser-error.js.map