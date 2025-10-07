/**
 * 重新命名引擎相關型別定義
 * 包含 RenameOptions、RenameResult、ValidationResult 等型別
 */
/**
 * 衝突類型
 */
export var ConflictType;
(function (ConflictType) {
    ConflictType["NameCollision"] = "name_collision";
    ConflictType["ScopeConflict"] = "scope_conflict";
    ConflictType["ReservedKeyword"] = "reserved_keyword";
    ConflictType["InvalidIdentifier"] = "invalid_identifier"; // 無效識別符
})(ConflictType || (ConflictType = {}));
/**
 * 建立 RenameOptions 的工廠函式
 */
export function createRenameOptions(symbol, newName, filePaths, position) {
    if (!newName.trim()) {
        throw new Error('新名稱不能為空');
    }
    if (filePaths.length === 0) {
        throw new Error('必須指定至少一個檔案路徑');
    }
    return {
        symbol,
        newName: newName.trim(),
        filePaths,
        position
    };
}
/**
 * 建立 RenameOperation 的工廠函式
 */
export function createRenameOperation(filePath, oldText, newText, range) {
    if (!filePath.trim()) {
        throw new Error('檔案路徑不能為空');
    }
    if (!oldText.trim()) {
        throw new Error('舊文字不能為空');
    }
    if (!newText.trim()) {
        throw new Error('新文字不能為空');
    }
    return {
        filePath,
        oldText,
        newText,
        range
    };
}
/**
 * 建立 ConflictInfo 的工廠函式
 */
export function createConflictInfo(type, message, location, existingSymbol) {
    if (!message.trim()) {
        throw new Error('衝突訊息不能為空');
    }
    return {
        type,
        message,
        location,
        existingSymbol
    };
}
/**
 * RenameOptions 型別守衛
 */
export function isRenameOptions(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return !!(obj.symbol && typeof obj.symbol === 'object' &&
        typeof obj.newName === 'string' &&
        obj.newName.trim().length > 0 &&
        Array.isArray(obj.filePaths) &&
        obj.filePaths.length > 0);
}
//# sourceMappingURL=types.js.map