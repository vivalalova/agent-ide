/**
 * Move 模組的核心型別定義
 */
/**
 * 移動操作的型別
 */
export var MoveOperationType;
(function (MoveOperationType) {
    MoveOperationType["FILE"] = "file";
    MoveOperationType["DIRECTORY"] = "directory";
})(MoveOperationType || (MoveOperationType = {}));
/**
 * 移動操作的狀態
 */
export var MoveStatus;
(function (MoveStatus) {
    MoveStatus["PENDING"] = "pending";
    MoveStatus["IN_PROGRESS"] = "in_progress";
    MoveStatus["COMPLETED"] = "completed";
    MoveStatus["FAILED"] = "failed";
    MoveStatus["ROLLED_BACK"] = "rolled_back";
})(MoveStatus || (MoveStatus = {}));
/**
 * 路徑型別
 */
export var PathType;
(function (PathType) {
    PathType["RELATIVE"] = "relative";
    PathType["ABSOLUTE"] = "absolute";
    PathType["ALIAS"] = "alias";
})(PathType || (PathType = {}));
/**
 * 建立完整 MoveOperation 的工廠函式
 */
export function createFullMoveOperation(type, source, destination) {
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
export function createValidationError(type, message, path) {
    return {
        type,
        message,
        path
    };
}
/**
 * 建立 MoveError 的工廠函式
 */
export function createMoveError(type, message, filePath, originalError) {
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
function generateId() {
    return `move_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * 型別守衛 - 檢查是否為完整的 MoveOperation
 */
export function isFullMoveOperation(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.id === 'string' &&
        Object.values(MoveOperationType).includes(obj.type) &&
        typeof obj.source === 'string' &&
        typeof obj.destination === 'string' &&
        obj.timestamp instanceof Date);
}
/**
 * 型別守衛 - 檢查是否為 ImportStatement
 */
export function isImportStatement(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (['import', 'require', 'dynamic_import'].includes(obj.type) &&
        typeof obj.path === 'string' &&
        Object.values(PathType).includes(obj.pathType) &&
        typeof obj.position === 'object' &&
        typeof obj.range === 'object' &&
        typeof obj.isRelative === 'boolean' &&
        typeof obj.rawStatement === 'string');
}
//# sourceMappingURL=types.js.map