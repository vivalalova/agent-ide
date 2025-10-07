/**
 * Parser 插件相關型別定義
 * 包含 Parser 插件系統所需的所有型別介面
 */
import { Range, Location } from '../../shared/types/index.js';
/**
 * 程式碼編輯操作
 * 表示對程式碼的修改操作
 */
export interface CodeEdit {
    /** 檔案路徑 */
    readonly filePath: string;
    /** 編輯範圍 */
    readonly range: Range;
    /** 新的文字內容 */
    readonly newText: string;
    /** 編輯類型（可選） */
    readonly editType?: 'rename' | 'extract' | 'inline' | 'format';
}
/**
 * 定義類型
 * 表示符號定義的種類
 */
export type DefinitionKind = 'class' | 'interface' | 'function' | 'method' | 'variable' | 'constant' | 'type' | 'enum' | 'module' | 'namespace';
/**
 * 定義位置資訊
 * 表示符號定義的位置和相關資訊
 */
export interface Definition {
    /** 定義的位置 */
    readonly location: Location;
    /** 定義的種類 */
    readonly kind: DefinitionKind;
    /** 容器名稱（可選），如類名、模組名等 */
    readonly containerName?: string;
}
/**
 * 使用類型
 * 表示符號使用的種類
 */
export type UsageKind = 'read' | 'write' | 'call' | 'reference';
/**
 * 使用位置資訊
 * 表示符號使用的位置和相關資訊
 */
export interface Usage {
    /** 使用的位置 */
    readonly location: Location;
    /** 使用的種類 */
    readonly kind: UsageKind;
}
/**
 * 驗證錯誤
 * 表示驗證過程中發現的錯誤
 */
export interface ValidationError {
    /** 錯誤代碼 */
    readonly code: string;
    /** 錯誤訊息 */
    readonly message: string;
    /** 錯誤位置 */
    readonly location: Location;
    /** 嚴重程度（可選） */
    readonly severity?: 'error' | 'warning' | 'info';
}
/**
 * 驗證警告（與錯誤結構相同）
 */
export type ValidationWarning = ValidationError;
/**
 * 驗證結果
 * 表示 Parser 驗證的結果
 */
export interface ValidationResult {
    /** 是否驗證通過 */
    readonly valid: boolean;
    /** 驗證錯誤列表 */
    readonly errors: readonly ValidationError[];
    /** 驗證警告列表 */
    readonly warnings: readonly ValidationWarning[];
}
/**
 * Parser 配置選項
 * 用於配置 Parser 的行為
 */
export interface ParserOptions {
    /** 是否使用嚴格模式 */
    readonly strictMode?: boolean;
    /** 是否允許實驗性功能 */
    readonly allowExperimentalFeatures?: boolean;
    /** 目標版本 */
    readonly targetVersion?: string;
    /** 自定義選項 */
    readonly customOptions?: Record<string, any>;
}
/**
 * Parser 能力聲明
 * 聲明 Parser 支援的功能
 */
export interface ParserCapabilities {
    /** 是否支援重新命名 */
    readonly supportsRename: boolean;
    /** 是否支援提取函式 */
    readonly supportsExtractFunction: boolean;
    /** 是否支援跳轉到定義 */
    readonly supportsGoToDefinition: boolean;
    /** 是否支援查找使用 */
    readonly supportsFindUsages: boolean;
    /** 是否支援程式碼動作 */
    readonly supportsCodeActions: boolean;
}
/**
 * Parser 錯誤介面
 * 擴展自標準 Error，包含位置資訊
 */
export interface ParserError {
    /** 錯誤名稱 */
    readonly name: string;
    /** 錯誤訊息 */
    readonly message: string;
    /** 錯誤代碼 */
    readonly code: string;
    /** 錯誤位置 */
    readonly location: Location;
    /** 語法元素（可選） */
    readonly syntaxElement?: string;
}
/**
 * 建立 CodeEdit 的工廠函式
 */
export declare function createCodeEdit(filePath: string, range: Range, newText: string, editType?: CodeEdit['editType']): CodeEdit;
/**
 * 建立 Definition 的工廠函式
 */
export declare function createDefinition(location: Location, kind: DefinitionKind, containerName?: string): Definition;
/**
 * 建立 Usage 的工廠函式
 */
export declare function createUsage(location: Location, kind: UsageKind): Usage;
/**
 * 建立 ValidationResult 的工廠函式
 */
export declare function createValidationResult(valid: boolean, errors?: ValidationError[], warnings?: ValidationWarning[]): ValidationResult;
/**
 * 建立成功的 ValidationResult
 */
export declare function createValidationSuccess(): ValidationResult;
/**
 * 建立失敗的 ValidationResult
 */
export declare function createValidationFailure(errors: ValidationError[], warnings?: ValidationWarning[]): ValidationResult;
/**
 * CodeEdit 型別守衛
 */
export declare function isCodeEdit(value: unknown): value is CodeEdit;
/**
 * Definition 型別守衛
 */
export declare function isDefinition(value: unknown): value is Definition;
/**
 * Usage 型別守衛
 */
export declare function isUsage(value: unknown): value is Usage;
/**
 * ValidationResult 型別守衛
 */
export declare function isValidationResult(value: unknown): value is ValidationResult;
/**
 * ParserCapabilities 型別守衛
 */
export declare function isParserCapabilities(value: unknown): value is ParserCapabilities;
//# sourceMappingURL=types.d.ts.map