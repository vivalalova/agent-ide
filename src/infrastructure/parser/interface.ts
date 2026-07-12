/**
 * Parser 插件介面定義
 * 定義所有 Parser 插件必須實作的契約
 */

import type { AST, Symbol, Reference, Dependency, Position, Range } from '@shared/types/index.js';
import type {
  CodeEdit,
  Definition,
  ParserCapabilities,
  Usage,
  ValidationResult
} from '@infrastructure/parser/types.js';
import type { Location } from '@shared/types/core.js';

// ===== Import 語句解析相關型別 =====

/**
 * Named Import 中的符號資訊
 */
export interface ImportNamedSpecifier {
  /** 原始名稱（模組匯出的名稱） */
  name: string;
  /** 本地別名（如果有 as） */
  alias?: string;
  /** 是否為 type-only import（TypeScript） */
  isTypeOnly?: boolean;
}

/**
 * Import 宣告資訊
 * 由 Parser 解析後返回的結構化 import 資訊
 */
export interface ImportDeclaration {
  /** 語句在檔案中的範圍（1-based） */
  range: Range;
  /** 模組路徑（e.g., './utils', 'lodash'） */
  moduleSpecifier: string;
  /** 是否為 type-only import（TypeScript: import type { ... }） */
  isTypeOnly: boolean;
  /** Default import 的本地名稱（e.g., import Foo from ...） */
  defaultImport?: string;
  /** Namespace import 的本地名稱（e.g., import * as Foo from ...） */
  namespaceImport?: string;
  /** Named imports 列表（e.g., import { A, B as C } from ...） */
  namedImports: ImportNamedSpecifier[];
  /** 原始語句文字 */
  rawStatement: string;
}

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

  /**
   * 宣告 Parser 支援的語意能力。
   * 未宣告的能力一律視為不支援，避免非 TS/JS Parser 落入語言專屬重構流程。
   */
  getCapabilities?(): ParserCapabilities;

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

  /**
   * 判斷檔案是否為測試檔案
   * @param filePath 檔案路徑
   * @returns true 表示此檔案是測試檔案
   */
  isTestFile?(filePath: string): boolean;

  /**
   * 取得符號的完整宣告範圍（包含 JSDoc、裝飾器）
   * 使用語言的 AST 精確解析，避免字串/註解中的括號干擾
   * @param code 完整的檔案內容
   * @param symbolName 符號名稱
   * @param symbolType 符號類型
   * @param startLine 符號開始行（1-based）
   * @returns 完整宣告範圍，如果無法解析則返回 null（fallback 到字串匹配）
   */
  getFullDeclarationRange?(
    code: string,
    symbolName: string,
    symbolType: string,
    startLine: number
  ): Range | null;

  // ===== Import 語句解析支援 =====

  /**
   * 解析程式碼中的所有 import 宣告
   * 使用語言的 AST 精確解析，避免正則表達式的邊界問題
   * @param code 完整的檔案內容
   * @returns Import 宣告列表，如果 Parser 不支援則返回 null
   */
  getImportDeclarations?(code: string): ImportDeclaration[] | null;

  // ===== 符號簽章格式化支援 =====

  /**
   * 格式化函數簽章
   * 使用 AST 精確解析函數簽章，正確處理複雜泛型巢狀（如 `Map<K, Fn<V>>`）
   * @param code 完整的檔案內容
   * @param functionName 函數名稱
   * @param line 函數開始行（1-based），可選。若未提供，將找到第一個匹配的函數
   * @returns 格式化後的簽章資訊，如果無法解析則返回 null（fallback 到正則匹配）
   */
  formatSignature?(
    code: string,
    functionName: string,
    line?: number
  ): FormattedSignature | null;

  // ===== 文件註解提取支援 =====

  /**
   * 提取符號的 JSDoc 文件註解
   * 使用 AST 精確識別「真正屬於該節點的 JSDoc」，避免行號回掃的誤判問題
   * @param code 完整的檔案內容
   * @param symbolName 符號名稱
   * @param symbolType 符號類型（function、class、variable 等）
   * @param line 符號開始行（1-based）
   * @returns 文件註解資訊，如果無法解析或無文件則返回 null（fallback 到行號回掃）
   */
  getDocumentation?(
    code: string,
    symbolName: string,
    symbolType: string,
    line: number
  ): Documentation | null;

  // ===== 設計模式識別支援 =====

  /**
   * 識別程式碼中的設計模式
   * 使用語義分析（如回傳型別分析）識別 factory、singleton 等模式
   * @param code 完整的檔案內容
   * @returns 識別到的設計模式列表，如果 Parser 不支援則返回 null
   */
  identifyPatterns?(code: string): PatternInfo[] | null;

  // ===== 作用域感知符號查找支援 =====

  /**
   * 作用域感知的符號引用查找
   * 使用語言的語義分析來精確匹配符號引用，區分不同類別的同名方法
   *
   * 此方法優於簡單的名稱匹配，因為它：
   * 1. 使用語義分析確認引用屬於同一符號
   * 2. 過濾掉註解和字串中的符號
   * 3. 區分不同類別/作用域中的同名符號
   *
   * @param code 完整的檔案內容
   * @param symbolName 要查找的符號名稱
   * @param options 查找選項（可限定類別等）
   * @returns 符號引用列表，如果 Parser 不支援則返回 null（fallback 到手動過濾）
   */
  findScopedReferences?(
    code: string,
    symbolName: string,
    options?: ScopedFindReferencesOptions
  ): ScopedReference[] | null;
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
 * Parser 能力預設值
 */
export const DEFAULT_PARSER_CAPABILITIES: ParserCapabilities = {
  supportsRename: false,
  supportsGoToDefinition: false,
  supportsFindUsages: false,
  supportsCodeActions: false,
  supportsChangeSignature: false,
  supportsCallHierarchy: false,
  supportsMoveMember: false
};

/**
 * 讀取 Parser 能力，未宣告欄位維持 fast-fail 預設。
 */
export function getParserCapabilities(plugin: ParserPlugin | null | undefined): ParserCapabilities {
  if (!plugin?.getCapabilities) {
    return DEFAULT_PARSER_CAPABILITIES;
  }

  return {
    ...DEFAULT_PARSER_CAPABILITIES,
    ...plugin.getCapabilities()
  };
}

/**
 * 檢查 Parser 是否宣告支援特定能力。
 */
export function parserSupportsCapability(
  plugin: ParserPlugin | null | undefined,
  capability: keyof ParserCapabilities
): boolean {
  return getParserCapabilities(plugin)[capability] === true;
}

// ===== 作用域感知符號查找相關型別 =====

/**
 * 作用域感知的符號引用查找選項
 * 用於精確匹配特定類別/作用域中的符號引用
 */
export interface ScopedFindReferencesOptions {
  /** 限定符號所屬的類別名稱（用於區分不同類別的同名方法） */
  readonly className?: string;
  /** 是否包含符號定義本身 */
  readonly includeDeclaration?: boolean;
  /** 專案根目錄（用於跨檔案分析，可選） */
  readonly projectRoot?: string;
}

/**
 * 符號引用類型
 * 描述引用是讀取、寫入還是呼叫
 */
export enum ScopedReferenceKind {
  /** 讀取引用（如變數讀取） */
  Read = 'read',
  /** 寫入引用（如變數賦值） */
  Write = 'write',
  /** 呼叫引用（如函式/方法呼叫） */
  Call = 'call',
  /** import 語句內的綁定（specifier/alias/default/namespace），僅為綁定非真正使用 */
  Import = 'import'
}

/**
 * 作用域感知的符號引用
 * 由 Parser 語義分析後返回，確保精確匹配
 */
export interface ScopedReference {
  /** 引用位置 */
  readonly location: Location;
  /** 引用類型 */
  readonly kind: ScopedReferenceKind;
  /** 是否為精確匹配（已由 Parser 確認屬於同一符號） */
  readonly isExactMatch: true;
  /** 引用所在的容器名稱（如類別名、函式名） */
  readonly containerName?: string;
}

// ===== 設計模式識別相關型別 =====

/**
 * 設計模式類型
 */
export type PatternType = 'factory' | 'singleton' | 'builder' | 'decorator';

/**
 * 設計模式識別資訊
 * 由 Parser 使用語義分析（如回傳型別分析）後返回
 */
export interface PatternInfo {
  /** 設計模式類型 */
  readonly type: PatternType;
  /** 符號名稱（函數名、類別名等） */
  readonly symbolName: string;
  /** 識別信心度（0-1，1 表示完全確定） */
  readonly confidence: number;
  /** 額外的元資料 */
  readonly metadata?: {
    /** Factory 產生的型別（僅 factory 模式適用） */
    readonly producedType?: string;
    /** 其他模式特定資訊 */
    readonly [key: string]: unknown;
  };
}

// ===== 文件註解相關型別 =====

/**
 * JSDoc 標籤資訊
 */
export interface DocumentationTag {
  /** 標籤名稱（e.g., 'param', 'returns', 'example'） */
  readonly name: string;
  /** 標籤文字內容 */
  readonly text: string;
}

/**
 * 文件註解
 * 由 Parser 使用 AST 精確解析後返回
 */
export interface Documentation {
  /** 原始註解文字（包含完整 JSDoc 格式） */
  readonly rawText: string;
  /** 描述文字（移除 JSDoc 標籤後的主要描述） */
  readonly description?: string;
  /** JSDoc 標籤列表 */
  readonly tags: readonly DocumentationTag[];
}

// ===== 符號簽章格式化相關型別 =====

/**
 * 函數參數資訊
 */
export interface FormattedParameter {
  /** 參數名稱 */
  name: string;
  /** 參數型別 */
  type: string;
  /** 是否為可選參數 */
  optional: boolean;
  /** 預設值（如果有） */
  defaultValue?: string;
  /** 是否為 rest 參數（`...args`）；由 AST 的 dotDotDotToken 判定 */
  rest?: boolean;
}

/**
 * 格式化後的簽章資訊
 * 由 Parser 使用 AST 精確解析後返回
 */
export interface FormattedSignature {
  /** 參數列表 */
  parameters: FormattedParameter[];
  /** 回傳型別 */
  returnType: string;
  /** 泛型參數（如果有） */
  typeParameters?: string[];
  /** 函數起始行號（1-based），當未提供 line 參數時由 AST 解析返回 */
  startLine?: number;
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
