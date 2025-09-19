/**
 * 檔案操作相關錯誤
 */

import { BaseError } from './base-error';

/**
 * 檔案操作錯誤類別
 */
export class FileError extends BaseError {
  public readonly filePath: string;
  public readonly operation: string | undefined;

  constructor(
    message: string,
    filePath: string,
    code: string = 'FILE_ERROR',
    operation?: string,
    cause?: Error
  ) {
    super(code, message, { filePath, operation }, cause);
    this.filePath = filePath;
    this.operation = operation || undefined;
  }

  /**
   * 覆寫 toString 以包含檔案資訊
   */
  toString(): string {
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
export function isFileError(value: unknown): value is FileError {
  return value instanceof FileError;
}