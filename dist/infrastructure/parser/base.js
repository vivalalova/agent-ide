/**
 * BaseParserPlugin 抽象類別
 * 提供 Parser 插件的基礎實作和通用功能
 */
import { isPosition } from '../../shared/types/index.js';
import { createValidationSuccess as createSuccessResult } from './types.js';
/**
 * BaseParserPlugin 抽象類別
 * 提供常用功能的預設實作，減少插件開發工作量
 */
export class BaseParserPlugin {
    // ===== 私有屬性 =====
    _initialized = false;
    _disposed = false;
    _options = {};
    // ===== 預設實作的方法 =====
    /**
     * 從 AST 中提取符號（預設實作返回空陣列）
     */
    async extractSymbols(_ast) {
        this.log('debug', `Extracting symbols from ${_ast.sourceFile}`);
        return [];
    }
    /**
     * 查找符號引用（預設實作返回空陣列）
     */
    async findReferences(_ast, symbol) {
        this.log('debug', `Finding references for symbol: ${symbol.name}`);
        return [];
    }
    /**
     * 提取依賴關係（預設實作返回空陣列）
     */
    async extractDependencies(_ast) {
        this.log('debug', `Extracting dependencies from ${_ast.sourceFile}`);
        return [];
    }
    /**
     * 重新命名（預設實作返回空陣列）
     */
    async rename(_ast, position, newName) {
        this.log('debug', `Renaming at position ${position.line}:${position.column} to ${newName}`);
        return [];
    }
    /**
     * 提取函式（預設實作返回空陣列）
     */
    async extractFunction(_ast, _selection) {
        this.log('debug', 'Extracting function from selection');
        return [];
    }
    /**
     * 查找定義（預設實作返回 null）
     */
    async findDefinition(_ast, position) {
        this.log('debug', `Finding definition at position ${position.line}:${position.column}`);
        return null;
    }
    /**
     * 查找使用位置（預設實作返回空陣列）
     */
    async findUsages(_ast, symbol) {
        this.log('debug', `Finding usages for symbol: ${symbol.name}`);
        return [];
    }
    /**
     * 驗證插件狀態（預設實作返回成功）
     */
    async validate() {
        this.log('debug', 'Validating plugin state');
        if (this._disposed) {
            return {
                valid: false,
                errors: [{
                        code: 'PLUGIN_DISPOSED',
                        message: '插件已被清理',
                        location: {
                            filePath: '',
                            range: {
                                start: { line: 1, column: 1, offset: undefined },
                                end: { line: 1, column: 1, offset: undefined }
                            }
                        }
                    }],
                warnings: []
            };
        }
        return createSuccessResult();
    }
    /**
     * 清理資源（預設實作）
     */
    async dispose() {
        this.log('info', `Disposing plugin: ${this.name}`);
        this._disposed = true;
        this._initialized = false;
        this._options = {};
    }
    // ===== 生命週期管理 =====
    /**
     * 初始化插件
     */
    async initialize(options) {
        if (this._initialized) {
            this.log('debug', 'Plugin already initialized');
            return;
        }
        this.log('info', `Initializing plugin: ${this.name}`);
        if (options) {
            this._options = { ...this._options, ...options };
        }
        this._initialized = true;
        this._disposed = false;
    }
    /**
     * 檢查是否已初始化
     */
    isInitialized() {
        return this._initialized;
    }
    /**
     * 檢查是否已清理
     */
    isDisposed() {
        return this._disposed;
    }
    // ===== 配置管理 =====
    /**
     * 獲取預設配置選項
     */
    getDefaultOptions() {
        return {
            strictMode: false,
            allowExperimentalFeatures: false,
            targetVersion: 'latest',
            ...this._options
        };
    }
    /**
     * 更新配置選項
     */
    updateOptions(options) {
        this.log('debug', 'Updating parser options');
        this._options = { ...this._options, ...options };
    }
    /**
     * 獲取插件能力聲明
     */
    getCapabilities() {
        return {
            supportsRename: false,
            supportsExtractFunction: false,
            supportsGoToDefinition: false,
            supportsFindUsages: false,
            supportsCodeActions: false
        };
    }
    // ===== 錯誤處理和日誌 =====
    /**
     * 處理錯誤
     */
    handleError(error, context) {
        const message = context ? `${context}: ${error.message}` : error.message;
        this.log('error', message);
        // 可以在這裡添加錯誤報告邏輯
        console.error(`[${this.name}] ${message}`, error.stack);
    }
    /**
     * 記錄日誌
     */
    log(level, message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`;
        switch (level) {
            case 'debug':
                console.debug(logMessage);
                break;
            case 'info':
                console.info(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            case 'error':
                console.error(logMessage);
                break;
        }
    }
    // ===== 通用工具方法 =====
    /**
     * 驗證檔案路徑
     */
    validateFilePath(filePath) {
        if (!filePath || !filePath.trim()) {
            return false;
        }
        // 檢查副檔名是否支援
        const extension = this.getFileExtension(filePath);
        return this.supportedExtensions.includes(extension);
    }
    /**
     * 驗證程式碼內容
     */
    validateCode(code) {
        // 基礎驗證：接受任何字串（包括空字串）
        return typeof code === 'string';
    }
    /**
     * 驗證位置
     */
    validatePosition(position) {
        return isPosition(position);
    }
    /**
     * 驗證範圍
     */
    validateRange(range) {
        return (this.validatePosition(range.start) &&
            this.validatePosition(range.end) &&
            (range.start.line < range.end.line ||
                (range.start.line === range.end.line && range.start.column <= range.end.column)));
    }
    /**
     * 從檔案路徑獲取副檔名
     */
    getFileExtension(filePath) {
        const lastDot = filePath.lastIndexOf('.');
        return lastDot === -1 ? '' : filePath.substring(lastDot);
    }
    /**
     * 檢查插件是否支援特定檔案
     */
    supportsFile(filePath) {
        return this.validateFilePath(filePath);
    }
    /**
     * 建立基本的 CodeEdit
     */
    createCodeEdit(filePath, range, newText, editType) {
        if (editType !== undefined) {
            return {
                filePath,
                range,
                newText,
                editType
            };
        }
        else {
            return {
                filePath,
                range,
                newText
            };
        }
    }
    /**
     * 安全執行異步操作
     */
    async safeExecute(operation, defaultValue, context) {
        try {
            return await operation();
        }
        catch (error) {
            this.handleError(error, context);
            return defaultValue;
        }
    }
}
//# sourceMappingURL=base.js.map