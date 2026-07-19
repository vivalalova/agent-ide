/**
 * 路徑工具模組
 * 提供路徑解析、比對、轉換等工具方法
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import {
  getImportResolutionExtensions,
  isSourceFileExtension,
  SOURCE_FILE_EXTENSIONS,
  stripSourceFileExtension
} from '@shared/types/index.js';
import { findPathAliasMatch } from '@shared/path-alias-resolver.js';
import { escapeRegex } from '@shared/regex-utils.js';
import { COMMON_EXCLUDE_DIR_NAMES } from '@shared/exclude-dirs.js';
import { resolveProjectImportCandidates } from '@core/foundations/index.js';

/**
 * 支援的檔案副檔名
 */
export const ALLOWED_EXTENSIONS = [...SOURCE_FILE_EXTENSIONS, '.vue'] as const;

/**
 * 專案 ESM 慣例：相對 import 在目標為常見 .ts/.tsx/.js/.jsx 來源時補 `.js`
 * （NodeNext 執行期副檔名；見 file-change-preparer C10、move-member self-ref F8）。
 *
 * `relativePath` 應已 strip 來源副檔名且以 `./` 或 `../` 開頭。
 * 沿用 shared getImportResolutionExtensions('.js') 單一來源判斷候選副檔名，
 * 不另立清單；.mts/.cts 對應 .mjs/.cjs 無法從同表推得，維持不補。
 */
export function withEsmRuntimeExtension(relativePath: string, targetFilePath: string): string {
  if (path.extname(relativePath)) {
    return relativePath;
  }
  const toExtension = path.extname(targetFilePath);
  if (getImportResolutionExtensions('.js').includes(toExtension)) {
    return `${relativePath}.js`;
  }
  return relativePath;
}

/**
 * 排除的目錄模式
 * 沿用 @shared/exclude-dirs 的權威目錄名稱清單，不另存局部子集
 */
export const EXCLUDE_PATTERNS = COMMON_EXCLUDE_DIR_NAMES;

/**
 * 路徑工具類別
 * 處理 import 路徑的解析、比對和轉換
 */
export class PathUtils {
  constructor(
    private readonly importResolver: ImportResolver,
    private readonly fileSystem?: IFileSystem
  ) {}

  /**
   * 解析 import 路徑為絕對路徑
   *
   * @param importPath - import 語句中的路徑
   * @param fromFile - 包含該 import 的檔案路徑
   * @returns 解析後的絕對路徑
   */
  resolveImportPath(importPath: string, fromFile: string): string {
    if (importPath.startsWith('.')) {
      // 相對路徑 - 轉換為絕對路徑
      const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
      const resolved = path.resolve(fromDir, importPath);
      // 正規化路徑
      return path.normalize(resolved);
    }

    // 嘗試解析別名（如 @/ 開頭的路徑映射）
    const resolved = this.importResolver.resolvePathAlias(importPath);
    return this.resolveImportPathAfterAlias(importPath, fromFile, resolved);
  }

  /**
   * 以檔案系統存在性解析 path alias，再套用共用的 baseUrl / node module 規則。
   */
  async resolveImportPathAsync(importPath: string, fromFile: string): Promise<string> {
    if (importPath.startsWith('.')) {
      return this.resolveImportPath(importPath, fromFile);
    }

    if (!this.fileSystem) {
      return this.resolveImportPath(importPath, fromFile);
    }

    const resolved = await this.importResolver.resolvePathAliasAsync(importPath, this.fileSystem);
    return this.resolveImportPathAfterAlias(importPath, fromFile, resolved);
  }

  private resolveImportPathAfterAlias(
    importPath: string,
    fromFile: string,
    resolved: string
  ): string {
    if (resolved !== importPath) {
      // 如果解析成功（與原始路徑不同）
      if (path.isAbsolute(resolved)) {
        // 絕對路徑直接返回
        return path.normalize(resolved);
      }
      // 非絕對路徑：相對於專案根目錄或 baseUrl
      // 由於 pathAliases 已經在 move.command.ts 中轉為絕對路徑，這裡應該是絕對路徑
      // 若仍為相對路徑，則視為相對於當前檔案
      const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
      const absoluteResolved = path.resolve(fromDir, resolved);
      return path.normalize(absoluteResolved);
    }

    const baseUrl = this.importResolver.getBaseUrl();

    // 設有 baseUrl 且為 bare/scoped-looking specifier 時，字面上無法區分究竟是
    // node_modules 套件（如 'lodash'、'@scope/pkg'）還是 baseUrl 相對的專案內
    // import。兩者都先嘗試 baseUrl 解析：真正的外部套件解析出的路徑不會巧合命中
    // 專案內具體目標檔，pathsMatch 比對自然被排除，語意仍維持 node module 不處理；
    // 只有恰好命中目標檔時才判定為專案內 import（見 R2-6b／scoped P2）。
    if (
      baseUrl
      && !this.importResolver.isBuiltinModule(importPath)
      && (!importPath.includes('/') || importPath.startsWith('@'))
    ) {
      return path.normalize(this.resolveBaseUrlCandidatePath(importPath, fromFile, baseUrl));
    }

    if (this.importResolver.isNodeModuleImport(importPath)) {
      return importPath; // Node 模組不處理
    }

    // 嘗試解析 baseUrl 相對路徑（如 src/utils）
    if (baseUrl) {
      return path.normalize(this.resolveBaseUrlCandidatePath(importPath, fromFile, baseUrl));
    }

    return importPath;
  }

  /**
   * 計算 bare specifier 相對 baseUrl 的候選基礎路徑（未做副檔名/index 展開、未做 fs
   * 存在性探測）。沿用 core/foundations 共用候選組裝的 baseUrl 分支，不在本檔另存一份
   * `path.resolve(baseUrl, importPath)`；move 只需要這個未展開的第一候選（其餘候選為
   * 副檔名/index 展開，move 靠下方 pathsMatch 的副檔名無關比對達成同等效果，不需要）。
   */
  private resolveBaseUrlCandidatePath(importPath: string, fromFile: string, baseUrl: string): string {
    return resolveProjectImportCandidates(importPath, fromFile, { baseUrl })[0];
  }

  /**
   * 檢查兩個路徑是否指向同一個檔案
   *
   * @param path1 - 第一個路徑（可能是目錄，如 import from '@/utils' 解析為 /path/utils）
   * @param path2 - 第二個路徑（通常是完整檔案路徑，如 /path/utils/index.ts）
   * @returns 是否指向同一檔案
   */
  pathsMatch(path1: string, path2: string): boolean {
    try {
      // 確保兩個路徑都是絕對路徑並正規化
      const abs1 = path.isAbsolute(path1)
        ? path.normalize(path1)
        : path.normalize(path.resolve(path1));
      const abs2 = path.isAbsolute(path2)
        ? path.normalize(path2)
        : path.normalize(path.resolve(path2));

      // 檢查完全匹配
      if (abs1 === abs2) {
        return true;
      }

      // 檢查去除副檔名後是否匹配（TypeScript/JavaScript 可以省略副檔名）
      const withoutExt1 = this.removeExtension(abs1);
      const withoutExt2 = this.removeExtension(abs2);

      if (withoutExt1 === withoutExt2) {
        return true;
      }

      // 處理目錄 import 指向 index 檔案的情況
      // 如 import from '@/utils' 解析為 /path/utils，實際指向 /path/utils/index.ts
      const indexBasename = path.basename(withoutExt2);
      if (indexBasename === 'index') {
        const dirPath = path.dirname(withoutExt2);
        if (withoutExt1 === dirPath) {
          return true;
        }
      }

      return false;
    } catch {
      // graceful-degradation: 路徑解析失敗時保守回傳 false
      return false;
    }
  }

  /**
   * 移除檔案副檔名
   *
   * @param filePath - 檔案路徑
   * @returns 移除副檔名後的路徑
   */
  removeExtension(filePath: string): string {
    return stripSourceFileExtension(filePath);
  }

  /**
   * 計算新的 import 路徑
   *
   * @param fromFile - import 所在的檔案
   * @param toFile - import 指向的目標檔案
   * @returns 新的相對 import 路徑
   */
  calculateNewImportPath(fromFile: string, toFile: string): string {
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, toFile);

    relativePath = stripSourceFileExtension(relativePath);

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 計算新的 import 路徑，保留原始路徑樣式（別名、baseUrl 相對路徑或相對路徑）
   *
   * @param originalImportPath - 原始 import 路徑
   * @param fromFile - import 所在的檔案
   * @param oldFilePath - 舊的目標檔案路徑（未使用但保留介面一致性）
   * @param newFilePath - 新的目標檔案路徑
   * @returns 新的 import 路徑
   */
  calculateNewImportPathPreservingStyle(
    originalImportPath: string,
    fromFile: string,
    _oldFilePath: string,
    newFilePath: string
  ): string {
    // 如果原本是路徑別名或 baseUrl 相對路徑，保留樣式
    if (!originalImportPath.startsWith('.') && !originalImportPath.startsWith('/')) {
      // 1. 檢查是否為路徑別名；匹配規則與候選展開由 shared resolver 統一提供。
      const aliasMatch = findPathAliasMatch(
        originalImportPath,
        this.importResolver.getPathAliases()
      );
      if (aliasMatch) {
        const resolvedAliasPath = path.normalize(aliasMatch.entry.candidates[0]);

        // 計算新檔案相對於別名基礎路徑的相對路徑
        let newRelativeToAlias = path.relative(resolvedAliasPath, path.normalize(newFilePath));
        newRelativeToAlias = newRelativeToAlias.replace(/\\/g, '/');

        // 新檔案已離開別名根目錄（如目錄整批搬出 alias root）時，
        // newRelativeToAlias 會是 '../xxx' 形式，繼續組出 '@/../xxx'
        // 會產生語意錯誤的別名路徑，改用一般相對路徑。
        if (!this.escapesRoot(newRelativeToAlias)) {
          newRelativeToAlias = stripSourceFileExtension(newRelativeToAlias);

          const separator = aliasMatch.entry.alias.endsWith('/') ? '' : '/';
          return this.preserveOriginalExtension(
            originalImportPath,
            aliasMatch.entry.alias + separator + newRelativeToAlias
          );
        }
      }

      // 2. 檢查是否為 baseUrl 相對路徑（如 src/utils）
      const baseUrl = this.importResolver.getBaseUrl();
      if (baseUrl) {
        // 保留原始的 baseUrl 相對路徑格式
        let newRelativeToBaseUrl = path.relative(baseUrl, path.normalize(newFilePath));
        newRelativeToBaseUrl = newRelativeToBaseUrl.replace(/\\/g, '/');

        // 同上：新檔案離開 baseUrl 根目錄時不得產生 '../xxx' 形式的 baseUrl 相對路徑，
        // 改用一般相對路徑。
        if (!this.escapesRoot(newRelativeToBaseUrl)) {
          newRelativeToBaseUrl = stripSourceFileExtension(newRelativeToBaseUrl);
          return this.preserveOriginalExtension(originalImportPath, newRelativeToBaseUrl);
        }
      }
    }

    // 否則使用相對路徑
    return this.preserveOriginalExtension(
      originalImportPath,
      this.calculateNewImportPath(fromFile, newFilePath)
    );
  }

  /**
   * 判斷一個（已轉為 '/' 分隔）相對路徑是否跳出了基準根目錄
   * （即以 '..' 開頭），供別名／baseUrl 樣式判斷是否仍適用。
   */
  private escapesRoot(relativePath: string): boolean {
    return relativePath === '..' || relativePath.startsWith('../');
  }

  private preserveOriginalExtension(originalImportPath: string, newImportPath: string): string {
    const originalExtension = path.extname(originalImportPath);
    if (
      !isSourceFileExtension(originalExtension)
      || path.extname(newImportPath)
    ) {
      return newImportPath;
    }

    return `${newImportPath}${originalExtension}`;
  }

  /**
   * 跳脫正則表達式特殊字元
   *
   * @param str - 要跳脫的字串
   * @returns 跳脫後的字串
   */
  escapeRegex(str: string): string {
    return escapeRegex(str);
  }
}
