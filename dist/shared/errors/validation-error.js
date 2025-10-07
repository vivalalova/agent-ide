/**
 * 驗證相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 驗證錯誤類別
 */
export class ValidationError extends BaseError {
    field;
    value;
    constructor(message, field, code = 'VALIDATION_ERROR', value, cause) {
        super(code, message, { field, value }, cause);
        this.field = field;
        this.value = value;
    }
    /**
     * 覆寫 toString 以包含驗證資訊
     */
    toString() {
        let result = super.toString();
        result += `\n欄位: ${this.field}`;
        if (this.value !== undefined) {
            result += `\n值: ${JSON.stringify(this.value)}`;
        }
        return result;
    }
}
/**
 * ValidationError 型別守衛
 */
export function isValidationError(value) {
    return value instanceof ValidationError;
}
//# sourceMappingURL=validation-error.js.map