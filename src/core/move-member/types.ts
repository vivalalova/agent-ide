/**
 * Move Member 型別定義
 * 成員移動功能的核心型別
 */

import type { Location } from '@shared/types/core.js';

/**
 * 可移動的成員類型
 */
export enum MemberType {
  /** 方法 */
  Method = 'method',
  /** 屬性 */
  Property = 'property',
  /** 函式（模組層級） */
  Function = 'function',
  /** 類別 */
  Class = 'class',
  /** 介面 */
  Interface = 'interface',
  /** 類型別名 */
  TypeAlias = 'type-alias',
  /** 常數 */
  Constant = 'constant',
  /** 列舉 */
  Enum = 'enum'
}

/**
 * 成員定義
 */
export interface MemberDefinition {
  /** 成員名稱 */
  readonly name: string;
  /** 成員類型 */
  readonly type: MemberType;
  /** 成員位置 */
  readonly location: Location;
  /** 成員原始碼 */
  readonly sourceCode: string;
  /** 所屬類別（若為類別成員） */
  readonly className?: string;
  /** 修飾符 */
  readonly modifiers: readonly string[];
  /** JSDoc 或文件註解 */
  readonly documentation?: string;
  /** 依賴的其他符號 */
  readonly dependencies: readonly string[];
}

/**
 * 移動目標類型
 */
export enum MoveTargetType {
  /** 移動到現有檔案 */
  ExistingFile = 'existing-file',
  /** 移動到新檔案 */
  NewFile = 'new-file',
  /** 移動到現有類別 */
  ExistingClass = 'existing-class'
}

/**
 * 移動目標
 */
export interface MoveTarget {
  /** 目標類型 */
  readonly type: MoveTargetType;
  /** 目標檔案路徑 */
  readonly filePath: string;
  /** 目標類別名稱（移動到類別時） */
  readonly className?: string;
  /** 插入位置（行號，0 表示檔案開頭，-1 表示檔案結尾） */
  readonly insertPosition?: number;
}

/**
 * 來源位置（用於 by-position 定位）
 */
export interface SourcePosition {
  /** 行號（1-based） */
  readonly line: number;
  /** 欄位（1-based，可選） */
  readonly column?: number;
}

/**
 * Move Member 選項
 *
 * 支援兩種定位方式：
 * 1. by-name：使用 memberName + memberType + sourceClassName
 * 2. by-position：使用 sourcePosition（優先於 by-name）
 */
export interface MoveMemberOptions {
  /** 來源檔案路徑 */
  readonly sourceFile: string;
  /** 成員名稱（by-name 模式必須） */
  readonly memberName?: string;
  /** 成員類型（可選，用於區分同名成員） */
  readonly memberType?: MemberType;
  /** 所屬類別（若為類別成員） */
  readonly sourceClassName?: string;
  /** 來源位置（by-position 模式，優先於 memberName） */
  readonly sourcePosition?: SourcePosition;
  /** 移動目標 */
  readonly target: MoveTarget;
  /** 專案根目錄 */
  readonly projectRoot: string;
  /** 是否預覽而不執行 */
  readonly preview?: boolean;
  /** 是否更新引用 */
  readonly updateReferences?: boolean;
  /** 是否保留原位置的 re-export */
  readonly keepReexport?: boolean;
}

/**
 * 引用更新資訊
 */
export interface ReferenceUpdate {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 原始 import 陳述 */
  readonly originalImport: string;
  /** 新的 import 陳述 */
  readonly newImport: string;
  /** 位置 */
  readonly location: Location;
}

/**
 * 檔案變更資訊
 */
export interface FileChange {
  readonly filePath: string;
  readonly originalCode: string;
  readonly newCode: string;
}

/**
 * 目標檔案變更資訊
 */
export interface TargetFileChange {
  readonly filePath: string;
  readonly originalCode: string | null;
  readonly newCode: string;
  readonly isNewFile: boolean;
}

/**
 * 移動統計資訊
 */
export interface MoveMemberStats {
  /** 更新的引用數量 */
  readonly referencesUpdated: number;
  /** 影響的檔案數量 */
  readonly filesAffected: number;
}

/**
 * Move Member 成功結果
 */
export interface MoveMemberSuccessResult {
  /** 成功標記 */
  readonly success: true;
  /** 被移動的成員 */
  readonly member: MemberDefinition;
  /** 移動目標 */
  readonly target: MoveTarget;
  /** 來源檔案變更 */
  readonly sourceFileChange: FileChange;
  /** 目標檔案變更 */
  readonly targetFileChange: TargetFileChange;
  /** 引用更新列表 */
  readonly referenceUpdates: readonly ReferenceUpdate[];
  /** 是否已執行（false 表示僅預覽） */
  readonly executed: boolean;
  /** 統計資訊 */
  readonly stats: MoveMemberStats;
}

/**
 * Move Member 錯誤結果
 */
export interface MoveMemberErrorResult {
  /** 失敗標記 */
  readonly success: false;
  /** 錯誤代碼 */
  readonly code: MoveMemberErrorCode;
  /** 錯誤訊息 */
  readonly error: string;
}

/**
 * Move Member 結果（聯合型別）
 */
export type MoveMemberResult = MoveMemberSuccessResult | MoveMemberErrorResult;

/**
 * 驗證錯誤
 */
export interface MoveMemberValidationError {
  /** 錯誤代碼 */
  readonly code: MoveMemberErrorCode;
  /** 錯誤訊息 */
  readonly message: string;
}

/**
 * 錯誤代碼
 */
export enum MoveMemberErrorCode {
  /** 找不到成員 */
  MemberNotFound = 'member-not-found',
  /** 找不到來源檔案 */
  SourceFileNotFound = 'source-file-not-found',
  /** 目標檔案已存在同名成員 */
  DuplicateMemberInTarget = 'duplicate-member-in-target',
  /** 找不到目標類別 */
  TargetClassNotFound = 'target-class-not-found',
  /** 循環依賴 */
  CircularDependency = 'circular-dependency',
  /** 不支援的成員類型 */
  UnsupportedMemberType = 'unsupported-member-type',
  /** 不支援的語言 */
  UnsupportedLanguage = 'unsupported-language',
  /** 解析錯誤 */
  ParseError = 'parse-error',
  /** 目標檔案不存在（且不是新檔案模式） */
  TargetFileNotFound = 'target-file-not-found'
}

/**
 * Type Guards
 */
export function isMemberDefinition(obj: unknown): obj is MemberDefinition {
  return typeof obj === 'object' && obj !== null &&
    'name' in obj && typeof (obj as MemberDefinition).name === 'string' &&
    'type' in obj && Object.values(MemberType).includes((obj as MemberDefinition).type);
}

export function isMoveMemberResult(obj: unknown): obj is MoveMemberResult {
  return typeof obj === 'object' && obj !== null &&
    'success' in obj && typeof (obj as MoveMemberResult).success === 'boolean';
}
