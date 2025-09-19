/**
 * 配置相關錯誤
 */

import { BaseError } from './base-error';

/**
 * 配置錯誤類別
 */
export class ConfigError extends BaseError {
  public readonly configPath: string;
  public readonly expectedType: string | undefined;

  constructor(
    message: string,
    configPath: string,
    code: string = 'CONFIG_ERROR',
    expectedType?: string,
    cause?: Error
  ) {
    super(code, message, { configPath, expectedType }, cause);
    this.configPath = configPath;
    this.expectedType = expectedType || undefined;
  }

  /**
   * 覆寫 toString 以包含配置資訊
   */
  toString(): string {
    let result = super.toString();
    result += `\n配置路徑: ${this.configPath}`;
    
    if (this.expectedType) {
      result += `\n預期類型: ${this.expectedType}`;
    }
    
    return result;
  }
}

/**
 * ConfigError 型別守衛
 */
export function isConfigError(value: unknown): value is ConfigError {
  return value instanceof ConfigError;
}