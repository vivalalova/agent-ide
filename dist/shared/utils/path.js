/**
 * 檢查路徑是否為絕對路徑
 * @param path 待檢查的路徑
 * @returns 是否為絕對路徑
 */
export function isAbsolute(path) {
    if (!path) {
        return false;
    }
    // Unix 絕對路徑以 / 開頭
    if (path.startsWith('/')) {
        return true;
    }
    // Windows 絕對路徑以磁碟機代號開頭，如 C:\
    if (/^[A-Za-z]:[\/\\]/.test(path)) {
        return true;
    }
    return false;
}
/**
 * 正規化路徑
 * @param path 待正規化的路徑
 * @returns 正規化後的路徑
 */
export function normalize(path) {
    if (!path) {
        return '';
    }
    // 將所有反斜線替換為正斜線
    let normalizedPath = path.replace(/\\/g, '/');
    // 處理多個連續的斜線
    normalizedPath = normalizedPath.replace(/\/+/g, '/');
    // 分割路徑並處理 . 和 ..
    const parts = normalizedPath.split('/');
    const stack = [];
    for (const part of parts) {
        if (part === '' && stack.length === 0) {
            // 保留根目錄的空字串
            stack.push('');
        }
        else if (part === '..') {
            // 回到上層目錄
            if (stack.length > 0 && stack[stack.length - 1] !== '..') {
                if (stack.length === 1 && stack[0] === '') {
                    // 不能回到根目錄之上
                    continue;
                }
                stack.pop();
            }
            else if (!isAbsolute(path)) {
                // 相對路徑可以有 ..
                stack.push('..');
            }
        }
        else if (part !== '.' && part !== '') {
            // 忽略 . 和空字串（除了根目錄）
            stack.push(part);
        }
    }
    const result = stack.join('/');
    // 處理相對路徑的特殊情況
    if (!isAbsolute(path) && !result) {
        return '.';
    }
    return result || '/';
}
/**
 * 計算從一個路徑到另一個路徑的相對路徑
 * @param from 起始路徑
 * @param to 目標路徑
 * @returns 相對路徑
 */
export function relative(from, to) {
    const normalizedFrom = normalize(from);
    const normalizedTo = normalize(to);
    if (normalizedFrom === normalizedTo) {
        return '.';
    }
    const fromParts = normalizedFrom.split('/').filter(part => part !== '');
    const toParts = normalizedTo.split('/').filter(part => part !== '');
    // 找到共同的前綴
    let commonLength = 0;
    while (commonLength < fromParts.length &&
        commonLength < toParts.length &&
        fromParts[commonLength] === toParts[commonLength]) {
        commonLength++;
    }
    // 計算需要回到上層的次數
    const upCount = fromParts.length - commonLength;
    // 建立相對路徑
    const upParts = new Array(upCount).fill('..');
    const downParts = toParts.slice(commonLength);
    const result = [...upParts, ...downParts].join('/');
    return result || '.';
}
/**
 * 變更檔案的副檔名
 * @param filePath 檔案路徑
 * @param newExt 新的副檔名
 * @returns 變更副檔名後的路徑
 */
export function changeExtension(filePath, newExt) {
    if (!filePath) {
        return '';
    }
    const lastDotIndex = filePath.lastIndexOf('.');
    const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    // 如果點號在最後一個斜線之前，表示沒有副檔名
    if (lastDotIndex <= lastSlashIndex) {
        return filePath + newExt;
    }
    return filePath.slice(0, lastDotIndex) + newExt;
}
/**
 * 確保檔案有指定的副檔名
 * @param filePath 檔案路徑
 * @param ext 期望的副檔名
 * @returns 確保有副檔名的路徑
 */
export function ensureExtension(filePath, ext) {
    if (!filePath) {
        return '';
    }
    const lastDotIndex = filePath.lastIndexOf('.');
    const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    // 如果沒有副檔名，添加指定的副檔名
    if (lastDotIndex <= lastSlashIndex) {
        return filePath + ext;
    }
    // 如果已經有副檔名，保持不變
    return filePath;
}
/**
 * 取得檔名（不包含副檔名）
 * @param filePath 檔案路徑
 * @returns 不含副檔名的檔名
 */
export function getFileNameWithoutExt(filePath) {
    if (!filePath) {
        return '';
    }
    // 取得檔名部分
    const lastSlashIndex = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    const fileName = filePath.slice(lastSlashIndex + 1);
    // 處理隱藏檔案（以點號開頭）
    if (fileName.startsWith('.')) {
        const dotIndex = fileName.indexOf('.', 1);
        if (dotIndex === -1) {
            return fileName; // 純隱藏檔案，如 .gitignore
        }
        return fileName.slice(0, dotIndex);
    }
    // 處理一般檔案
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
        return fileName;
    }
    return fileName.slice(0, lastDotIndex);
}
/**
 * 檢查一個路徑是否為另一個路徑的子路徑
 * @param parent 父路徑
 * @param child 子路徑
 * @returns 是否為子路徑
 */
export function isSubPath(parent, child) {
    if (!parent || !child) {
        return false;
    }
    const normalizedParent = normalize(parent);
    const normalizedChild = normalize(child);
    if (normalizedParent === normalizedChild) {
        return true;
    }
    // 確保父路徑以斜線結尾，避免 /src 匹配 /source
    const parentWithSlash = normalizedParent.endsWith('/') ? normalizedParent : normalizedParent + '/';
    return normalizedChild.startsWith(parentWithSlash);
}
/**
 * 將路徑轉換為 Unix 風格（使用正斜線）
 * @param path 待轉換的路徑
 * @returns Unix 風格的路徑
 */
export function toUnixPath(path) {
    if (!path) {
        return '';
    }
    return path.replace(/\\/g, '/');
}
/**
 * 將路徑轉換為 Windows 風格（使用反斜線）
 * @param path 待轉換的路徑
 * @returns Windows 風格的路徑
 */
export function toWindowsPath(path) {
    if (!path) {
        return '';
    }
    return path.replace(/\//g, '\\');
}
//# sourceMappingURL=path.js.map