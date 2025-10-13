/**
 * Parser 插件介面定義
 * 定義所有 Parser 插件必須實作的契約
 */

import type { AST, Symbol, Reference, Dependency, Position, Range } from '../../shared/types/index.js';
import type { CodeEdit, Definition, Usage, ValidationResult } from './types.js';

/**
 * Parser 插件主介面
 * 所有 Parser 插件都必須實作此介面
 */
export interface ParserPlugin {
  // ===== 基本資訊 =====

  /** 插件名稱 */
  readonly name: string;

  /** 插件版本 */
  readonly version: string;

  /** 支援的副檔名列表 */
  readonly supportedExtensions: readonly string[];

  /** 支援的語言列表 */
  readonly supportedLanguages: readonly string[];

  // ===== 核心功能 =====

  /**
   * 解析程式碼並生成 AST
   * @param code 原始程式碼
   * @param filePath 檔案路徑
   * @returns 解析後的 AST
   * @throws ParseError 當解析失敗時
   */
  parse(code: string, filePath: string): Promise<AST>;

  /**
   * 從 AST 中提取所有符號
   * @param ast AST 物件
   * @returns 符號列表
   */
  extractSymbols(ast: AST): Promise<Symbol[]>;

  /**
   * 查找符號的所有引用
   * @param ast AST 物件
   * @param symbol 目標符號
   * @returns 引用列表
   */
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;

  /**
   * 從 AST 中提取所有依賴關係
   * @param ast AST 物件
   * @returns 依賴列表
   */
  extractDependencies(ast: AST): Promise<Dependency[]>;

  // ===== 重構支援 =====

  /**
   * 重新命名符號
   * @param ast AST 物件
   * @param position 重命名位置
   * @param newName 新名稱
   * @returns 程式碼編輯操作列表
   */
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;

  /**
   * 提取函式重構
   * @param ast AST 物件
   * @param selection 選取的程式碼範圍
   * @returns 程式碼編輯操作列表
   */
  extractFunction(ast: AST, selection: Range): Promise<CodeEdit[]>;

  // ===== 查詢支援 =====

  /**
   * 查找符號定義
   * @param ast AST 物件
   * @param position 查找位置
   * @returns 定義資訊，如果找不到則返回 null
   */
  findDefinition(ast: AST, position: Position): Promise<Definition | null>;

  /**
   * 查找符號的所有使用位置
   * @param ast AST 物件
   * @param symbol 目標符號
   * @returns 使用位置列表
   */
  findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;

  // ===== 驗證和生命週期 =====

  /**
   * 驗證插件狀態
   * @returns 驗證結果
   */
  validate(): Promise<ValidationResult>;

  /**
   * 清理資源
   * 應該釋放插件使用的所有資源
   */
  dispose(): Promise<void>;

  // ===== 檔案過濾支援 =====

  /**
   * 獲取預設的排除模式
   * 每個語言可以定義自己特定的忽略規則
   * @returns 排除模式列表（glob patterns）
   */
  getDefaultExcludePatterns?(): string[];

  /**
   * 判斷是否應該忽略特定檔案
   * @param filePath 檔案路徑
   * @returns true 表示應該忽略此檔案
   */
  shouldIgnoreFile?(filePath: string): boolean;

  // ===== 符號類型判斷支援 =====

  /**
   * 判斷符號是否為抽象宣告
   * 抽象宣告是指不產生實際執行程式碼的型別定義，如 class、interface、type、enum 等
   * 各語言的抽象宣告定義不同，由各 Parser 實作
   * @param symbol 要判斷的符號
   * @returns true 表示此符號是抽象宣告
   */
  isAbstractDeclaration?(symbol: Symbol): boolean;
}

/**
 * Parser 插件型別守衛
 * 檢查物件是否實作了 ParserPlugin 介面
 */
export function isParserPlugin(value: unknown): value is ParserPlugin {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // 檢查基本屬性
  if (
    typeof obj.name !== 'string' ||
    typeof obj.version !== 'string' ||
    !Array.isArray(obj.supportedExtensions) ||
    !Array.isArray(obj.supportedLanguages)
  ) {
    return false;
  }

  // 檢查必要方法存在且為函式
  const requiredMethods = [
    'parse',
    'extractSymbols',
    'findReferences',
    'extractDependencies',
    'rename',
    'extractFunction',
    'findDefinition',
    'findUsages',
    'validate',
    'dispose'
  ];

  for (const method of requiredMethods) {
    if (typeof obj[method] !== 'function') {
      return false;
    }
  }

  // 可選方法不檢查（用於向後相容）
  // getDefaultExcludePatterns 和 shouldIgnoreFile 是可選的

  return true;
}

/**
 * 檢查插件是否支援特定副檔名
 */
export function supportsExtension(plugin: ParserPlugin, extension: string): boolean {
  return (plugin.supportedExtensions as string[]).includes(extension);
}

/**
 * 檢查插件是否支援特定語言
 */
export function supportsLanguage(plugin: ParserPlugin, language: string): boolean {
  return (plugin.supportedLanguages as string[]).includes(language);
}

/**
 * 從檔案路徑獲取副檔名
 */
export function getFileExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.substring(lastDot);
}

/**
 * 查找可以處理特定檔案的插件
 */
export function findPluginForFile(
  plugins: ParserPlugin[],
  filePath: string
): ParserPlugin | null {
  const extension = getFileExtension(filePath);

  for (const plugin of plugins) {
    if (supportsExtension(plugin, extension)) {
      return plugin;
    }
  }

  return null;
}