/**
 * 基礎錯誤類別
 * 提供統一的錯誤處理機制
 */

/**
 * 基礎錯誤類別
 */
export class BaseError extends Error {
  public readonly code: string;
  public readonly details: Record<string, any> | undefined;
  public readonly timestamp: Date;
  public cause: Error | undefined;

  constructor(
    code: string,
    message: string,
    details?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details || undefined;
    this.timestamp = new Date();
    this.cause = cause || undefined;

    // 確保 stack trace 正確指向錯誤發生位置
    if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * 將錯誤序列化為 JSON
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: this.timestamp.toISOString(),
      ...(this.cause && { cause: this.cause.message })
    };
  }

  /**
   * 將錯誤轉換為可讀的字串
   */
  toString(): string {
    let result = `${this.name} [${this.code}]: ${this.message}`;
    
    if (this.details) {
      result += `\n詳細資料: ${JSON.stringify(this.details, null, 2)}`;
    }
    
    if (this.cause) {
      result += `\n原因: ${this.cause.message}`;
    }
    
    return result;
  }
}

/**
 * BaseError 型別守衛
 */
export function isBaseError(value: unknown): value is BaseError {
  return value instanceof BaseError;
}