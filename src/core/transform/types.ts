/**
 * Transform 模組統一型別定義
 * 整合 rename/move/shift/refactor 的共用介面
 */

import type { Range, Position, Location } from '@shared/types/core.js';

/**
 * Transform 操作類別
 */
export enum TransformCategory {
  Symbol = 'symbol',        // 符號變換：rename, change-signature
  Structure = 'structure',  // 結構變換：extract, inline
  Location = 'location'     // 位置變換：shift, move-file, move-member
}

/**
 * Transform 操作類型
 */
export enum TransformType {
  // 符號變換
  Rename = 'rename',
  ChangeSignature = 'change-signature',

  // 結構變換
  ExtractFunction = 'extract-function',
  ExtractVariable = 'extract-variable',
  InlineFunction = 'inline-function',
  InlineVariable = 'inline-variable',

  // 位置變換
  Shift = 'shift',
  MoveFile = 'move-file',
  MoveMember = 'move-member'
}

/**
 * Transform 驗證結果
 */
export interface TransformValidation {
  readonly isValid: boolean;
  readonly errors: readonly TransformError[];
  readonly warnings: readonly TransformWarning[];
}

/**
 * Transform 錯誤
 */
export interface TransformError {
  readonly code: TransformErrorCode;
  readonly message: string;
  readonly location?: Location;
  readonly suggestion?: string;
}

/**
 * Transform 錯誤碼
 */
export enum TransformErrorCode {
  // 通用錯誤
  InvalidInput = 'invalid_input',
  FileNotFound = 'file_not_found',
  PermissionDenied = 'permission_denied',
  ParseError = 'parse_error',

  // 符號錯誤
  SymbolNotFound = 'symbol_not_found',
  NameCollision = 'name_collision',
  ReservedKeyword = 'reserved_keyword',
  InvalidIdentifier = 'invalid_identifier',

  // 結構錯誤
  InvalidSelection = 'invalid_selection',
  IncompleteStatements = 'incomplete_statements',
  UnsupportedPattern = 'unsupported_pattern',

  // 位置錯誤
  InvalidLineRange = 'invalid_line_range',
  InvalidPosition = 'invalid_position',
  TargetExists = 'target_exists',
  CircularDependency = 'circular_dependency'
}

/**
 * Transform 警告
 */
export interface TransformWarning {
  readonly code: TransformWarningCode;
  readonly message: string;
  readonly location?: Location;
}

/**
 * Transform 警告碼
 */
export enum TransformWarningCode {
  ManyFilesAffected = 'many_files_affected',
  PotentialBreakingChange = 'potential_breaking_change',
  ExternalDependency = 'external_dependency',
  LargeRefactoring = 'large_refactoring'
}

/**
 * Transform 預覽結果
 */
export interface TransformPreview {
  readonly success: boolean;
  readonly changes: readonly FileChange[];
  readonly summary: TransformSummary;
  readonly validation: TransformValidation;
}

/**
 * Transform 摘要
 */
export interface TransformSummary {
  readonly totalFiles: number;
  readonly totalChanges: number;
  readonly estimatedTime: number; // 毫秒
  readonly description: string;
}

/**
 * Transform 執行結果基底
 */
export interface TransformResult {
  readonly success: boolean;
  readonly type: TransformType;
  readonly affectedFiles: readonly string[];
  readonly changes: readonly FileChange[];
  readonly errors?: readonly string[];
  readonly rollbackId?: string;
}

/**
 * 檔案變更
 */
export interface FileChange {
  readonly filePath: string;
  readonly originalContent: string;
  readonly newContent: string;
  readonly textChanges: readonly TextChange[];
}

/**
 * 文字變更
 */
export interface TextChange {
  readonly range: Range;
  readonly oldText: string;
  readonly newText: string;
}

/**
 * Transform 操作統一介面
 */
export interface TransformOperation<TOptions, TResult extends TransformResult> {
  /** 操作類別 */
  readonly category: TransformCategory;

  /** 操作類型 */
  readonly type: TransformType;

  /** 操作選項 */
  readonly options: TOptions;

  /** 驗證操作 */
  validate(): Promise<TransformValidation>;

  /** 預覽操作（dry-run） */
  preview(): Promise<TransformPreview>;

  /** 執行操作 */
  execute(): Promise<TResult>;
}

/**
 * Transform 執行器抽象基底類別
 */
export abstract class BaseTransformExecutor<TOptions, TResult extends TransformResult>
  implements TransformOperation<TOptions, TResult> {

  abstract readonly category: TransformCategory;
  abstract readonly type: TransformType;

  constructor(public readonly options: TOptions) {}

  abstract validate(): Promise<TransformValidation>;
  abstract preview(): Promise<TransformPreview>;
  abstract execute(): Promise<TResult>;

  /**
   * 建立成功的驗證結果
   */
  protected createValidValidation(warnings: TransformWarning[] = []): TransformValidation {
    return {
      isValid: true,
      errors: [],
      warnings
    };
  }

  /**
   * 建立失敗的驗證結果
   */
  protected createInvalidValidation(errors: TransformError[], warnings: TransformWarning[] = []): TransformValidation {
    return {
      isValid: false,
      errors,
      warnings
    };
  }

  /**
   * 建立錯誤物件
   */
  protected createError(code: TransformErrorCode, message: string, location?: Location, suggestion?: string): TransformError {
    return { code, message, location, suggestion };
  }

  /**
   * 建立警告物件
   */
  protected createWarning(code: TransformWarningCode, message: string, location?: Location): TransformWarning {
    return { code, message, location };
  }
}

// ============================================================
// 型別守衛
// ============================================================

/**
 * TextChange 型別守衛
 */
export function isTextChange(value: unknown): value is TextChange {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.oldText === 'string'
    && typeof obj.newText === 'string'
    && obj.range !== null
    && typeof obj.range === 'object'
  );
}

/**
 * FileChange 型別守衛
 */
export function isFileChange(value: unknown): value is FileChange {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.filePath === 'string'
    && typeof obj.originalContent === 'string'
    && typeof obj.newContent === 'string'
    && Array.isArray(obj.textChanges)
  );
}

/**
 * TransformResult 型別守衛
 */
export function isTransformResult(value: unknown): value is TransformResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.success === 'boolean'
    && Object.values(TransformType).includes(obj.type as TransformType)
    && Array.isArray(obj.affectedFiles)
    && Array.isArray(obj.changes)
  );
}
