/**
 * 核心型別定義
 * 包含 Position、Range、Location 等基礎型別
 */
/**
 * 建立 Position 的工廠函式
 */
export function createPosition(line, column, offset) {
    if (line < 1) {
        throw new Error('Line 必須大於等於 1');
    }
    if (column < 1) {
        throw new Error('Column 必須大於等於 1');
    }
    if (offset !== undefined && offset < 0) {
        throw new Error('Offset 必須大於等於 0');
    }
    return {
        line,
        column,
        offset: offset !== undefined ? offset : undefined
    };
}
/**
 * 建立 Range 的工廠函式
 */
export function createRange(start, end) {
    if (isPositionAfter(start, end)) {
        throw new Error('Range 的 start 不能在 end 之後');
    }
    return {
        start,
        end
    };
}
/**
 * 建立 Location 的工廠函式
 */
export function createLocation(filePath, range) {
    if (!filePath.trim()) {
        throw new Error('檔案路徑不能為空');
    }
    return {
        filePath,
        range
    };
}
/**
 * Position 型別守衛
 */
export function isPosition(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.line === 'number' &&
        obj.line >= 1 &&
        typeof obj.column === 'number' &&
        obj.column >= 1 &&
        (obj.offset === undefined || (typeof obj.offset === 'number' && obj.offset >= 0)));
}
/**
 * Range 型別守衛
 */
export function isRange(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (isPosition(obj.start) &&
        isPosition(obj.end) &&
        !isPositionAfter(obj.start, obj.end));
}
/**
 * Location 型別守衛
 */
export function isLocation(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value;
    return (typeof obj.filePath === 'string' &&
        obj.filePath.trim().length > 0 &&
        isRange(obj.range));
}
/**
 * 比較兩個 Position 的先後順序
 * @param pos1 第一個位置
 * @param pos2 第二個位置
 * @returns pos1 是否在 pos2 之前
 */
export function isPositionBefore(pos1, pos2) {
    if (pos1.line !== pos2.line) {
        return pos1.line < pos2.line;
    }
    return pos1.column < pos2.column;
}
/**
 * 檢查 pos1 是否在 pos2 之後
 */
function isPositionAfter(pos1, pos2) {
    return isPositionBefore(pos2, pos1);
}
/**
 * 檢查 Position 是否在 Range 範圍內（包含邊界）
 * @param position 要檢查的位置
 * @param range 範圍
 * @returns 是否在範圍內
 */
export function isPositionInRange(position, range) {
    return (!isPositionBefore(position, range.start) &&
        !isPositionAfter(position, range.end));
}
//# sourceMappingURL=core.js.map