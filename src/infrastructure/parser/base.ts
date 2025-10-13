/**
 * BaseParserPlugin 抽象類別
 * 提供 Parser 插件的基礎實作和通用功能
 */

import { minimatch } from 'minimatch';
import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
import { isPosition, SymbolType } from '../../shared/types/index.js';
import type { ParserPlugin } from './interface.js';
import type {
  CodeEdit,
  Definition,
  Usage,
  ValidationResult,
  ParserOptions,
  ParserCapabilities
} from './types.js';
import { createValidationSuccess as createSuccessResult } from './types.js';

/**
 * 日誌等級
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * BaseParserPlugin 抽象類別
 * 提供常用功能的預設實作，減少插件開發工作量
 */
export abstract class BaseParserPlugin implements ParserPlugin {
  // ===== 抽象屬性（子類必須實作）=====

  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly supportedExtensions: readonly string[];
  abstract readonly supportedLanguages: readonly string[];

  // ===== 抽象方法（子類必須實作）=====

  abstract parse(code: string, filePath: string): Promise<AST>;

  // ===== 私有屬性 =====

  private _initialized = false;
  private _disposed = false;
  private _options: ParserOptions = {};

  // ===== 預設實作的方法 =====

  /**
   * 從 AST 中提取符號（預設實作返回空陣列）
   */
  async extractSymbols(_ast: AST): Promise<Symbol[]> {
    this.log('debug', `Extracting symbols from ${_ast.sourceFile}`);
    return [];
  }

  /**
   * 查找符號引用（預設實作返回空陣列）
   */
  async findReferences(_ast: AST, symbol: Symbol): Promise<Reference[]> {
    this.log('debug', `Finding references for symbol: ${symbol.name}`);
    return [];
  }

  /**
   * 提取依賴關係（預設實作返回空陣列）
   */
  async extractDependencies(_ast: AST): Promise<Dependency[]> {
    this.log('debug', `Extracting dependencies from ${_ast.sourceFile}`);
    return [];
  }

  /**
   * 重新命名（預設實作返回空陣列）
   */
  async rename(_ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    this.log('debug', `Renaming at position ${position.line}:${position.column} to ${newName}`);
    return [];
  }

  /**
   * 提取函式（預設實作返回空陣列）
   */
  async extractFunction(_ast: AST, _selection: Range): Promise<CodeEdit[]> {
    this.log('debug', 'Extracting function from selection');
    return [];
  }

  /**
   * 查找定義（預設實作返回 null）
   */
  async findDefinition(_ast: AST, position: Position): Promise<Definition | null> {
    this.log('debug', `Finding definition at position ${position.line}:${position.column}`);
    return null;
  }

  /**
   * 查找使用位置（預設實作返回空陣列）
   */
  async findUsages(_ast: AST, symbol: Symbol): Promise<Usage[]> {
    this.log('debug', `Finding usages for symbol: ${symbol.name}`);
    return [];
  }

  /**
   * 驗證插件狀態（預設實作返回成功）
   */
  async validate(): Promise<ValidationResult> {
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
  async dispose(): Promise<void> {
    this.log('info', `Disposing plugin: ${this.name}`);
    this._disposed = true;
    this._initialized = false;
    this._options = {};
  }

  // ===== 生命週期管理 =====

  /**
   * 初始化插件
   */
  async initialize(options?: ParserOptions): Promise<void> {
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
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * 檢查是否已清理
   */
  isDisposed(): boolean {
    return this._disposed;
  }

  // ===== 配置管理 =====

  /**
   * 獲取預設配置選項
   */
  getDefaultOptions(): ParserOptions {
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
  updateOptions(options: Partial<ParserOptions>): void {
    this.log('debug', 'Updating parser options');
    this._options = { ...this._options, ...options };
  }

  /**
   * 獲取插件能力聲明
   */
  getCapabilities(): ParserCapabilities {
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
  handleError(error: Error, context?: string): void {
    const message = context ? `${context}: ${error.message}` : error.message;
    this.log('error', message);

    // 可以在這裡添加錯誤報告邏輯
    console.error(`[${this.name}] ${message}`, error.stack);
  }

  /**
   * 記錄日誌
   */
  log(level: LogLevel, message: string): void {
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
  validateFilePath(filePath: string): boolean {
    if (!filePath || !filePath.trim()) {
      return false;
    }

    // 檢查副檔名是否支援
    const extension = this.getFileExtension(filePath);
    return (this.supportedExtensions as string[]).includes(extension);
  }

  /**
   * 驗證程式碼內容
   */
  validateCode(code: string): boolean {
    // 基礎驗證：接受任何字串（包括空字串）
    return typeof code === 'string';
  }

  /**
   * 驗證位置
   */
  validatePosition(position: Position): boolean {
    return isPosition(position);
  }

  /**
   * 驗證範圍
   */
  validateRange(range: Range): boolean {
    return (
      this.validatePosition(range.start) &&
      this.validatePosition(range.end) &&
      (range.start.line < range.end.line ||
       (range.start.line === range.end.line && range.start.column <= range.end.column))
    );
  }

  /**
   * 從檔案路徑獲取副檔名
   */
  protected getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot === -1 ? '' : filePath.substring(lastDot);
  }

  /**
   * 檢查插件是否支援特定檔案
   */
  protected supportsFile(filePath: string): boolean {
    return this.validateFilePath(filePath);
  }

  /**
   * 建立基本的 CodeEdit
   */
  protected createCodeEdit(
    filePath: string,
    range: Range,
    newText: string,
    editType?: 'rename' | 'extract' | 'inline' | 'format'
  ): CodeEdit {
    if (editType !== undefined) {
      return {
        filePath,
        range,
        newText,
        editType
      };
    } else {
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
  protected async safeExecute<T>(
    operation: () => Promise<T>,
    defaultValue: T,
    context?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error as Error, context);
      return defaultValue;
    }
  }

  // ===== 檔案過濾支援 =====

  /**
   * 獲取預設的排除模式
   * 子類可以 override 此方法提供語言特定的排除模式
   */
  getDefaultExcludePatterns(): string[] {
    return [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.next/**',
      '.nuxt/**',
      'out/**',
      '.cache/**',
      '.turbo/**'
    ];
  }

  /**
   * 判斷是否應該忽略特定檔案
   * 使用 minimatch 比對檔案路徑與排除模式
   */
  shouldIgnoreFile(filePath: string): boolean {
    const patterns = this.getDefaultExcludePatterns();

    // 正規化路徑（移除開頭的 ./ 或 /）
    const normalizedPath = filePath.replace(/^\.?\//, '');

    // 檢查是否匹配任一排除模式
    return patterns.some(pattern => {
      try {
        return minimatch(normalizedPath, pattern, { dot: true });
      } catch (error) {
        this.log('warn', `無效的排除模式: ${pattern}`);
        return false;
      }
    });
  }

  /**
   * 判斷符號是否為抽象宣告
   * 預設實作：class, interface, type, enum, function, module, namespace 視為抽象宣告
   * 排除實體：variable, constant（這些是具體的值實例）
   * 子類別可以覆寫此方法以實作語言特定的判斷邏輯
   */
  isAbstractDeclaration(symbol: Symbol): boolean {
    const abstractTypes = [
      SymbolType.Class,
      SymbolType.Interface,
      SymbolType.Type,
      SymbolType.Enum,
      SymbolType.Function,
      SymbolType.Module,
      SymbolType.Namespace
    ];

    return abstractTypes.includes(symbol.type);
  }
}