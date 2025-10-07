/**
 * 配置相關錯誤
 */
import { BaseError } from './base-error.js';
/**
 * 配置錯誤類別
 */
export class ConfigError extends BaseError {
    configPath;
    expectedType;
    constructor(message, configPath, code = 'CONFIG_ERROR', expectedType, cause) {
        super(code, message, { configPath, expectedType }, cause);
        this.configPath = configPath;
        this.expectedType = expectedType || undefined;
    }
    /**
     * 覆寫 toString 以包含配置資訊
     */
    toString() {
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
export function isConfigError(value) {
    return value instanceof ConfigError;
}
//# sourceMappingURL=config-error.js.map