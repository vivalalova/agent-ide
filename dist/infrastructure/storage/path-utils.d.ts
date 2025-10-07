import { PathInfo } from './types.js';
/**
 * 路徑工具類別
 * 提供跨平台的路徑處理功能
 */
export declare class PathUtils {
    /**
     * 正規化路徑
     */
    static normalize(filePath: string): string;
    /**
     * 解析為絕對路徑
     */
    static resolve(...segments: string[]): string;
    /**
     * 組合路徑片段
     */
    static join(...segments: string[]): string;
    /**
     * 計算相對路徑
     */
    static relative(from: string, to: string): string;
    /**
     * 檢查是否為絕對路徑
     */
    static isAbsolute(filePath: string): boolean;
    /**
     * 獲取目錄名
     */
    static dirname(filePath: string): string;
    /**
     * 獲取基礎檔名
     */
    static basename(filePath: string, ext?: string): string;
    /**
     * 獲取副檔名
     */
    static extname(filePath: string): string;
    /**
     * 解析路徑為組件
     */
    static parse(filePath: string): PathInfo;
    /**
     * 從組件格式化路徑
     */
    static format(pathObj: Partial<PathInfo>): string;
    /**
     * 檢查是否為子路徑
     */
    static isSubPath(parent: string, child: string): boolean;
    /**
     * 找到路徑的共同前綴
     */
    static getCommonPath(paths: string[]): string;
    /**
     * 確保檔案有指定副檔名
     */
    static ensureExtension(filePath: string, extension: string): string;
    /**
     * 變更檔案副檔名
     */
    static changeExtension(filePath: string, newExtension: string): string;
    /**
     * 移除檔案副檔名
     */
    static removeExtension(filePath: string): string;
    /**
     * 轉換為 Unix 風格路徑
     */
    static toUnix(filePath: string): string;
    /**
     * 轉換為 POSIX 路徑
     */
    static toPosix(filePath: string): string;
    /**
     * 驗證路徑是否有效
     */
    static isValidPath(filePath: string): boolean;
    /**
     * 獲取路徑深度
     */
    static getDepth(filePath: string): number;
    /**
     * 檢查兩個路徑是否相等
     */
    static equals(path1: string, path2: string): boolean;
    /**
     * 建立安全的檔案名稱
     */
    static sanitizeFilename(filename: string): string;
    /**
     * 獲取唯一檔案路徑（如果檔案已存在，添加數字後綴）
     */
    static getUniqueFilePath(filePath: string, existsChecker: (path: string) => Promise<boolean>): Promise<string>;
}
//# sourceMappingURL=path-utils.d.ts.map