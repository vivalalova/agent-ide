/**
 * 檢查路徑是否為絕對路徑
 * @param path 待檢查的路徑
 * @returns 是否為絕對路徑
 */
export declare function isAbsolute(path: string): boolean;
/**
 * 正規化路徑
 * @param path 待正規化的路徑
 * @returns 正規化後的路徑
 */
export declare function normalize(path: string): string;
/**
 * 計算從一個路徑到另一個路徑的相對路徑
 * @param from 起始路徑
 * @param to 目標路徑
 * @returns 相對路徑
 */
export declare function relative(from: string, to: string): string;
/**
 * 變更檔案的副檔名
 * @param filePath 檔案路徑
 * @param newExt 新的副檔名
 * @returns 變更副檔名後的路徑
 */
export declare function changeExtension(filePath: string, newExt: string): string;
/**
 * 確保檔案有指定的副檔名
 * @param filePath 檔案路徑
 * @param ext 期望的副檔名
 * @returns 確保有副檔名的路徑
 */
export declare function ensureExtension(filePath: string, ext: string): string;
/**
 * 取得檔名（不包含副檔名）
 * @param filePath 檔案路徑
 * @returns 不含副檔名的檔名
 */
export declare function getFileNameWithoutExt(filePath: string): string;
/**
 * 檢查一個路徑是否為另一個路徑的子路徑
 * @param parent 父路徑
 * @param child 子路徑
 * @returns 是否為子路徑
 */
export declare function isSubPath(parent: string, child: string): boolean;
/**
 * 將路徑轉換為 Unix 風格（使用正斜線）
 * @param path 待轉換的路徑
 * @returns Unix 風格的路徑
 */
export declare function toUnixPath(path: string): string;
/**
 * 將路徑轉換為 Windows 風格（使用反斜線）
 * @param path 待轉換的路徑
 * @returns Windows 風格的路徑
 */
export declare function toWindowsPath(path: string): string;
//# sourceMappingURL=path.d.ts.map