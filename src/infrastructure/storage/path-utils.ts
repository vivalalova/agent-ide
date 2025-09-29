import * as path from 'path';
import { PathInfo } from './types.js';

/**
 * 路徑工具類別
 * 提供跨平台的路徑處理功能
 */
export class PathUtils {
  /**
   * 正規化路徑
   */
  static normalize(filePath: string): string {
    return path.normalize(filePath);
  }

  /**
   * 解析為絕對路徑
   */
  static resolve(...segments: string[]): string {
    return path.resolve(...segments);
  }

  /**
   * 組合路徑片段
   */
  static join(...segments: string[]): string {
    return path.join(...segments);
  }

  /**
   * 計算相對路徑
   */
  static relative(from: string, to: string): string {
    return path.relative(from, to);
  }

  /**
   * 檢查是否為絕對路徑
   */
  static isAbsolute(filePath: string): boolean {
    return path.isAbsolute(filePath);
  }

  /**
   * 獲取目錄名
   */
  static dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  /**
   * 獲取基礎檔名
   */
  static basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  /**
   * 獲取副檔名
   */
  static extname(filePath: string): string {
    return path.extname(filePath);
  }

  /**
   * 解析路徑為組件
   */
  static parse(filePath: string): PathInfo {
    const parsed = path.parse(filePath);
    return {
      root: parsed.root,
      dir: parsed.dir,
      base: parsed.base,
      ext: parsed.ext,
      name: parsed.name,
    };
  }

  /**
   * 從組件格式化路徑
   */
  static format(pathObj: Partial<PathInfo>): string {
    return path.format({
      root: pathObj.root,
      dir: pathObj.dir,
      base: pathObj.base,
      ext: pathObj.ext,
      name: pathObj.name,
    });
  }

  /**
   * 檢查是否為子路徑
   */
  static isSubPath(parent: string, child: string): boolean {
    const normalizedParent = this.normalize(parent);
    const normalizedChild = this.normalize(child);

    // 確保父路徑以分隔符結尾，避免前綴匹配問題
    const parentWithSep = normalizedParent.endsWith(path.sep)
      ? normalizedParent
      : normalizedParent + path.sep;

    // 子路徑必須以父路徑開頭，但不能完全相同
    return normalizedChild.startsWith(parentWithSep) &&
           normalizedChild !== normalizedParent;
  }

  /**
   * 找到路徑的共同前綴
   */
  static getCommonPath(paths: string[]): string {
    if (paths.length === 0) {
      throw new Error('至少需要一個路徑');
    }

    if (paths.length === 1) {
      return this.dirname(paths[0]);
    }

    // 正規化所有路徑
    const normalizedPaths = paths.map(p => this.normalize(p));

    // 分割第一個路徑作為基準
    const firstPath = normalizedPaths[0];
    const segments = firstPath.split(path.sep);

    const commonSegments: string[] = [];

    // 逐個比較每個路徑段
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isCommon = normalizedPaths.every(p => {
        const pathSegments = p.split(path.sep);
        return pathSegments[i] === segment;
      });

      if (isCommon) {
        commonSegments.push(segment);
      } else {
        break;
      }
    }

    // 如果沒有共同前綴，返回根路徑
    if (commonSegments.length === 0) {
      return path.sep;
    }

    return commonSegments.join(path.sep) || path.sep;
  }

  /**
   * 確保檔案有指定副檔名
   */
  static ensureExtension(filePath: string, extension: string): string {
    const currentExt = this.extname(filePath);

    // 如果已有副檔名，不變更
    if (currentExt) {
      return filePath;
    }

    // 確保副檔名有點
    const normalizedExt = extension.startsWith('.') ? extension : `.${extension}`;

    return filePath + normalizedExt;
  }

  /**
   * 變更檔案副檔名
   */
  static changeExtension(filePath: string, newExtension: string): string {
    const parsed = this.parse(filePath);

    // 確保副檔名有點
    const normalizedExt = newExtension.startsWith('.') ? newExtension : `.${newExtension}`;

    return this.format({
      ...parsed,
      ext: normalizedExt,
      base: undefined, // 清除 base，讓 format 使用 name + ext
    });
  }

  /**
   * 移除檔案副檔名
   */
  static removeExtension(filePath: string): string {
    const parsed = this.parse(filePath);

    return this.format({
      ...parsed,
      ext: '',
      base: undefined, // 清除 base，讓 format 使用 name
    });
  }

  /**
   * 轉換為 Unix 風格路徑
   */
  static toUnix(filePath: string): string {
    return filePath.replace(/\\/g, '/');
  }

  /**
   * 轉換為 POSIX 路徑
   */
  static toPosix(filePath: string): string {
    return path.posix.normalize(this.toUnix(filePath));
  }

  /**
   * 驗證路徑是否有效
   */
  static isValidPath(filePath: string): boolean {
    if (!filePath || filePath.trim() === '') {
      return false;
    }

    // 檢查無效字元
    const invalidChars = process.platform === 'win32'
      ? /[<>:"|?*]/
      : /[<>|]/;

    if (invalidChars.test(filePath)) {
      return false;
    }

    // 檢查保留名稱 (Windows)
    if (process.platform === 'win32') {
      const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
      const basename = this.basename(filePath);
      if (reservedNames.test(basename)) {
        return false;
      }
    }

    try {
      // 嘗試解析路徑
      this.parse(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 獲取路徑深度
   */
  static getDepth(filePath: string): number {
    const normalized = this.normalize(filePath);
    const segments = normalized.split(path.sep).filter(s => s && s !== '.');
    return segments.length;
  }

  /**
   * 檢查兩個路徑是否相等
   */
  static equals(path1: string, path2: string): boolean {
    const normalized1 = this.normalize(path1);
    const normalized2 = this.normalize(path2);

    // 在 Windows 上忽略大小寫
    if (process.platform === 'win32') {
      return normalized1.toLowerCase() === normalized2.toLowerCase();
    }

    return normalized1 === normalized2;
  }

  /**
   * 建立安全的檔案名稱
   */
  static sanitizeFilename(filename: string): string {
    // 移除或替換無效字元
    let sanitized = filename
      .replace(/[<>:"|?*]/g, '_')  // Windows 無效字元
      .replace(/[\x00-\x1f\x80-\x9f]/g, '_')  // 控制字元
      .replace(/^\.+/, '_')  // 避免以點開頭
      .trim();

    // 檢查長度限制
    const maxLength = process.platform === 'win32' ? 255 : 255;
    if (sanitized.length > maxLength) {
      const ext = this.extname(sanitized);
      const nameWithoutExt = this.removeExtension(sanitized);
      const truncatedName = nameWithoutExt.substring(0, maxLength - ext.length);
      sanitized = truncatedName + ext;
    }

    return sanitized || 'unnamed';
  }

  /**
   * 獲取唯一檔案路徑（如果檔案已存在，添加數字後綴）
   */
  static async getUniqueFilePath(
    filePath: string,
    existsChecker: (path: string) => Promise<boolean>
  ): Promise<string> {
    if (!(await existsChecker(filePath))) {
      return filePath;
    }

    const parsed = this.parse(filePath);
    let counter = 1;

    while (true) {
      const uniquePath = this.format({
        ...parsed,
        name: `${parsed.name}(${counter})`,
        base: undefined,
      });

      if (!(await existsChecker(uniquePath))) {
        return uniquePath;
      }

      counter++;
    }
  }
}