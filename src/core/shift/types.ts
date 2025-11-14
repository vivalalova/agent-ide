/**
 * Shift 模組的核心型別定義
 */

/**
 * 行移動操作狀態
 */
export enum ShiftStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * 行移動操作類型
 */
export enum ShiftOperationType {
  WITHIN_FILE = 'within_file',
  BETWEEN_FILES = 'between_files',
  TO_NEW_FILE = 'to_new_file'
}

/**
 * 行移動選項
 */
export interface ShiftOptions {
  /**
   * 來源檔案路徑
   */
  readonly sourceFile: string;

  /**
   * 起始行號（1-based）
   */
  readonly fromLine: number;

  /**
   * 結束行號（1-based，包含）
   */
  readonly toLine: number;

  /**
   * 目標檔案路徑（選填，預設為來源檔案）
   */
  readonly targetFile?: string;

  /**
   * 目標位置行號（1-based，插入到此行之前）
   */
  readonly position: number;

  /**
   * 是否為預覽模式（不實際寫入）
   */
  readonly preview?: boolean;

  /**
   * 專案根目錄路徑
   */
  readonly projectRoot?: string;

  /**
   * 是否自動更新引用（預設為 true）
   */
  readonly updateReferences?: boolean;
}

/**
 * 行移動結果
 */
export interface ShiftResult {
  /**
   * 操作是否成功
   */
  readonly success: boolean;

  /**
   * 操作類型
   */
  readonly operationType: ShiftOperationType;

  /**
   * 來源檔案路徑
   */
  readonly sourceFile: string;

  /**
   * 目標檔案路徑
   */
  readonly targetFile: string;

  /**
   * 移動的起始行號
   */
  readonly fromLine: number;

  /**
   * 移動的結束行號
   */
  readonly toLine: number;

  /**
   * 插入的目標位置
   */
  readonly position: number;

  /**
   * 移動的行數
   */
  readonly linesCount: number;

  /**
   * 是否實際執行了移動（預覽模式為 false）
   */
  readonly executed: boolean;

  /**
   * 結果訊息
   */
  readonly message: string;

  /**
   * 錯誤訊息（如果失敗）
   */
  readonly error?: string;

  /**
   * 移動的行內容（預覽模式下）
   */
  readonly movedLines?: readonly string[];

  /**
   * 來源檔案的新內容（預覽模式下）
   */
  readonly sourceContent?: string;

  /**
   * 目標檔案的新內容（預覽模式下）
   */
  readonly targetContent?: string;

  /**
   * 是否已更新引用
   */
  readonly referencesUpdated?: boolean;

  /**
   * 更新的引用資訊
   */
  readonly updatedReferences?: readonly string[];
}

/**
 * 檔案生成結果
 */
export interface FileGenerationResult {
  /**
   * 生成的檔案路徑
   */
  readonly filePath: string;

  /**
   * 是否為新建檔案
   */
  readonly isNew: boolean;

  /**
   * 是否發生了檔名衝突
   */
  readonly hasConflict: boolean;

  /**
   * 原始檔名（衝突前）
   */
  readonly originalName?: string;
}

/**
 * 行提取結果
 */
export interface LineExtractionResult {
  /**
   * 提取的行內容
   */
  readonly extractedLines: readonly string[];

  /**
   * 移除指定行後的內容
   */
  readonly remainingContent: string;

  /**
   * 提取的行數
   */
  readonly linesCount: number;
}

/**
 * 行插入結果
 */
export interface LineInsertionResult {
  /**
   * 插入行後的完整內容
   */
  readonly content: string;

  /**
   * 插入的位置（實際插入的行號）
   */
  readonly insertedAt: number;

  /**
   * 插入的行數
   */
  readonly linesCount: number;
}

/**
 * Shift 操作驗證錯誤
 */
export interface ShiftValidationError {
  readonly type: 'source_not_found' | 'invalid_line_range' | 'invalid_position' | 'permission_denied';
  readonly message: string;
  readonly filePath?: string;
  readonly lineNumber?: number;
}

/**
 * 建立 ShiftResult 的工廠函式
 */
export function createShiftResult(
  success: boolean,
  operationType: ShiftOperationType,
  options: ShiftOptions,
  message: string,
  additionalData?: Partial<ShiftResult>
): ShiftResult {
  const targetFile = options.targetFile || options.sourceFile;
  const linesCount = options.toLine - options.fromLine + 1;

  return {
    success,
    operationType,
    sourceFile: options.sourceFile,
    targetFile,
    fromLine: options.fromLine,
    toLine: options.toLine,
    position: options.position,
    linesCount,
    executed: !options.preview,
    message,
    ...additionalData
  };
}

/**
 * 建立 ShiftValidationError 的工廠函式
 */
export function createShiftValidationError(
  type: ShiftValidationError['type'],
  message: string,
  filePath?: string,
  lineNumber?: number
): ShiftValidationError {
  return {
    type,
    message,
    filePath,
    lineNumber
  };
}

/**
 * 型別守衛 - 檢查是否為有效的 ShiftOptions
 */
export function isValidShiftOptions(value: unknown): value is ShiftOptions {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.sourceFile === 'string' &&
    typeof obj.fromLine === 'number' &&
    typeof obj.toLine === 'number' &&
    typeof obj.position === 'number' &&
    obj.fromLine > 0 &&
    obj.toLine >= obj.fromLine &&
    obj.position > 0
  );
}

/**
 * 型別守衛 - 檢查是否為有效的 ShiftResult
 */
export function isValidShiftResult(value: unknown): value is ShiftResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.success === 'boolean' &&
    Object.values(ShiftOperationType).includes(obj.operationType as ShiftOperationType) &&
    typeof obj.sourceFile === 'string' &&
    typeof obj.targetFile === 'string' &&
    typeof obj.fromLine === 'number' &&
    typeof obj.toLine === 'number' &&
    typeof obj.position === 'number' &&
    typeof obj.linesCount === 'number' &&
    typeof obj.executed === 'boolean' &&
    typeof obj.message === 'string'
  );
}
