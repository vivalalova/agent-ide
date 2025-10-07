/**
 * Search 模組型別定義
 * 定義搜尋相關的所有介面和型別
 */
// ===== 搜尋類型 =====
/**
 * 搜尋類型枚舉
 */
// 搜尋類型枚舉
export const SearchType = {
    TEXT: 'text',
    SYMBOL: 'symbol',
    PATTERN: 'pattern',
    SEMANTIC: 'semantic',
    REGEX: 'regex' // 新增 REGEX 類型
};
// ===== 錯誤處理 =====
/**
 * 搜尋錯誤
 */
export class SearchError extends Error {
    code;
    query;
    cause;
    constructor(message, code, query, cause) {
        super(message);
        this.code = code;
        this.query = query;
        this.cause = cause;
        this.name = 'SearchError';
    }
}
/**
 * 搜尋錯誤代碼
 */
export var SearchErrorCode;
(function (SearchErrorCode) {
    SearchErrorCode["QUERY_PARSE_ERROR"] = "QUERY_PARSE_ERROR";
    SearchErrorCode["SEARCH_TIMEOUT"] = "SEARCH_TIMEOUT";
    SearchErrorCode["INDEX_NOT_AVAILABLE"] = "INDEX_NOT_AVAILABLE";
    SearchErrorCode["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
    SearchErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    SearchErrorCode["PATTERN_INVALID"] = "PATTERN_INVALID";
    SearchErrorCode["REGEX_INVALID"] = "REGEX_INVALID";
    SearchErrorCode["MEMORY_EXCEEDED"] = "MEMORY_EXCEEDED";
})(SearchErrorCode || (SearchErrorCode = {}));
//# sourceMappingURL=types.js.map