/**
 * 路徑計算模組
 * 負責計算 import 路徑更新
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from './import-resolver.js';
import { PathUtils } from './path-utils.js';
import { FileScanner } from './file-scanner.js';
import type { PathUpdate, BatchMoveInfo } from './types.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage, isFileNotFoundError } from '@shared/errors/index.js';
import { SOURCE_FILE_EXTENSIONS, SOURCE_INDEX_FILES, stripSourceFileExtension } from '@shared/types/index.js';

const SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT = [...SOURCE_FILE_EXTENSIONS, ''] as const;

/**
 * 由 import 字面解析出的路徑，展開成磁碟上可能的實際檔案候選。
 *
 * import 字面可能已帶顯式副檔名（TS ESM 慣例 './b.js' 指向磁碟上的 b.ts），
 * 直接疊加候選副檔名會得到 'b.js.ts' 這種雙副檔名、永遠命中不到真正的 'b.ts'。
 * 因此候選一律先用 stripSourceFileExtension 剝除字面副檔名再組合；省略副檔名
 * 的 import 本就無副檔名可剝，行為不變。相對路徑分支的 co-move 目錄判定與
 * shadow-file 保護（來源／目標兩個 exists 迴圈）共用這一份候選展開。
 */
function buildResolvedFileCandidates(resolvedPath: string): string[] {
  const base = stripSourceFileExtension(resolvedPath);
  return SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT.map(ext => path.normalize(base + ext));
}

/**
 * 路徑計算器類別
 * 負責計算檔案移動時需要更新的 import 路徑
 */
export class PathCalculator {
  private readonly pathUtils: PathUtils;
  private readonly fileScanner: FileScanner;
  private readonly batchAffectedFilesCache = new WeakMap<BatchMoveInfo, Map<string, Promise<Map<string, string[]>>>>();

  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly importResolver: ImportResolver
  ) {
    this.pathUtils = new PathUtils(importResolver, fileSystem);
    this.fileScanner = new FileScanner(fileSystem, importResolver);
  }

  /**
   * 計算路徑更新的內部共用方法
   * 用於 moveFile() 和 generateChangeset() 共用
   *
   * @param source - 來源路徑
   * @param target - 目標路徑
   * @param isDirectory - 是否為目錄
   * @param projectRoot - 專案根目錄
   * @param batchMoveInfo - 批次移動資訊（glob 模式使用）
   * @returns 路徑更新列表
   */
  async calculatePathUpdatesInternal(
    source: string,
    target: string,
    isDirectory: boolean,
    projectRoot: string,
    batchMoveInfo?: BatchMoveInfo
  ): Promise<PathUpdate[]> {
    const pathUpdates: PathUpdate[] = [];

    if (isDirectory) {
      // 目錄移動：處理目錄內所有檔案
      const filesInDir = await this.fileScanner.getFilesInDirectory(source);

      for (const filePath of filesInDir) {
        // 計算檔案在目錄內的相對路徑
        const relativePath = path.relative(source, filePath);
        const newFilePath = path.join(target, relativePath);

        // 更新其他檔案對目錄內檔案的引用
        // 排除目錄內的所有檔案，避免重複處理
        const affectedFiles = await this.fileScanner.findAffectedFiles(
          filePath,
          projectRoot,
          filesInDir
        );
        for (const affectedFile of affectedFiles) {
          const updates = await this.calculatePathUpdates(affectedFile, filePath, newFilePath);
          pathUpdates.push(...updates);
        }

        // 更新目錄內檔案的內部 import
        // 傳入目錄資訊，讓方法知道哪些引用不需要更新
        const internalUpdates = await this.calculateMovedFileInternalUpdates(
          filePath,
          newFilePath,
          source,
          filesInDir
        );
        pathUpdates.push(...internalUpdates);
      }
    } else {
      // 單一檔案移動
      // 更新其他檔案對被移動檔案的引用
      // 排除同一批次中也被移動的檔案（它們的相對引用會保持不變）
      const affectedFiles = batchMoveInfo
        ? await this.findBatchAffectedFiles(source, projectRoot, batchMoveInfo)
        : await this.fileScanner.findAffectedFiles(source, projectRoot);

      for (const filePath of affectedFiles) {
        const updates = await this.calculatePathUpdates(filePath, source, target);
        pathUpdates.push(...updates);
      }

      // 更新被移動檔案內部的 import（在移動前處理）
      // 傳入 batchMoveInfo 讓方法知道哪些檔案是一起被移動的
      const movedFileInternalUpdates = await this.calculateMovedFileInternalUpdates(
        source,
        target,
        undefined,
        undefined,
        batchMoveInfo
      );
      pathUpdates.push(...movedFileInternalUpdates);
    }

    // 規範化路徑：確保所有 filePath 都是絕對路徑
    // 這避免了相對路徑和絕對路徑被視為不同的檔案
    const normalizedUpdates = pathUpdates.map(update => ({
      ...update,
      filePath: path.isAbsolute(update.filePath)
        ? path.normalize(update.filePath)
        : path.resolve(projectRoot, update.filePath)
    }));

    // 去重：有 column 時區分同一行的不同 import；未提供時維持既有鍵語意
    const seen = new Set<string>();
    const uniqueUpdates = normalizedUpdates.filter(update => {
      const baseKey = `${update.filePath}:${update.line}:${update.oldImport}`;
      const key = update.column === undefined ? baseKey : `${baseKey}:${update.column}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });

    return uniqueUpdates;
  }

  private async findBatchAffectedFiles(
    source: string,
    projectRoot: string,
    batchMoveInfo: BatchMoveInfo
  ): Promise<string[]> {
    let projectCache = this.batchAffectedFilesCache.get(batchMoveInfo);
    if (!projectCache) {
      projectCache = new Map<string, Promise<Map<string, string[]>>>();
      this.batchAffectedFilesCache.set(batchMoveInfo, projectCache);
    }

    const absoluteProjectRoot = path.isAbsolute(projectRoot) ? projectRoot : path.resolve(projectRoot);
    const projectCacheKey = path.normalize(absoluteProjectRoot);
    let affectedFilesPromise = projectCache.get(projectCacheKey);
    if (!affectedFilesPromise) {
      const batchSourceFiles = Array.from(batchMoveInfo.allMovedFiles.keys());
      affectedFilesPromise = this.fileScanner.findAffectedFilesForPaths(
        batchSourceFiles,
        projectRoot,
        batchSourceFiles
      );
      projectCache.set(projectCacheKey, affectedFilesPromise);
    }

    const normalizedSource = path.isAbsolute(source)
      ? path.normalize(source)
      : path.normalize(path.resolve(absoluteProjectRoot, source));
    const affectedFilesBySource = await affectedFilesPromise;
    return affectedFilesBySource.get(normalizedSource) ?? [];
  }

  /**
   * 計算路徑更新
   * 針對單一檔案，計算其對被移動檔案的 import 更新
   *
   * @param filePath - 包含 import 的檔案
   * @param oldPath - 舊的目標路徑
   * @param newPath - 新的目標路徑
   * @returns 路徑更新列表
   */
  async calculatePathUpdates(
    filePath: string,
    oldPath: string,
    newPath: string
  ): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, filePath);

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (
          this.importResolver.isNodeModuleImport(importStatement.path)
          && !this.importResolver.isScopedBaseUrlImport(importStatement.path)
        ) {
          continue;
        }

        // 將 oldPath 規範化為絕對路徑以便比較
        const normalizedOldPath = path.isAbsolute(oldPath)
          ? path.normalize(oldPath)
          : path.normalize(path.resolve(oldPath));

        // 計算 import 指向的絕對路徑
        const resolvedPath = await this.pathUtils.resolveImportPathAsync(importStatement.path, filePath);

        // 使用 pathsMatch 檢查是否指向被移動的檔案
        if (this.pathUtils.pathsMatch(resolvedPath, normalizedOldPath)) {
          // 計算新的 import 路徑，保留原始路徑類型（別名或相對路徑）
          const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
            importStatement.path,
            filePath,
            normalizedOldPath,
            newPath
          );

          const newImport = this.replaceModuleSpecifier(
            importStatement.rawStatement,
            importStatement.path,
            newImportPath,
            importStatement.specifierOffset
          );
          if (newImport === importStatement.rawStatement) {
            continue;
          }

          updates.push({
            filePath,
            line: importStatement.position.line,
            column: importStatement.position.column,
            oldImport: importStatement.rawStatement,
            newImport
          });
        }
      }
    } catch (error) {
      if (isFileNotFoundError(error)) {
        // 合理的空結果：此候選檔案在被判定為 affected 之後、實際重讀計算
        // 更新內容之前已經消失（如已被刪除），自然沒有更新可產生。
        diagnostics.warn('move/path-calculator', 'FILE_MISSING_DURING_SCAN', `File no longer exists, skipping: ${getErrorMessage(error)}`, filePath);
        return updates;
      }
      // fast-fail：非「檔案不存在」的讀取/解析失敗（如權限不足）若被吞掉，
      // 這個已知會引用被移動檔案的檔案就完全不會產生更新，move 會靜默漏改
      // 它的 import 卻仍回報成功，造成資料不一致（見 P2 regression）。必須讓
      // 錯誤往外傳播中止整個 move。
      throw new Error(`Failed to compute path updates for file: ${filePath}: ${getErrorMessage(error)}`);
    }

    return updates;
  }

  /**
   * 計算被移動檔案內部的 import 更新
   * 這些更新會在檔案移動後套用
   *
   * @param source - 來源檔案路徑
   * @param target - 目標檔案路徑
   * @param movedDirectory - 被移動的目錄路徑（目錄移動時使用）
   * @param filesInMovedDir - 被移動目錄內的所有檔案（目錄移動時使用）
   * @param batchMoveInfo - 批次移動資訊（glob 模式使用）
   * @returns 路徑更新列表
   */
  async calculateMovedFileInternalUpdates(
    source: string,
    target: string,
    movedDirectory?: string,
    filesInMovedDir?: string[],
    batchMoveInfo?: BatchMoveInfo
  ): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(source, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, source);

      // 防禦性檢查：確保 imports 是陣列
      if (!imports || !Array.isArray(imports)) {
        return updates;
      }

      // 如果是目錄移動，建立 Set 以快速查找
      const normalizedFilesInDir = filesInMovedDir
        ? new Set(filesInMovedDir.map(f => path.normalize(f)))
        : null;

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (
          this.importResolver.isNodeModuleImport(importStatement.path)
          && !this.importResolver.isScopedBaseUrlImport(importStatement.path)
        ) {
          continue;
        }

        // 處理相對路徑的 import
        if (importStatement.path.startsWith('.')) {
          // 計算這個 import 當前指向的檔案
          const sourceDir = path.dirname(source);
          const currentResolved = path.resolve(sourceDir, importStatement.path);
          const normalizedResolved = path.normalize(currentResolved);

          // 如果是目錄移動，檢查被引用的檔案是否也在被移動的目錄內
          if (movedDirectory && normalizedFilesInDir) {
            // 嘗試解析到實際檔案（處理省略副檔名的情況，如 ./utils → utils.ts）。
            // import 字面若已帶顯式副檔名（如 './sub/deep.js'），normalizedResolved
            // 已經是 'deep.js'；候選副檔名比對前須先剝除該字面副檔名，否則會疊加成
            // 'deep.js.ts' 這種雙副檔名去比對，永遠命中不到實際的 'deep.ts'（見
            // explicit-extension co-move regression）。候選展開共用
            // buildResolvedFileCandidates 單一來源。
            let isTargetInMovedDir = buildResolvedFileCandidates(normalizedResolved)
              .some(candidate => normalizedFilesInDir.has(candidate));

            // 如果不是直接匹配，檢查 index 檔案（如 ./utils → utils/index.ts）。
            // 缺這一步時，co-move 目錄索引檔會被誤判成「未一起搬移」，導致
            // 明明相對位置不變的 import 被錯誤改寫（見 adversarial R3 regression，
            // 比照下方 alias/baseUrl 分支已有的 SOURCE_INDEX_FILES 檢查）。
            if (!isTargetInMovedDir) {
              isTargetInMovedDir = SOURCE_INDEX_FILES.some(indexFile => {
                const fullPath = path.normalize(normalizedResolved + indexFile);
                return normalizedFilesInDir.has(fullPath);
              });
            }

            // 如果目標檔案也在被移動的目錄內，相對位置不變，跳過更新
            if (isTargetInMovedDir) {
              continue;
            }
          }

          // 如果是批次移動（glob 模式），檢查被引用的檔案是否也在被移動列表中
          if (batchMoveInfo) {
            // 遍歷所有被移動的檔案，檢查是否有匹配
            // 使用 pathsMatch 來處理路徑格式差異和副檔名省略
            let isTargetInBatch = false;
            for (const batchSource of batchMoveInfo.allMovedFiles.keys()) {
              if (this.pathUtils.pathsMatch(normalizedResolved, batchSource)) {
                isTargetInBatch = true;
                break;
              }
            }

            // 如果目標檔案也在被移動列表中，相對位置不變，跳過更新
            if (isTargetInBatch) {
              continue;
            }
          }

          // Issue #58 修復：檢查目標目錄是否有同名檔案
          // 如果保持相對路徑不變，在目標位置會解析到的檔案
          const targetDir = path.dirname(target);
          const potentialTargetResolved = path.resolve(targetDir, importStatement.path);

          // 檢查目標位置是否存在同名檔案
          let targetFileExists = false;
          for (const candidate of buildResolvedFileCandidates(potentialTargetResolved)) {
            if (await this.fileSystem.exists(candidate)) {
              targetFileExists = true;
              break;
            }
          }

          // 檢查這個 import 目前解析到的原始檔案是否仍存在於原位置。
          // 只有「原檔已不在原位（已被搬走）」時，目標目錄的同名檔案才代表
          // 這是連帶／增量搬移的結果；原檔仍在原位時，目標目錄的同名檔案
          // 只是巧合，繼續保留相對路徑會讓 import 靜默綁到錯誤的模組。
          // 候選展開必須剝除 import 字面副檔名（見 buildResolvedFileCandidates）：
          // 顯式 `.js` import 疊加成 'b.js.ts' 時此判斷永遠為 false，會讓下方
          // shadow-file 保護誤判「來源已被搬走」而跳過本該更新的 import。
          let sourceFileStillExists = false;
          for (const candidate of buildResolvedFileCandidates(normalizedResolved)) {
            if (await this.fileSystem.exists(candidate)) {
              sourceFileStillExists = true;
              break;
            }
          }

          // 如果目標目錄有同名檔案，且原檔已不在原位（已被搬移過去），
          // 保持相對路徑不變，跳過更新
          if (targetFileExists && !sourceFileStillExists) {
            continue;
          }

          // 計算從新位置應該如何 import 這個檔案，並保留原始 import 的副檔名樣式。
          const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
            importStatement.path,
            target,
            currentResolved,
            currentResolved
          );

          // 如果路徑改變了，加入更新列表
          if (newImportPath !== importStatement.path) {
            const newImport = this.replaceModuleSpecifier(
              importStatement.rawStatement,
              importStatement.path,
              newImportPath,
              importStatement.specifierOffset
            );
            if (newImport === importStatement.rawStatement) {
              continue;
            }

            updates.push({
              filePath: target, // 注意：這裡是 target，因為更新會在檔案移動後套用
              line: importStatement.position.line,
              column: importStatement.position.column,
              oldImport: importStatement.rawStatement,
              newImport
            });
          }
        }
        // 處理 alias 和 baseUrl 相對路徑（如 @/modules/db/...）
        else {
          // 解析 alias 到實際檔案路徑
          const resolvedPath = await this.pathUtils.resolveImportPathAsync(importStatement.path, source);

          // 如果解析結果與原始路徑相同，表示無法解析，跳過
          if (resolvedPath === importStatement.path) {
            continue;
          }

          const normalizedResolved = path.normalize(resolvedPath);

          // 如果是目錄移動，檢查被引用的檔案是否在被移動的目錄內
          if (movedDirectory && normalizedFilesInDir) {
            // 嘗試解析到實際檔案（處理省略副檔名和 index 檔案的情況）
            // 檢查直接副檔名匹配（如 @/modules/utils → utils.ts）
            let isTargetInMovedDir = SOURCE_FILE_EXTENSIONS_WITH_EXTENSIONLESS_IMPORT.some(ext => {
              const fullPath = path.normalize(normalizedResolved + ext);
              return normalizedFilesInDir.has(fullPath);
            });

            // 如果不是直接匹配，檢查 index 檔案（如 @/modules/alarm → alarm/index.ts）
            if (!isTargetInMovedDir) {
              isTargetInMovedDir = SOURCE_INDEX_FILES.some(indexFile => {
                const fullPath = path.normalize(normalizedResolved + indexFile);
                return normalizedFilesInDir.has(fullPath);
              });
            }

            // 如果目標檔案也在被移動的目錄內，需要更新 alias 路徑
            if (isTargetInMovedDir) {
              // 計算被引用檔案相對於原目錄的位置
              const relativeToMovedDir = path.relative(movedDirectory, normalizedResolved);

              // 計算源檔案相對於原目錄的位置
              const sourceRelativeToMovedDir = path.relative(movedDirectory, source);

              // 從 target 回溯到目標目錄
              let targetMovedDir = target;
              const depthParts = sourceRelativeToMovedDir.split(path.sep);
              for (let i = 0; i < depthParts.length; i++) {
                targetMovedDir = path.dirname(targetMovedDir);
              }

              // 被引用檔案的新位置
              const newResolvedPath = path.join(targetMovedDir, relativeToMovedDir);

              // 使用 calculateNewImportPathPreservingStyle 計算新的 alias 路徑
              const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
                importStatement.path,
                target,
                normalizedResolved,
                newResolvedPath
              );

              // 如果路徑改變了，加入更新列表
              if (newImportPath !== importStatement.path) {
                const newImport = this.replaceModuleSpecifier(
                  importStatement.rawStatement,
                  importStatement.path,
                  newImportPath,
                  importStatement.specifierOffset
                );
                if (newImport === importStatement.rawStatement) {
                  continue;
                }

                updates.push({
                  filePath: target,
                  line: importStatement.position.line,
                  column: importStatement.position.column,
                  oldImport: importStatement.rawStatement,
                  newImport
                });
              }
            }
          }

          // 如果是批次移動（glob 模式），檢查被引用的檔案是否也在被移動列表中。
          // 缺這一段時，批次移動只會改寫相對路徑 import（上面 if 分支對應的
          // 相對路徑處理已有 batchMoveInfo 感知），alias/baseUrl import 完全
          // 沒有對應的批次感知邏輯，導致同批一起搬移的 alias 目標在搬移後
          // 仍指向舊路徑（見 P2 batch-alias regression）。
          if (batchMoveInfo) {
            let matchedNewPath: string | undefined;
            for (const [batchSource, batchTarget] of batchMoveInfo.allMovedFiles.entries()) {
              if (this.pathUtils.pathsMatch(normalizedResolved, batchSource)) {
                matchedNewPath = batchTarget;
                break;
              }
            }

            if (matchedNewPath) {
              // 使用 calculateNewImportPathPreservingStyle 計算新的 alias 路徑，
              // 保留原本的別名／baseUrl 樣式（若新位置已離開別名根目錄，
              // 該方法會自動退回一般相對路徑）
              const newImportPath = this.pathUtils.calculateNewImportPathPreservingStyle(
                importStatement.path,
                target,
                normalizedResolved,
                matchedNewPath
              );

              if (newImportPath !== importStatement.path) {
                const newImport = this.replaceModuleSpecifier(
                  importStatement.rawStatement,
                  importStatement.path,
                  newImportPath,
                  importStatement.specifierOffset
                );
                if (newImport !== importStatement.rawStatement) {
                  updates.push({
                    filePath: target,
                    line: importStatement.position.line,
                    column: importStatement.position.column,
                    oldImport: importStatement.rawStatement,
                    newImport
                  });
                }
              }
            }
          }
        }
      }
    } catch (error) {
      // source 在此處必為移動前的原始檔案（呼叫端在實際搬移發生前計算內部 import
      // 更新，見上方呼叫處註解「在移動前處理」），不存在合理的「檔案已消失」情境；
      // 吞掉真正的讀取/解析失敗（如權限不足）會讓被移動檔案自己的 import 完全不
      // 被改寫，move 卻仍回報成功，造成資料不一致（與 calculatePathUpdates 同型
      // 缺陷）。必須讓錯誤往外傳播中止整個 move。
      throw new Error(`Failed to compute internal import updates for moved file: ${source}: ${getErrorMessage(error)}`);
    }

    return updates;
  }

  /**
   * 將 rawStatement 中的 module specifier 替換成新路徑。
   *
   * 優先使用 specifierOffset 精確位置錨點（若提供）：多行 require()/import()
   * 呼叫起始行行尾若有假呼叫形狀的行內註解，「keyword( 緊接著引號」的結構假設
   * 會因中間插入的註解文字而找不到真正呼叫的 specifier（`\s*` 無法跨越非空白
   * 的註解內容），必須依賴解析階段算出的精確位置才能正確定位（見 P2-1
   * regression）。位置錨點驗證失敗時（理論上不會發生）才退回既有的文字匹配。
   */
  private replaceModuleSpecifier(rawStatement: string, oldPath: string, newPath: string, specifierOffset?: number): string {
    if (specifierOffset !== undefined) {
      const quoteChar = rawStatement[specifierOffset];
      const contentStart = specifierOffset + 1;
      const contentEnd = contentStart + oldPath.length;
      const isValidQuote = quoteChar === '\'' || quoteChar === '"' || quoteChar === '`';
      if (
        isValidQuote &&
        rawStatement.slice(contentStart, contentEnd) === oldPath &&
        rawStatement[contentEnd] === quoteChar
      ) {
        return rawStatement.slice(0, specifierOffset) + quoteChar + newPath + quoteChar + rawStatement.slice(contentEnd + 1);
      }
    }

    const escapedOldPath = this.pathUtils.escapeRegex(oldPath);
    const fromSpecifierPattern = new RegExp(
      `(\\bfrom\\s*['"\`])${escapedOldPath}(['"\`])(?=\\s*(?:(?:with|assert)\\s+\\{[\\s\\S]*?\\}\\s*)?;?\\s*(?://[^\\n\\r]*|/\\*[\\s\\S]*?\\*/)?\\s*$)`
    );
    if (fromSpecifierPattern.test(rawStatement)) {
      return rawStatement.replace(fromSpecifierPattern, `$1${newPath}$2`);
    }

    const sideEffectImportPattern = new RegExp(`(\\bimport\\s*['"\`])${escapedOldPath}(['"\`])`);
    if (sideEffectImportPattern.test(rawStatement)) {
      return rawStatement.replace(sideEffectImportPattern, `$1${newPath}$2`);
    }

    const callSpecifierPattern = new RegExp(`(\\b(?:require|import)\\(\\s*['"\`])${escapedOldPath}(['"\`])`);
    return rawStatement.replace(callSpecifierPattern, `$1${newPath}$2`);
  }
}
