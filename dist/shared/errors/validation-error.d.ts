/**
 * 驗證相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 驗證錯誤類別
 */
export declare class ValidationError extends BaseError {
    readonly field: string;
    readonly value?: any;
    constructor(message: string, field: string, code?: string, value?: any, cause?: Error);
    /**
     * 覆寫 toString 以包含驗證資訊
     */
    toString(): string;
}
/**
 * ValidationError 型別守衛
 */
export declare function isValidationError(value: unknown): value is ValidationError;
//# sourceMappingURL=validation-error.d.ts.map