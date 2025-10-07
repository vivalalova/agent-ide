/**
 * 重新命名引擎相關型別定義
 * 包含 RenameOptions、RenameResult、ValidationResult 等型別
 */
import { Location, Position, Range } from '../../shared/types/core.js';
import { Symbol } from '../../shared/types/symbol.js';
/**
 * 重新命名選項
 */
export interface RenameOptions {
    readonly symbol: Symbol;
    readonly newName: string;
    readonly filePaths: readonly string[];
    readonly position?: Position;
}
/**
 * 重新命名操作
 */
export interface RenameOperation {
    readonly filePath: string;
    readonly oldText: string;
    readonly newText: string;
    readonly range: Range;
}
/**
 * 重新命名結果
 */
export interface RenameResult {
    readonly success: boolean;
    readonly operations: readonly RenameOperation[];
    readonly affectedFiles: readonly string[];
    readonly renameId: string;
    readonly errors?: readonly string[];
}
/**
 * 批次重新命名結果
 */
export interface BatchRenameResult {
    readonly success: boolean;
    readonly results: readonly RenameResult[];
    readonly totalOperations: number;
    readonly errors?: readonly string[];
}
/**
 * 驗證結果
 */
export interface ValidationResult {
    readonly isValid: boolean;
    readonly conflicts: readonly ConflictInfo[];
    readonly warnings?: readonly string[];
    readonly errors?: readonly string[];
}
/**
 * 衝突資訊
 */
export interface ConflictInfo {
    readonly type: ConflictType;
    readonly message: string;
    readonly location: Location;
    readonly existingSymbol?: Symbol;
}
/**
 * 衝突類型
 */
export declare enum ConflictType {
    NameCollision = "name_collision",// 名稱衝突
    ScopeConflict = "scope_conflict",// 作用域衝突
    ReservedKeyword = "reserved_keyword",// 保留字衝突
    InvalidIdentifier = "invalid_identifier"
}
/**
 * 重新命名預覽
 */
export interface RenamePreview {
    readonly operations: readonly RenameOperation[];
    readonly affectedFiles: readonly string[];
    readonly conflicts: readonly ConflictInfo[];
    readonly summary: RenameSummary;
}
/**
 * 重新命名摘要
 */
export interface RenameSummary {
    readonly totalReferences: number;
    readonly totalFiles: number;
    readonly conflictCount: number;
    readonly estimatedTime: number;
}
/**
 * 建立 RenameOptions 的工廠函式
 */
export declare function createRenameOptions(symbol: Symbol, newName: string, filePaths: string[], position?: Position): RenameOptions;
/**
 * 建立 RenameOperation 的工廠函式
 */
export declare function createRenameOperation(filePath: string, oldText: string, newText: string, range: Range): RenameOperation;
/**
 * 建立 ConflictInfo 的工廠函式
 */
export declare function createConflictInfo(type: ConflictType, message: string, location: Location, existingSymbol?: Symbol): ConflictInfo;
/**
 * 作用域分析結果
 */
export interface ScopeAnalysisResult {
    readonly type: string;
    readonly name?: string;
    readonly parent?: ScopeAnalysisResult;
    readonly symbols: readonly Symbol[];
    readonly range: Range;
}
/**
 * 變數遮蔽資訊
 */
export interface ShadowedVariable {
    readonly name: string;
    readonly originalSymbol: Symbol;
    readonly shadowedBy: readonly ShadowInfo[];
}
/**
 * 遮蔽資訊
 */
export interface ShadowInfo {
    readonly symbol: Symbol;
    readonly scope: ScopeAnalysisResult;
}
/**
 * 引用更新結果
 */
export interface UpdateResult {
    readonly success: boolean;
    readonly updatedFiles: readonly UpdatedFile[];
    readonly errors?: readonly string[];
}
/**
 * 更新後的檔案
 */
export interface UpdatedFile {
    readonly filePath: string;
    readonly originalContent: string;
    readonly newContent: string;
    readonly changes: readonly TextChange[];
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
 * 符號引用
 */
export interface SymbolReference {
    readonly symbolName: string;
    readonly range: Range;
    readonly type: 'definition' | 'usage' | 'comment';
}
/**
 * RenameOptions 型別守衛
 */
export declare function isRenameOptions(value: unknown): value is RenameOptions;
//# sourceMappingURL=types.d.ts.map