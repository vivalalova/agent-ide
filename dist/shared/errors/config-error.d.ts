/**
 * 配置相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 配置錯誤類別
 */
export declare class ConfigError extends BaseError {
    readonly configPath: string;
    readonly expectedType: string | undefined;
    constructor(message: string, configPath: string, code?: string, expectedType?: string, cause?: Error);
    /**
     * 覆寫 toString 以包含配置資訊
     */
    toString(): string;
}
/**
 * ConfigError 型別守衛
 */
export declare function isConfigError(value: unknown): value is ConfigError;
//# sourceMappingURL=config-error.d.ts.map