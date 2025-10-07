/**
 * Parser 註冊中心實作
 * 負責管理所有 Parser 插件的註冊、查詢和生命週期
 */
import type { ParserPlugin } from './interface.js';
/**
 * Parser 資訊
 * 包含註冊時的元數據和優先級資訊
 */
export interface ParserInfo {
    /** Parser 插件實例 */
    readonly plugin: ParserPlugin;
    /** 註冊時間 */
    readonly registeredAt: Date;
    /** 優先級（數字越大優先級越高） */
    readonly priority: number;
    /** Parser 名稱 */
    readonly name: string;
    /** Parser 版本 */
    readonly version: string;
    /** 支援的副檔名 */
    readonly supportedExtensions: readonly string[];
    /** 支援的語言 */
    readonly supportedLanguages: readonly string[];
}
/**
 * Parser 註冊選項
 */
export interface ParserRegistrationOptions {
    /** 優先級（預設為 0） */
    priority?: number;
    /** 是否覆蓋已存在的 Parser（預設 false） */
    override?: boolean;
}
/**
 * Parser 註冊中心
 * 單例模式，管理所有 Parser 插件的註冊和查詢
 */
export declare class ParserRegistry {
    private static instance;
    /** 以 Parser 名稱為 key 的註冊表 */
    private readonly parsers;
    /** 以副檔名為 key 的快速查找表 */
    private readonly extensionMap;
    /** 以語言為 key 的快速查找表 */
    private readonly languageMap;
    /** 是否已初始化 */
    private initialized;
    /** 是否已被清理 */
    private disposed;
    /**
     * 私有建構函式，確保單例模式
     */
    private constructor();
    /**
     * 獲取單例實例
     */
    static getInstance(): ParserRegistry;
    /**
     * 重設單例實例（主要用於測試）
     */
    static resetInstance(): void;
    /**
     * 註冊 Parser 插件
     * @param plugin Parser 插件實例
     * @param options 註冊選項
     */
    register(plugin: ParserPlugin, options?: ParserRegistrationOptions): void;
    /**
     * 取消註冊 Parser 插件
     * @param pluginName Parser 名稱
     */
    unregister(pluginName: string): void;
    /**
     * 根據副檔名獲取最高優先級的 Parser
     * @param extension 副檔名（包含點，如 '.ts'）
     * @returns Parser 插件實例或 null
     */
    getParser(extension: string): ParserPlugin | null;
    /**
     * 根據語言獲取最高優先級的 Parser
     * @param language 語言名稱
     * @returns Parser 插件實例或 null
     */
    getParserByLanguage(language: string): ParserPlugin | null;
    /**
     * 根據 Parser 名稱獲取 Parser
     * @param name Parser 名稱
     * @returns Parser 插件實例或 null
     */
    getParserByName(name: string): ParserPlugin | null;
    /**
     * 獲取所有支援的副檔名
     * @returns 副檔名陣列
     */
    getSupportedExtensions(): string[];
    /**
     * 獲取所有支援的語言
     * @returns 語言陣列
     */
    getSupportedLanguages(): string[];
    /**
     * 列出所有已註冊的 Parser
     * @returns Parser 資訊陣列
     */
    listParsers(): ParserInfo[];
    /**
     * 檢查 Parser 版本相容性
     * @param pluginName Parser 名稱
     * @param version 期望版本
     * @returns 是否相容
     */
    isCompatible(pluginName: string, version: string): boolean;
    /**
     * 初始化註冊中心
     * 驗證所有已註冊的 Parser
     */
    initialize(): Promise<void>;
    /**
     * 清理註冊中心
     * 清理所有 Parser 並釋放資源
     */
    dispose(): Promise<void>;
    /**
     * 檢查註冊中心是否已被清理
     */
    private checkNotDisposed;
    /**
     * 獲取初始化狀態
     */
    get isInitialized(): boolean;
    /**
     * 獲取清理狀態
     */
    get isDisposed(): boolean;
    /**
     * 獲取已註冊 Parser 的數量
     */
    get size(): number;
}
//# sourceMappingURL=registry.d.ts.map