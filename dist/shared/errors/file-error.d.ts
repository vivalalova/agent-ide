/**
 * 檔案操作相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 檔案操作錯誤類別
 */
export declare class FileError extends BaseError {
    readonly filePath: string;
    readonly operation: string | undefined;
    constructor(message: string, filePath: string, code?: string, operation?: string, cause?: Error);
    /**
     * 覆寫 toString 以包含檔案資訊
     */
    toString(): string;
}
/**
 * FileError 型別守衛
 */
export declare function isFileError(value: unknown): value is FileError;
//# sourceMappingURL=file-error.d.ts.map