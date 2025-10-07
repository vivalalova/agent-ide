/**
 * 深度複製物件
 * @param obj 待複製的物件
 * @param visited 已訪問的物件（用於處理循環引用）
 * @returns 深度複製後的物件
 */
export function deepClone(obj, visited = new WeakMap()) {
    // 處理基本型別
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    // 處理循環引用
    if (visited.has(obj)) {
        return visited.get(obj);
    }
    // 處理日期
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    // 處理正則表達式
    if (obj instanceof RegExp) {
        return new RegExp(obj.source, obj.flags);
    }
    // 處理陣列
    if (Array.isArray(obj)) {
        const clonedArray = [];
        visited.set(obj, clonedArray);
        for (let i = 0; i < obj.length; i++) {
            clonedArray[i] = deepClone(obj[i], visited);
        }
        return clonedArray;
    }
    // 處理物件
    const clonedObj = {};
    visited.set(obj, clonedObj);
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            clonedObj[key] = deepClone(obj[key], visited);
        }
    }
    return clonedObj;
}
/**
 * 深度合併多個物件
 * @param target 目標物件
 * @param sources 來源物件
 * @returns 合併後的物件
 */
export function deepMerge(target, ...sources) {
    if (!sources.length) {
        return target;
    }
    const result = deepClone(target);
    for (const source of sources) {
        mergeObjects(result, source);
    }
    return result;
}
/**
 * 輔助函式：合併兩個物件
 */
function mergeObjects(target, source) {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = target[key];
            if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
                mergeObjects(targetValue, sourceValue);
            }
            else {
                target[key] = deepClone(sourceValue);
            }
        }
    }
}
/**
 * 檢查是否為純物件
 */
function isPlainObject(obj) {
    return obj !== null &&
        typeof obj === 'object' &&
        !Array.isArray(obj) &&
        !(obj instanceof Date) &&
        !(obj instanceof RegExp);
}
/**
 * 選取物件的指定屬性
 * @param obj 來源物件
 * @param keys 要選取的屬性鍵值
 * @returns 包含指定屬性的新物件
 */
export function pick(obj, keys) {
    const result = {};
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    return result;
}
/**
 * 排除物件的指定屬性
 * @param obj 來源物件
 * @param keys 要排除的屬性鍵值
 * @returns 排除指定屬性後的新物件
 */
export function omit(obj, keys) {
    const result = { ...obj };
    const keySet = new Set(keys);
    for (const key in result) {
        if (keySet.has(key)) {
            delete result[key];
        }
    }
    return result;
}
/**
 * 檢查值是否為空
 * @param value 待檢查的值
 * @returns 是否為空
 */
export function isEmpty(value) {
    if (value == null) {
        return true;
    }
    if (typeof value === 'string' || Array.isArray(value)) {
        return value.length === 0;
    }
    if (value instanceof Map || value instanceof Set) {
        return value.size === 0;
    }
    if (typeof value === 'object') {
        return Object.keys(value).length === 0;
    }
    return false;
}
/**
 * 深度比較兩個值是否相等
 * @param a 第一個值
 * @param b 第二個值
 * @returns 是否相等
 */
export function isEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (a == null || b == null) {
        return a === b;
    }
    if (typeof a !== typeof b) {
        return false;
    }
    // 處理日期
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    // 處理正則表達式
    if (a instanceof RegExp && b instanceof RegExp) {
        return a.source === b.source && a.flags === b.flags;
    }
    // 處理陣列
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            if (!isEqual(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    // 處理物件
    if (typeof a === 'object' && typeof b === 'object') {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) {
            return false;
        }
        for (const key of keysA) {
            if (!keysB.includes(key)) {
                return false;
            }
            if (!isEqual(a[key], b[key])) {
                return false;
            }
        }
        return true;
    }
    return false;
}
/**
 * 設定物件的深層屬性
 * @param obj 目標物件
 * @param path 屬性路徑（支援點記法和陣列索引）
 * @param value 要設定的值
 */
export function set(obj, path, value) {
    if (!path) {
        return;
    }
    const keys = parsePath(path);
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        const nextKey = keys[i + 1];
        if (!(key in current) || current[key] == null) {
            // 如果下一個鍵是數字，建立陣列，否則建立物件
            current[key] = /^\d+$/.test(nextKey) ? [] : {};
        }
        current = current[key];
    }
    if (keys.length > 0) {
        current[keys[keys.length - 1]] = value;
    }
}
/**
 * 取得物件的深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @param defaultValue 預設值
 * @returns 屬性值或預設值
 */
export function get(obj, path, defaultValue) {
    if (!path) {
        return obj;
    }
    const keys = parsePath(path);
    let current = obj;
    for (const key of keys) {
        if (current == null || !(key in current)) {
            return defaultValue;
        }
        current = current[key];
    }
    return current;
}
/**
 * 檢查物件是否有深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @returns 是否存在該屬性
 */
export function has(obj, path) {
    if (!path) {
        return false;
    }
    const keys = parsePath(path);
    let current = obj;
    for (const key of keys) {
        if (current == null || !(key in current)) {
            return false;
        }
        current = current[key];
    }
    return true;
}
/**
 * 解析屬性路徑
 * @param path 路徑字串
 * @returns 路徑陣列
 */
function parsePath(path) {
    return path
        .replace(/\[(\d+)\]/g, '.$1') // 將 [0] 轉換為 .0
        .split('.')
        .filter(key => key !== '');
}
/**
 * 映射物件的值
 * @param obj 來源物件
 * @param mapper 映射函式
 * @returns 映射後的新物件
 */
export function mapValues(obj, mapper) {
    const result = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            result[key] = mapper(obj[key], key);
        }
    }
    return result;
}
//# sourceMappingURL=object.js.map