/**
 * Parser 註冊中心實作
 * 負責管理所有 Parser 插件的註冊、查詢和生命週期
 */
import { isParserPlugin } from './interface.js';
import { DuplicateParserError, ParserNotFoundError, ParserInitializationError } from '../../shared/errors/index.js';
/**
 * Parser 註冊中心
 * 單例模式，管理所有 Parser 插件的註冊和查詢
 */
export class ParserRegistry {
    static instance = null;
    /** 以 Parser 名稱為 key 的註冊表 */
    parsers = new Map();
    /** 以副檔名為 key 的快速查找表 */
    extensionMap = new Map();
    /** 以語言為 key 的快速查找表 */
    languageMap = new Map();
    /** 是否已初始化 */
    initialized = false;
    /** 是否已被清理 */
    disposed = false;
    /**
     * 私有建構函式，確保單例模式
     */
    constructor() { }
    /**
     * 獲取單例實例
     */
    static getInstance() {
        if (!ParserRegistry.instance) {
            ParserRegistry.instance = new ParserRegistry();
        }
        return ParserRegistry.instance;
    }
    /**
     * 重設單例實例（主要用於測試）
     */
    static resetInstance() {
        if (ParserRegistry.instance) {
            ParserRegistry.instance.dispose();
            ParserRegistry.instance = null;
        }
    }
    // ===== 註冊和管理 =====
    /**
     * 註冊 Parser 插件
     * @param plugin Parser 插件實例
     * @param options 註冊選項
     */
    register(plugin, options = {}) {
        this.checkNotDisposed();
        // 驗證插件
        if (!isParserPlugin(plugin)) {
            throw new Error('提供的物件不是有效的 ParserPlugin');
        }
        const { priority = 0, override = false } = options;
        // 檢查重複註冊
        if (!override && this.parsers.has(plugin.name)) {
            throw new DuplicateParserError(plugin.name);
        }
        // 如果是覆蓋模式，先取消註冊舊的
        if (override && this.parsers.has(plugin.name)) {
            this.unregister(plugin.name);
        }
        // 建立 Parser 資訊
        const parserInfo = {
            plugin,
            registeredAt: new Date(),
            priority,
            name: plugin.name,
            version: plugin.version,
            supportedExtensions: plugin.supportedExtensions,
            supportedLanguages: plugin.supportedLanguages
        };
        // 註冊到主表
        this.parsers.set(plugin.name, parserInfo);
        // 建立副檔名索引
        for (const extension of plugin.supportedExtensions) {
            if (!this.extensionMap.has(extension)) {
                this.extensionMap.set(extension, []);
            }
            const extensionParsers = this.extensionMap.get(extension);
            extensionParsers.push(parserInfo);
            // 按優先級排序（高優先級在前）
            extensionParsers.sort((a, b) => b.priority - a.priority);
        }
        // 建立語言索引
        for (const language of plugin.supportedLanguages) {
            if (!this.languageMap.has(language)) {
                this.languageMap.set(language, []);
            }
            const languageParsers = this.languageMap.get(language);
            languageParsers.push(parserInfo);
            // 按優先級排序（高優先級在前）
            languageParsers.sort((a, b) => b.priority - a.priority);
        }
    }
    /**
     * 取消註冊 Parser 插件
     * @param pluginName Parser 名稱
     */
    unregister(pluginName) {
        this.checkNotDisposed();
        const parserInfo = this.parsers.get(pluginName);
        if (!parserInfo) {
            throw new ParserNotFoundError(pluginName, 'name');
        }
        // 從主表移除
        this.parsers.delete(pluginName);
        // 從副檔名索引移除
        for (const extension of parserInfo.supportedExtensions) {
            const extensionParsers = this.extensionMap.get(extension);
            if (extensionParsers) {
                const index = extensionParsers.indexOf(parserInfo);
                if (index !== -1) {
                    extensionParsers.splice(index, 1);
                }
                // 如果列表為空，移除該鍵
                if (extensionParsers.length === 0) {
                    this.extensionMap.delete(extension);
                }
            }
        }
        // 從語言索引移除
        for (const language of parserInfo.supportedLanguages) {
            const languageParsers = this.languageMap.get(language);
            if (languageParsers) {
                const index = languageParsers.indexOf(parserInfo);
                if (index !== -1) {
                    languageParsers.splice(index, 1);
                }
                // 如果列表為空，移除該鍵
                if (languageParsers.length === 0) {
                    this.languageMap.delete(language);
                }
            }
        }
    }
    // ===== 查詢功能 =====
    /**
     * 根據副檔名獲取最高優先級的 Parser
     * @param extension 副檔名（包含點，如 '.ts'）
     * @returns Parser 插件實例或 null
     */
    getParser(extension) {
        this.checkNotDisposed();
        const parsers = this.extensionMap.get(extension);
        return parsers && parsers.length > 0 ? parsers[0].plugin : null;
    }
    /**
     * 根據語言獲取最高優先級的 Parser
     * @param language 語言名稱
     * @returns Parser 插件實例或 null
     */
    getParserByLanguage(language) {
        this.checkNotDisposed();
        const parsers = this.languageMap.get(language);
        return parsers && parsers.length > 0 ? parsers[0].plugin : null;
    }
    /**
     * 根據 Parser 名稱獲取 Parser
     * @param name Parser 名稱
     * @returns Parser 插件實例或 null
     */
    getParserByName(name) {
        this.checkNotDisposed();
        const parserInfo = this.parsers.get(name);
        return parserInfo ? parserInfo.plugin : null;
    }
    /**
     * 獲取所有支援的副檔名
     * @returns 副檔名陣列
     */
    getSupportedExtensions() {
        this.checkNotDisposed();
        return Array.from(this.extensionMap.keys()).sort();
    }
    /**
     * 獲取所有支援的語言
     * @returns 語言陣列
     */
    getSupportedLanguages() {
        this.checkNotDisposed();
        return Array.from(this.languageMap.keys()).sort();
    }
    /**
     * 列出所有已註冊的 Parser
     * @returns Parser 資訊陣列
     */
    listParsers() {
        this.checkNotDisposed();
        return Array.from(this.parsers.values()).sort((a, b) => a.name.localeCompare(b.name));
    }
    // ===== 版本管理 =====
    /**
     * 檢查 Parser 版本相容性
     * @param pluginName Parser 名稱
     * @param version 期望版本
     * @returns 是否相容
     */
    isCompatible(pluginName, version) {
        this.checkNotDisposed();
        const parserInfo = this.parsers.get(pluginName);
        if (!parserInfo) {
            return false;
        }
        // 這裡使用簡單的版本匹配，實際應用中可能需要更複雜的版本比較邏輯
        return parserInfo.version === version;
    }
    // ===== 生命週期 =====
    /**
     * 初始化註冊中心
     * 驗證所有已註冊的 Parser
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        this.checkNotDisposed();
        const validationPromises = Array.from(this.parsers.values()).map(async (parserInfo) => {
            try {
                const result = await parserInfo.plugin.validate();
                if (!result.valid) {
                    throw new ParserInitializationError(parserInfo.name, `驗證失敗: ${result.errors.map(e => e.message).join(', ')}`);
                }
            }
            catch (error) {
                throw new ParserInitializationError(parserInfo.name, `驗證異常: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error : undefined);
            }
        });
        await Promise.all(validationPromises);
        this.initialized = true;
    }
    /**
     * 清理註冊中心
     * 清理所有 Parser 並釋放資源
     */
    async dispose() {
        if (this.disposed) {
            return;
        }
        // 清理所有 Parser
        const disposePromises = Array.from(this.parsers.values()).map(async (parserInfo) => {
            try {
                await parserInfo.plugin.dispose();
            }
            catch (error) {
                // 記錄錯誤但不拋出，避免影響其他 Parser 的清理
                console.warn(`清理 Parser ${parserInfo.name} 時發生錯誤:`, error);
            }
        });
        await Promise.all(disposePromises);
        // 清空所有映射表
        this.parsers.clear();
        this.extensionMap.clear();
        this.languageMap.clear();
        this.disposed = true;
        this.initialized = false;
    }
    // ===== 內部工具方法 =====
    /**
     * 檢查註冊中心是否已被清理
     */
    checkNotDisposed() {
        if (this.disposed) {
            throw new Error('ParserRegistry 已被清理');
        }
    }
    /**
     * 獲取初始化狀態
     */
    get isInitialized() {
        return this.initialized;
    }
    /**
     * 獲取清理狀態
     */
    get isDisposed() {
        return this.disposed;
    }
    /**
     * 獲取已註冊 Parser 的數量
     */
    get size() {
        return this.parsers.size;
    }
}
//# sourceMappingURL=registry.js.map