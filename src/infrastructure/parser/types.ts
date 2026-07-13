/**
 * Parser 插件相關型別定義
 * 包含 Parser 插件系統所需的所有型別介面
 */

import type * as ts from 'typescript';
import { Range, Location } from '@shared/types/index.js';
import type { AST } from '@shared/types/index.js';

/**
 * 判定某 import/re-export module specifier 是否解析到「曝露目標符號的檔案」。
 *
 * 由 rename 引擎層（有 IFileSystem、專案檔清單、tsconfig 設定）建構後注入 parser.findReferences，
 * 供錨定層（language-service）判定跨 tsconfig path alias 與多層 barrel re-export 的引用；
 * 不提供時錨定層退回內建「相對 specifier 直接解析到定義檔」的保守比對。
 */
export type ModuleSpecifierResolver = (importingFileName: string, moduleSpecifier: string) => boolean;

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
  readonly editType?: 'rename' | 'inline' | 'format';
}

/**
 * 定義類型
 * 表示符號定義的種類
 */
export type DefinitionKind =
  | 'class'
  | 'interface'
  | 'function'
  | 'method'
  | 'variable'
  | 'constant'
  | 'type'
  | 'enum'
  | 'module'
  | 'namespace';

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
  readonly customOptions?: Record<string, unknown>;
}

/**
 * Parser 能力聲明
 * 聲明 Parser 支援的功能
 */
export interface ParserCapabilities {
  /** 是否支援重新命名 */
  readonly supportsRename: boolean;

  /** 是否支援跳轉到定義 */
  readonly supportsGoToDefinition: boolean;

  /** 是否支援查找使用 */
  readonly supportsFindUsages: boolean;

  /** 是否支援程式碼動作 */
  readonly supportsCodeActions: boolean;

  /** 是否支援 change-signature 重構 */
  readonly supportsChangeSignature?: boolean;

  /** 是否支援 call-hierarchy 分析 */
  readonly supportsCallHierarchy?: boolean;

  /** 是否支援 move-member 重構 */
  readonly supportsMoveMember?: boolean;
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
export function createCodeEdit(
  filePath: string,
  range: Range,
  newText: string,
  editType?: CodeEdit['editType']
): CodeEdit {
  if (!filePath.trim()) {
    throw new Error('檔案路徑不能為空');
  }

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
 * 建立 Definition 的工廠函式
 */
export function createDefinition(
  location: Location,
  kind: DefinitionKind,
  containerName?: string
): Definition {
  if (containerName !== undefined) {
    return {
      location,
      kind,
      containerName
    };
  } else {
    return {
      location,
      kind
    };
  }
}

/**
 * 建立 Usage 的工廠函式
 */
export function createUsage(
  location: Location,
  kind: UsageKind
): Usage {
  return {
    location,
    kind
  };
}

/**
 * 建立 ValidationResult 的工廠函式
 */
export function createValidationResult(
  valid: boolean,
  errors: ValidationError[] = [],
  warnings: ValidationWarning[] = []
): ValidationResult {
  return {
    valid,
    errors: [...errors],
    warnings: [...warnings]
  };
}

/**
 * 建立成功的 ValidationResult
 */
export function createValidationSuccess(): ValidationResult {
  return createValidationResult(true);
}

/**
 * 建立失敗的 ValidationResult
 */
export function createValidationFailure(
  errors: ValidationError[],
  warnings?: ValidationWarning[]
): ValidationResult {
  return createValidationResult(false, errors, warnings);
}

/**
 * CodeEdit 型別守衛
 */
export function isCodeEdit(value: unknown): value is CodeEdit {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.filePath === 'string' &&
    obj.filePath.trim().length > 0 &&
    obj.range && typeof obj.range === 'object' &&
    typeof obj.newText === 'string' &&
    (obj.editType === undefined || typeof obj.editType === 'string')
  ) as boolean;
}

/**
 * Definition 型別守衛
 */
export function isDefinition(value: unknown): value is Definition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validKinds: DefinitionKind[] = [
    'class', 'interface', 'function', 'method', 'variable',
    'constant', 'type', 'enum', 'module', 'namespace'
  ];

  return (
    obj.location && typeof obj.location === 'object' &&
    typeof obj.kind === 'string' &&
    (validKinds as string[]).includes(obj.kind as string) &&
    (obj.containerName === undefined || typeof obj.containerName === 'string')
  ) as boolean;
}

/**
 * Usage 型別守衛
 */
export function isUsage(value: unknown): value is Usage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const validKinds: UsageKind[] = ['read', 'write', 'call', 'reference'];

  return (
    obj.location && typeof obj.location === 'object' &&
    typeof obj.kind === 'string' &&
    (validKinds as string[]).includes(obj.kind as string)
  ) as boolean;
}

/**
 * ValidationResult 型別守衛
 */
export function isValidationResult(value: unknown): value is ValidationResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.valid === 'boolean' &&
    Array.isArray(obj.errors) &&
    Array.isArray(obj.warnings)
  );
}

/**
 * ParserCapabilities 型別守衛
 */
export function isParserCapabilities(value: unknown): value is ParserCapabilities {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.supportsRename === 'boolean' &&
    typeof obj.supportsGoToDefinition === 'boolean' &&
    typeof obj.supportsFindUsages === 'boolean' &&
    typeof obj.supportsCodeActions === 'boolean'
  );
}

// ===== TypeScript AST 擴展支援 =====

/**
 * 包含 TypeScript SourceFile 的 AST 擴展介面
 * 用於需要存取 TypeScript 特定功能的場景（如 call-hierarchy 分析）
 * 這個介面定義在 infrastructure 層，避免 core 直接依賴 plugins
 */
export interface TypeScriptASTExtension extends AST {
  /** TypeScript 編譯器的 SourceFile 物件 */
  readonly tsSourceFile: ts.SourceFile;
  /** TypeScript 編譯器的 Program 物件（可選） */
  readonly program?: ts.Program;
}

/**
 * 檢查 AST 是否包含 TypeScript SourceFile
 * @param ast - AST 物件
 * @returns true 如果 ast 有 tsSourceFile 屬性
 */
export function hasTypeScriptSourceFile(ast: AST): ast is TypeScriptASTExtension {
  return 'tsSourceFile' in ast && ast.tsSourceFile !== null && ast.tsSourceFile !== undefined;
}

/**
 * 取得 AST 的 TypeScript SourceFile（如果有的話）
 * @param ast - AST 物件
 * @returns TypeScript SourceFile 或 null
 */
export function getTypeScriptSourceFile(ast: AST): ts.SourceFile | null {
  if (hasTypeScriptSourceFile(ast)) {
    return ast.tsSourceFile;
  }
  return null;
}

/**
 * 包含 Babel AST 的 AST 擴展介面
 */
export interface BabelASTExtension extends AST {
  readonly babelAST: import('@babel/parser').ParseResult<import('@babel/types').File>;
  readonly sourceCode: string;
}

/**
 * 檢查 AST 是否包含 Babel AST
 */
export function hasBabelAST(ast: AST): ast is BabelASTExtension {
  return 'babelAST' in ast && ast.babelAST !== null && ast.babelAST !== undefined;
}
