/**
 * 基礎錯誤類別
 * 提供統一的錯誤處理機制
 */
/**
 * 基礎錯誤類別
 */
export declare class BaseError extends Error {
    readonly code: string;
    readonly details: Record<string, any> | undefined;
    readonly timestamp: Date;
    cause: Error | undefined;
    constructor(code: string, message: string, details?: Record<string, any>, cause?: Error);
    /**
     * 將錯誤序列化為 JSON
     */
    toJSON(): Record<string, any>;
    /**
     * 將錯誤轉換為可讀的字串
     */
    toString(): string;
}
/**
 * BaseError 型別守衛
 */
export declare function isBaseError(value: unknown): value is BaseError;
//# sourceMappingURL=base-error.d.ts.map