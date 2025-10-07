/**
 * 索引相關型別定義
 * 包含檔案索引、符號索引、查詢結果等型別
 */
/**
 * 更新操作類型
 */
export var UpdateOperation;
(function (UpdateOperation) {
    UpdateOperation["Add"] = "add";
    UpdateOperation["Update"] = "update";
    UpdateOperation["Delete"] = "delete";
})(UpdateOperation || (UpdateOperation = {}));
/**
 * 創建 FileInfo 的工廠函式
 */
export function createFileInfo(filePath, lastModified, size, extension, language, checksum) {
    if (!filePath.trim()) {
        throw new Error('檔案路徑不能為空');
    }
    if (size < 0) {
        throw new Error('檔案大小不能為負數');
    }
    return {
        filePath,
        lastModified,
        size,
        extension,
        language: language || undefined,
        checksum: checksum || ''
    };
}
/**
 * 創建 IndexConfig 的工廠函式
 */
export function createIndexConfig(workspacePath, options) {
    if (!workspacePath.trim()) {
        throw new Error('工作區路徑不能為空');
    }
    return {
        workspacePath,
        excludePatterns: options?.excludePatterns || ['node_modules/**', '.git/**', 'dist/**'],
        includeExtensions: options?.includeExtensions || ['.ts', '.js', '.tsx', '.jsx'],
        maxFileSize: options?.maxFileSize || 1024 * 1024, // 1MB
        enablePersistence: options?.enablePersistence || true,
        persistencePath: options?.persistencePath,
        maxConcurrency: options?.maxConcurrency || 4
    };
}
/**
 * 創建 SearchOptions 的工廠函式
 */
export function createSearchOptions(options) {
    return {
        caseSensitive: options?.caseSensitive || false,
        fuzzy: options?.fuzzy || true,
        maxResults: options?.maxResults || 100,
        includeFileInfo: options?.includeFileInfo || true
    };
}
/**
 * 檢查 FileInfo 型別守衛
 */
export function isFileInfo(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.filePath === 'string' &&
        obj.filePath.trim().length > 0 &&
        obj.lastModified instanceof Date &&
        typeof obj.size === 'number' &&
        obj.size >= 0 &&
        typeof obj.extension === 'string' &&
        (obj.language === undefined || typeof obj.language === 'string') &&
        typeof obj.checksum === 'string');
}
/**
 * 檢查 IndexConfig 型別守衛
 */
export function isIndexConfig(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.workspacePath === 'string' &&
        obj.workspacePath.trim().length > 0 &&
        Array.isArray(obj.excludePatterns) &&
        Array.isArray(obj.includeExtensions) &&
        typeof obj.maxFileSize === 'number' &&
        obj.maxFileSize > 0 &&
        typeof obj.enablePersistence === 'boolean' &&
        (obj.persistencePath === undefined || typeof obj.persistencePath === 'string') &&
        typeof obj.maxConcurrency === 'number' &&
        obj.maxConcurrency > 0);
}
/**
 * 計算索引進度百分比
 */
export function calculateProgress(processed, total) {
    if (total === 0) {
        return 100;
    }
    return Math.round((processed / total) * 100);
}
/**
 * 檢查檔案是否應該被索引（根據配置）
 */
export function shouldIndexFile(filePath, config) {
    // 檢查副檔名
    const extension = filePath.substring(filePath.lastIndexOf('.'));
    if (!config.includeExtensions.includes(extension)) {
        return false;
    }
    // 檢查排除模式
    for (const pattern of config.excludePatterns) {
        if (matchesPattern(filePath, pattern)) {
            return false;
        }
    }
    return true;
}
/**
 * 簡單的模式匹配（支援 ** 和 *）
 */
function matchesPattern(path, pattern) {
    // 簡化的 glob 模式匹配實現
    // 處理特殊情況：**/dirName/** 應該匹配任何層級的 dirName 目錄（但不匹配根目錄）
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
        const dirName = pattern.slice(3, -3); // 移除 **/ 和 /**
        const pathParts = path.split('/').filter(p => p.length > 0);
        // 檢查 dirName 是否出現在路徑中，但排除第一個部分（根目錄）
        return pathParts.slice(1).includes(dirName);
    }
    // 一般的 glob 模式處理
    const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
}
//# sourceMappingURL=types.js.map