/**
 * Change Signature 型別定義
 * 參數重構功能的核心型別
 */

import type { Range, Location } from '@shared/types/core.js';

/**
 * 參數定義
 */
export interface ParameterDefinition {
  /** 參數名稱 */
  readonly name: string;
  /** 參數類型（TypeScript/Swift） */
  readonly type?: string;
  /** 預設值 */
  readonly defaultValue?: string;
  /** 是否為可選參數 */
  readonly optional: boolean;
  /** 是否為剩餘參數（rest parameter） */
  readonly rest: boolean;
  /** 參數位置 */
  readonly range: Range;
}

/**
 * 函式簽名
 */
export interface FunctionSignature {
  /** 函式名稱 */
  readonly name: string;
  /** 參數列表 */
  readonly parameters: readonly ParameterDefinition[];
  /** 回傳類型 */
  readonly returnType?: string;
  /** 函式位置 */
  readonly location: Location;
  /** 是否為方法 */
  readonly isMethod: boolean;
  /** 所屬類別（若為方法） */
  readonly className?: string;
  /** 修飾符（async, static, etc.） */
  readonly modifiers: readonly string[];
}

/**
 * 簽名變更操作類型
 */
export enum SignatureChangeType {
  /** 新增參數 */
  AddParameter = 'add-parameter',
  /** 移除參數 */
  RemoveParameter = 'remove-parameter',
  /** 重新排序參數 */
  ReorderParameters = 'reorder-parameters',
  /** 修改參數類型 */
  ChangeParameterType = 'change-parameter-type',
  /** 重命名參數 */
  RenameParameter = 'rename-parameter',
  /** 修改預設值 */
  ChangeDefaultValue = 'change-default-value',
  /** 切換可選狀態 */
  ToggleOptional = 'toggle-optional'
}

/**
 * 新增參數操作
 */
export interface AddParameterChange {
  readonly type: SignatureChangeType.AddParameter;
  /** 新參數名稱 */
  readonly name: string;
  /** 新參數類型 */
  readonly parameterType?: string;
  /** 新參數預設值 */
  readonly defaultValue?: string;
  /** 是否可選 */
  readonly optional: boolean;
  /** 插入位置（0-based index，-1 表示最後） */
  readonly position: number;
  /** 呼叫點使用的值（若無則使用 defaultValue） */
  readonly callSiteValue?: string;
}

/**
 * 移除參數操作
 */
export interface RemoveParameterChange {
  readonly type: SignatureChangeType.RemoveParameter;
  /** 要移除的參數名稱或索引 */
  readonly parameterNameOrIndex: string | number;
}

/**
 * 重新排序參數操作
 */
export interface ReorderParametersChange {
  readonly type: SignatureChangeType.ReorderParameters;
  /** 新的參數順序（參數名稱或索引的陣列） */
  readonly newOrder: readonly (string | number)[];
}

/**
 * 修改參數類型操作
 */
export interface ChangeParameterTypeChange {
  readonly type: SignatureChangeType.ChangeParameterType;
  /** 要修改的參數名稱或索引 */
  readonly parameterNameOrIndex: string | number;
  /** 新的類型 */
  readonly newType: string;
}

/**
 * 重命名參數操作
 */
export interface RenameParameterChange {
  readonly type: SignatureChangeType.RenameParameter;
  /** 要重命名的參數名稱或索引 */
  readonly parameterNameOrIndex: string | number;
  /** 新名稱 */
  readonly newName: string;
}

/**
 * 修改預設值操作
 */
export interface ChangeDefaultValueChange {
  readonly type: SignatureChangeType.ChangeDefaultValue;
  /** 要修改的參數名稱或索引 */
  readonly parameterNameOrIndex: string | number;
  /** 新的預設值（undefined 表示移除預設值） */
  readonly newDefaultValue: string | undefined;
}

/**
 * 切換可選狀態操作
 */
export interface ToggleOptionalChange {
  readonly type: SignatureChangeType.ToggleOptional;
  /** 要切換的參數名稱或索引 */
  readonly parameterNameOrIndex: string | number;
  /** 新的可選狀態 */
  readonly optional: boolean;
}

/**
 * 簽名變更操作（聯合類型）
 */
export type SignatureChange =
  | AddParameterChange
  | RemoveParameterChange
  | ReorderParametersChange
  | ChangeParameterTypeChange
  | RenameParameterChange
  | ChangeDefaultValueChange
  | ToggleOptionalChange;

/**
 * Change Signature 選項
 */
export interface ChangeSignatureOptions {
  /** 目標檔案路徑 */
  readonly filePath: string;
  /** 函式名稱 */
  readonly functionName: string;
  /** 要執行的變更操作 */
  readonly changes: readonly SignatureChange[];
  /** 專案根目錄 */
  readonly projectRoot: string;
  /** 是否預覽而不執行 */
  readonly preview?: boolean;
  /** 要更新的檔案（若未指定則搜尋整個專案） */
  readonly targetFiles?: readonly string[];
}

/**
 * 呼叫點更新資訊
 */
export interface CallSiteUpdate {
  /** 檔案路徑 */
  readonly filePath: string;
  /** 原始呼叫程式碼 */
  readonly originalCode: string;
  /** 更新後的呼叫程式碼 */
  readonly newCode: string;
  /** 呼叫位置 */
  readonly location: Location;
}

/**
 * Change Signature 結果
 */
export interface ChangeSignatureResult {
  /** 是否成功 */
  readonly success: boolean;
  /** 錯誤訊息（若失敗） */
  readonly error?: string;
  /** 原始簽名 */
  readonly originalSignature: FunctionSignature;
  /** 新簽名 */
  readonly newSignature: FunctionSignature;
  /** 簽名定義更新 */
  readonly definitionUpdate: {
    readonly filePath: string;
    readonly originalCode: string;
    readonly newCode: string;
    readonly location: Location;
  };
  /** 呼叫點更新列表 */
  readonly callSiteUpdates: readonly CallSiteUpdate[];
  /** 是否已執行（false 表示僅預覽） */
  readonly executed: boolean;
  /** 統計資訊 */
  readonly stats: {
    /** 更新的呼叫點數量 */
    readonly callSitesUpdated: number;
    /** 影響的檔案數量 */
    readonly filesAffected: number;
  };
}

/**
 * 驗證錯誤
 */
export interface ChangeSignatureValidationError {
  /** 錯誤代碼 */
  readonly code: ChangeSignatureErrorCode;
  /** 錯誤訊息 */
  readonly message: string;
  /** 相關參數（若有） */
  readonly parameterName?: string;
}

/**
 * 錯誤代碼
 */
export enum ChangeSignatureErrorCode {
  /** 找不到函式 */
  FunctionNotFound = 'function-not-found',
  /** 參數不存在 */
  ParameterNotFound = 'parameter-not-found',
  /** 參數名稱重複 */
  DuplicateParameterName = 'duplicate-parameter-name',
  /** 無效的參數順序 */
  InvalidParameterOrder = 'invalid-parameter-order',
  /** 無效的參數類型 */
  InvalidParameterType = 'invalid-parameter-type',
  /** 無效的預設值 */
  InvalidDefaultValue = 'invalid-default-value',
  /** 缺少預設值（新增參數時必須指定） */
  MissingDefaultValue = 'missing-default-value',
  /** 不支援的語言 */
  UnsupportedLanguage = 'unsupported-language',
  /** 解析錯誤 */
  ParseError = 'parse-error',
  /** 必填參數不可移除（有呼叫點依賴） */
  RequiredParameterInUse = 'required-parameter-in-use',
  /** 可選參數位於必選參數之前（TypeScript 規則違反） */
  OptionalBeforeRequired = 'optional-before-required',
  /** rest 參數不在參數列表最後（TypeScript 規則違反） */
  RestParameterNotLast = 'rest-parameter-not-last'
}

/**
 * Type Guards
 */
export function isAddParameterChange(change: SignatureChange): change is AddParameterChange {
  return change.type === SignatureChangeType.AddParameter;
}

export function isRemoveParameterChange(change: SignatureChange): change is RemoveParameterChange {
  return change.type === SignatureChangeType.RemoveParameter;
}

export function isReorderParametersChange(change: SignatureChange): change is ReorderParametersChange {
  return change.type === SignatureChangeType.ReorderParameters;
}

export function isChangeParameterTypeChange(change: SignatureChange): change is ChangeParameterTypeChange {
  return change.type === SignatureChangeType.ChangeParameterType;
}

export function isRenameParameterChange(change: SignatureChange): change is RenameParameterChange {
  return change.type === SignatureChangeType.RenameParameter;
}

export function isChangeDefaultValueChange(change: SignatureChange): change is ChangeDefaultValueChange {
  return change.type === SignatureChangeType.ChangeDefaultValue;
}

export function isToggleOptionalChange(change: SignatureChange): change is ToggleOptionalChange {
  return change.type === SignatureChangeType.ToggleOptional;
}
