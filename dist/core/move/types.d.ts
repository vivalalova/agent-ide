/**
 * Move 模組的核心型別定義
 */
import { Position, Range } from '../../shared/types/core.js';
/**
 * 移動操作的型別
 */
export declare enum MoveOperationType {
    FILE = "file",
    DIRECTORY = "directory"
}
/**
 * 移動操作的狀態
 */
export declare enum MoveStatus {
    PENDING = "pending",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    FAILED = "failed",
    ROLLED_BACK = "rolled_back"
}
/**
 * 路徑型別
 */
export declare enum PathType {
    RELATIVE = "relative",
    ABSOLUTE = "absolute",
    ALIAS = "alias"
}
/**
 * 完整的移動操作定義 - 給內部引擎使用
 */
export interface FullMoveOperation {
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
    readonly operation: FullMoveOperation;
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
    readonly estimatedTime: number;
}
/**
 * 路徑衝突
 */
export interface PathConflict {
    readonly type: 'file_exists' | 'directory_exists' | 'permission_denied';
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
    readonly type: 'source_not_found' | 'destination_exists' | 'permission_denied' | 'invalid_path';
    readonly message: string;
    readonly path?: string;
}
/**
 * 驗證警告
 */
export interface ValidationWarning {
    readonly type: 'many_files_affected' | 'potential_breaking_change' | 'external_dependency';
    readonly message: string;
    readonly details?: unknown;
}
/**
 * 移動錯誤
 */
export interface MoveError {
    readonly type: 'file_system' | 'import_update' | 'validation' | 'rollback';
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
    readonly type: 'move_file' | 'restore_content' | 'revert_import';
    readonly source: string;
    readonly destination: string;
    readonly originalContent?: string;
}
/**
 * Import 語句的解析結果
 */
export interface ImportStatement {
    readonly type: 'import' | 'require' | 'dynamic_import';
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
    readonly stage: 'validation' | 'preparation' | 'moving' | 'updating_imports' | 'cleanup';
    readonly progress: number;
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
 * 簡化的移動操作 - 給 MoveService 使用
 */
export interface MoveOperation {
    readonly source: string;
    readonly target: string;
    readonly updateImports?: boolean;
}
/**
 * 移動選項
 */
export interface MoveOptions {
    readonly preview?: boolean;
    readonly projectRoot?: string;
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
 * 建立完整 MoveOperation 的工廠函式
 */
export declare function createFullMoveOperation(type: MoveOperationType, source: string, destination: string): FullMoveOperation;
/**
 * 建立 ValidationError 的工廠函式
 */
export declare function createValidationError(type: ValidationError['type'], message: string, path?: string): ValidationError;
/**
 * 建立 MoveError 的工廠函式
 */
export declare function createMoveError(type: MoveError['type'], message: string, filePath?: string, originalError?: Error): MoveError;
/**
 * 型別守衛 - 檢查是否為完整的 MoveOperation
 */
export declare function isFullMoveOperation(value: unknown): value is FullMoveOperation;
/**
 * 型別守衛 - 檢查是否為 ImportStatement
 */
export declare function isImportStatement(value: unknown): value is ImportStatement;
//# sourceMappingURL=types.d.ts.map