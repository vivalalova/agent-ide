/**
 * Move 模組的核心型別定義
 */

import { Position, Range } from '@shared/types/core.js';

/**
 * 移動操作的型別
 */
export enum MoveOperationType {
  FILE = 'file',
  DIRECTORY = 'directory'
}

/**
 * 移動操作的狀態
 */
export enum MoveStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back'
}

/**
 * 路徑型別
 */
export enum PathType {
  RELATIVE = 'relative',
  ABSOLUTE = 'absolute',
  ALIAS = 'alias'
}

/**
 * 路徑衝突類型
 */
export enum PathConflictType {
  FILE_EXISTS = 'file_exists',
  DIRECTORY_EXISTS = 'directory_exists',
  PERMISSION_DENIED = 'permission_denied'
}

/**
 * 驗證錯誤類型
 */
export enum ValidationErrorType {
  SOURCE_NOT_FOUND = 'source_not_found',
  DESTINATION_EXISTS = 'destination_exists',
  PERMISSION_DENIED = 'permission_denied',
  INVALID_PATH = 'invalid_path'
}

/**
 * 驗證警告類型
 */
export enum ValidationWarningType {
  MANY_FILES_AFFECTED = 'many_files_affected',
  POTENTIAL_BREAKING_CHANGE = 'potential_breaking_change',
  EXTERNAL_DEPENDENCY = 'external_dependency'
}

/**
 * 移動錯誤類型
 */
export enum MoveErrorType {
  FILE_SYSTEM = 'file_system',
  IMPORT_UPDATE = 'import_update',
  VALIDATION = 'validation',
  ROLLBACK = 'rollback'
}

/**
 * 回滾操作類型
 */
export enum RollbackOperationType {
  MOVE_FILE = 'move_file',
  RESTORE_CONTENT = 'restore_content',
  REVERT_IMPORT = 'revert_import'
}

/**
 * Import 語句類型
 */
export enum ImportStatementType {
  IMPORT = 'import',
  REQUIRE = 'require',
  DYNAMIC_IMPORT = 'dynamic_import',
  EXPORT = 'export'
}

/**
 * 移動進度階段
 */
export enum MoveStage {
  VALIDATION = 'validation',
  PREPARATION = 'preparation',
  MOVING = 'moving',
  UPDATING_IMPORTS = 'updating_imports',
  CLEANUP = 'cleanup'
}

/**
 * 內部移動操作定義 - 給內部引擎使用
 * 包含完整的操作資訊（id、timestamp 等）
 */
export interface InternalMoveOperation {
  readonly id: string;
  readonly type: MoveOperationType;
  readonly source: string;
  readonly destination: string;
  readonly timestamp: Date;
}

/**
 * 批次移動結果（使用簡化的 MoveResult）
 */
export interface BatchMoveResult {
  readonly batchId: string;
  readonly operations: readonly MoveResult[];
  readonly totalAffectedFiles: number;
  readonly totalUpdatedImports: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly errors?: readonly MoveError[];
}

/**
 * 移動預覽
 */
export interface MovePreview {
  readonly operation: InternalMoveOperation;
  readonly impact: MoveImpact;
  readonly conflicts: readonly PathConflict[];
  readonly affectedFiles: readonly string[];
  readonly importUpdates: readonly ImportUpdatePreview[];
}

/**
 * 移動影響分析
 */
export interface MoveImpact {
  readonly filesAffected: number;
  readonly importsToUpdate: number;
  readonly potentialBreaking: boolean;
  readonly estimatedTime: number; // 預估執行時間（毫秒）
}

/**
 * 路徑衝突
 */
export interface PathConflict {
  readonly type: PathConflictType;
  readonly path: string;
  readonly description: string;
}

/**
 * Import 更新
 */
export interface ImportUpdate {
  readonly filePath: string;
  readonly line: number;
  readonly oldImport: string;
  readonly newImport: string;
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Import 更新預覽
 */
export interface ImportUpdatePreview {
  readonly filePath: string;
  readonly line: number;
  readonly oldImport: string;
  readonly newImport: string;
}

/**
 * 驗證結果
 */
export interface ValidationResult {
  readonly isValid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
}

/**
 * 驗證錯誤
 */
export interface ValidationError {
  readonly type: ValidationErrorType;
  readonly message: string;
  readonly path?: string;
}

/**
 * 驗證警告
 */
export interface ValidationWarning {
  readonly type: ValidationWarningType;
  readonly message: string;
  readonly details?: unknown;
}

/**
 * 移動錯誤
 */
export interface MoveError {
  readonly type: MoveErrorType;
  readonly message: string;
  readonly filePath?: string;
  readonly originalError?: Error;
}

/**
 * 回滾資訊
 */
export interface RollbackInfo {
  readonly canRollback: boolean;
  readonly operations: readonly RollbackOperation[];
  readonly createdAt: Date;
}

/**
 * 回滾操作
 */
export interface RollbackOperation {
  readonly type: RollbackOperationType;
  readonly source: string;
  readonly destination: string;
  readonly originalContent?: string;
}

/**
 * Import 語句的解析結果
 */
export interface ImportStatement {
  readonly type: ImportStatementType;
  readonly path: string;
  readonly pathType: PathType;
  readonly position: Position;
  readonly range: Range;
  readonly isRelative: boolean;
  readonly importedSymbols?: readonly string[];
  readonly rawStatement: string;
}

/**
 * 路徑更新的配置
 */
export interface PathUpdateConfig {
  readonly preserveFileExtension: boolean;
  readonly updateTsConfig: boolean;
  readonly updatePackageJson: boolean;
  readonly handlePathAliases: boolean;
  readonly maxConcurrentUpdates: number;
}

/**
 * 移動引擎配置
 */
export interface MoveEngineConfig {
  readonly dryRun: boolean;
  readonly createBackup: boolean;
  readonly pathUpdate: PathUpdateConfig;
  readonly progressCallback?: (progress: MoveProgress) => void;
}

/**
 * 移動進度
 */
export interface MoveProgress {
  readonly operationId: string;
  readonly stage: MoveStage;
  readonly progress: number; // 0-100
  readonly currentFile?: string;
  readonly message?: string;
}

/**
 * 路徑計算結果
 */
export interface PathCalculation {
  readonly originalPath: string;
  readonly newPath: string;
  readonly pathType: PathType;
  readonly isValid: boolean;
  readonly error?: string;
}

/**
 * Import 解析配置
 */
export interface ImportResolverConfig {
  readonly supportedExtensions: readonly string[];
  readonly pathAliases: Record<string, string>;
  readonly baseUrl?: string;
  readonly includeNodeModules?: boolean;
}

/**
 * 移動操作輸入 - 給 MoveEngine 公開方法使用
 * 只包含必要的來源/目標路徑
 */
export interface MoveInput {
  readonly source: string;
  readonly target: string;
  readonly updateImports?: boolean;
}

/**
 * 批次移動資訊
 * 用於 glob 移動時識別同時被移動的檔案
 */
export interface BatchMoveInfo {
  /** 所有被移動檔案的 source → target 映射 */
  readonly allMovedFiles: Map<string, string>;
}

/**
 * 移動選項
 */
export interface MoveOptions {
  readonly preview?: boolean;
  readonly projectRoot?: string;
  /** 批次移動資訊（glob 模式使用） */
  readonly batchMoveInfo?: BatchMoveInfo;
}

/**
 * 移動結果
 */
export interface MoveResult {
  readonly success: boolean;
  readonly source: string;
  readonly target: string;
  readonly moved: boolean;
  readonly pathUpdates: PathUpdate[];
  readonly error?: string;
  readonly message: string;
}

/**
 * 路徑更新
 */
export interface PathUpdate {
  readonly filePath: string;
  readonly line: number;
  readonly oldImport: string;
  readonly newImport: string;
}

/**
 * 建立 InternalMoveOperation 的工廠函式
 */
export function createInternalMoveOperation(
  type: MoveOperationType,
  source: string,
  destination: string
): InternalMoveOperation {
  return {
    id: generateId(),
    type,
    source,
    destination,
    timestamp: new Date()
  };
}

/**
 * 建立 ValidationError 的工廠函式
 */
export function createValidationError(
  type: ValidationErrorType,
  message: string,
  path?: string
): ValidationError {
  return {
    type,
    message,
    path
  };
}

/**
 * 建立 MoveError 的工廠函式
 */
export function createMoveError(
  type: MoveErrorType,
  message: string,
  filePath?: string,
  originalError?: Error
): MoveError {
  return {
    type,
    message,
    filePath,
    originalError
  };
}

/**
 * 產生唯一 ID
 */
function generateId(): string {
  return `move_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 型別守衛 - 檢查是否為 InternalMoveOperation
 */
export function isInternalMoveOperation(value: unknown): value is InternalMoveOperation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    typeof obj.id === 'string' &&
    Object.values(MoveOperationType).includes(obj.type as MoveOperationType) &&
    typeof obj.source === 'string' &&
    typeof obj.destination === 'string' &&
    obj.timestamp instanceof Date
  );
}

/**
 * 型別守衛 - 檢查是否為 ImportStatement
 */
export function isImportStatement(value: unknown): value is ImportStatement {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  return (
    Object.values(ImportStatementType).includes(obj.type as ImportStatementType) &&
    typeof obj.path === 'string' &&
    Object.values(PathType).includes(obj.pathType as PathType) &&
    typeof obj.position === 'object' &&
    typeof obj.range === 'object' &&
    typeof obj.isRelative === 'boolean' &&
    typeof obj.rawStatement === 'string'
  );
}