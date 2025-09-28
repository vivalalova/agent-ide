/**
 * 驗證相關錯誤
 */

import { BaseError } from './base-error';

/**
 * 驗證錯誤類別
 */
export class ValidationError extends BaseError {
  public readonly field: string;
  public readonly value?: any;

  constructor(
    message: string,
    field: string,
    code: string = 'VALIDATION_ERROR',
    value?: any,
    cause?: Error
  ) {
    super(code, message, { field, value }, cause);
    this.field = field;
    this.value = value;
  }

  /**
   * 覆寫 toString 以包含驗證資訊
   */
  toString(): string {
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
export function isValidationError(value: unknown): value is ValidationError {
  return value instanceof ValidationError;
}