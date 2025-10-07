/**
 * 檔案操作相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 檔案操作錯誤類別
 */
export class FileError extends BaseError {
    filePath;
    operation;
    constructor(message, filePath, code = 'FILE_ERROR', operation, cause) {
        super(code, message, { filePath, operation }, cause);
        this.filePath = filePath;
        this.operation = operation || undefined;
    }
    /**
     * 覆寫 toString 以包含檔案資訊
     */
    toString() {
        let result = super.toString();
        result += `\n檔案: ${this.filePath}`;
        if (this.operation) {
            result += `\n操作: ${this.operation}`;
        }
        return result;
    }
}
/**
 * FileError 型別守衛
 */
export function isFileError(value) {
    return value instanceof FileError;
}
//# sourceMappingURL=file-error.js.map