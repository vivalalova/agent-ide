/**
 * 檔案移動服務
 * 提供安全的檔案移動功能，自動更新所有相關的 import 路徑
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import type { Changeset, TextEdit } from '@infrastructure/changeset/index.js';
import { createChangesetBuilder } from '@infrastructure/changeset/index.js';
import { ImportResolver } from './import-resolver.js';
import { MoveOperation, MoveOptions, MoveResult, PathUpdate, ImportResolverConfig, MoveError as MoveErrorType, createMoveError } from './types.js';

/**
 * 移動操作錯誤類別
 * 用於事務中明確識別錯誤類型
 */
export class MoveOperationError extends Error {
  constructor(
    message: string,
    public readonly errorType: MoveErrorType['type'],
    public readonly filePath?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MoveOperationError';
  }

  /**
   * 轉換為 MoveError 介面
   */
  toMoveError(): MoveErrorType {
    return createMoveError(this.errorType, this.message, this.filePath, this.cause);
  }
}

/**
 * 支援的檔案副檔名
 */
const ALLOWED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.vue'] as const;

/**
 * 排除的目錄模式
 */
const EXCLUDE_PATTERNS = ['node_modules', 'dist', '.git', 'coverage', '.build'] as const;

export class MoveService {
  private importResolver: ImportResolver;

  constructor(
    private readonly fileSystem: IFileSystem,
    config?: ImportResolverConfig,
    importResolver?: ImportResolver
  ) {
    if (importResolver) {
      this.importResolver = importResolver;
    } else {
      const defaultConfig: ImportResolverConfig = {
        pathAliases: {},
        supportedExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue'],
        ...config
      };
      this.importResolver = new ImportResolver(defaultConfig);
    }
  }

  /**
   * 移動檔案或目錄
   */
  async moveFile(operation: MoveOperation, options: MoveOptions = {}): Promise<MoveResult> {
    const { source, target, updateImports = true } = operation;
    const { preview = false, projectRoot = process.cwd() } = options;
    let fileMoved = false;
    const transactionLog: string[] = [];

    try {
      // 1. 驗證路徑
      await this.validatePaths(source, target);

      // 檢查是否為目錄
      const isDirectory = await this.fileSystem.isDirectory(source);

      // 2. 收集需要更新的檔案（使用共用方法）
      const pathUpdates = updateImports
        ? await this.calculatePathUpdatesInternal(source, target, isDirectory, projectRoot)
        : [];

      // 3. 預覽模式
      if (preview) {
        return {
          success: true,
          source,
          target,
          moved: false,
          pathUpdates,
          message: `預覽：將移動 ${source} → ${target}，影響 ${pathUpdates.length} 個 import`
        };
      }

      // 4. 執行移動
      transactionLog.push(`MOVE: ${source} → ${target}`);
      await this.performMove(source, target);
      fileMoved = true;

      // 5. 更新 import 路徑
      if (updateImports && pathUpdates.length > 0) {
        try {
          await this.applyPathUpdates(pathUpdates);
          transactionLog.push(`IMPORT_UPDATES: ${JSON.stringify(
            pathUpdates.map(u => ({
              file: u.filePath,
              line: u.line,
              from: u.oldImport,
              to: u.newImport
            }))
          )}`);
        } catch (updateError) {
          // 所有 import 更新錯誤都應該觸發回滾
          const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';

          // 記錄錯誤到事務日誌
          transactionLog.push(`IMPORT_UPDATE_FAILED: ${errorMessage}`);

          // 嘗試回滾檔案移動
          try {
            transactionLog.push(`ROLLBACK_ATTEMPT: ${target} → ${source}`);
            await this.performRollback(target, source, isDirectory);
            fileMoved = false;
            transactionLog.push('ROLLBACK_SUCCESS');
          } catch (rollbackError) {
            // 回滾失敗，記錄完整事務日誌供手動恢復
            const rollbackErrorMsg = rollbackError instanceof Error ? rollbackError.message : 'Unknown error';
            transactionLog.push(`ROLLBACK_FAILED: ${rollbackErrorMsg}`);

            // 建構詳細的手動恢復指引
            const manualRecoverySteps = [
              `將 ${target} 移動回 ${source}`,
              `檢查並還原以下檔案的 import 變更: ${pathUpdates.map(u => u.filePath).join(', ')}`
            ];

            return {
              success: false,
              source,
              target,
              moved: true, // 檔案仍在 target 位置
              pathUpdates,
              error: `Import 更新失敗且無法回滾: ${errorMessage}。回滾錯誤: ${rollbackErrorMsg}。手動恢復步驟: ${manualRecoverySteps.join('; ')}`,
              message: `移動失敗且回滾失敗，需要手動恢復。事務日誌: ${transactionLog.join('; ')}`
            };
          }

          return {
            success: false,
            source,
            target,
            moved: fileMoved,
            pathUpdates,
            error: errorMessage,
            message: `移動失敗: ${errorMessage}`
          };
        }
      }

      return {
        success: true,
        source,
        target,
        moved: true,
        pathUpdates,
        message: `成功移動 ${source} → ${target}，更新了 ${pathUpdates.length} 個 import`
      };

    } catch (error) {
      // 最外層的 try-catch：在計算 pathUpdates 之前發生的錯誤，pathUpdates 可能尚未初始化
      const pathUpdates: PathUpdate[] = [];
      return {
        success: false,
        source,
        target,
        moved: fileMoved,
        pathUpdates,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `移動失敗: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * 計算路徑更新的內部共用方法
   * 用於 moveFile() 和 generateChangeset() 共用
   */
  private async calculatePathUpdatesInternal(
    source: string,
    target: string,
    isDirectory: boolean,
    projectRoot: string
  ): Promise<PathUpdate[]> {
    const pathUpdates: PathUpdate[] = [];

    if (isDirectory) {
      // 目錄移動：處理目錄內所有檔案
      const filesInDir = await this.getFilesInDirectory(source);

      for (const filePath of filesInDir) {
        // 計算檔案在目錄內的相對路徑
        const relativePath = path.relative(source, filePath);
        const newFilePath = path.join(target, relativePath);

        // 更新其他檔案對目錄內檔案的引用
        const affectedFiles = await this.findAffectedFiles(filePath, projectRoot);
        for (const affectedFile of affectedFiles) {
          const updates = await this.calculatePathUpdates(affectedFile, filePath, newFilePath);
          pathUpdates.push(...updates);
        }

        // 更新目錄內檔案的內部 import
        const internalUpdates = await this.calculateMovedFileInternalUpdates(filePath, newFilePath);
        pathUpdates.push(...internalUpdates);
      }
    } else {
      // 單一檔案移動
      // 更新其他檔案對被移動檔案的引用
      const affectedFiles = await this.findAffectedFiles(source, projectRoot);

      for (const filePath of affectedFiles) {
        const updates = await this.calculatePathUpdates(filePath, source, target);
        pathUpdates.push(...updates);
      }

      // 更新被移動檔案內部的 import（在移動前處理）
      const movedFileInternalUpdates = await this.calculateMovedFileInternalUpdates(source, target);
      pathUpdates.push(...movedFileInternalUpdates);
    }

    return pathUpdates;
  }

  /**
   * 執行回滾操作
   */
  private async performRollback(currentPath: string, originalPath: string, isDirectory: boolean): Promise<void> {
    if (isDirectory) {
      await this.moveDirectory(currentPath, originalPath);
    } else {
      await this.fileSystem.moveFile(currentPath, originalPath);
    }
  }

  /**
   * 生成移動的 Changeset
   * 不執行實際移動，只計算變更
   *
   * @param operation - 移動操作
   * @param options - 移動選項
   * @returns Changeset 物件
   */
  async generateChangeset(operation: MoveOperation, options: MoveOptions = {}): Promise<Changeset> {
    const { source, target, updateImports = true } = operation;
    const { projectRoot = process.cwd() } = options;

    const builder = createChangesetBuilder()
      .forCommand('move')
      .withDescription(`Moved '${path.basename(source)}' to '${path.basename(target)}'`);

    try {
      // 驗證路徑（只讀驗證，不建立目錄）
      await this.validatePathsForChangeset(source, target);

      // 檢查是否為目錄
      const isDirectory = await this.fileSystem.isDirectory(source);

      // 收集 import 更新（使用共用方法）
      const pathUpdates = updateImports
        ? await this.calculatePathUpdatesInternal(source, target, isDirectory, projectRoot)
        : [];

      // 轉換 pathUpdates 為 TextEdit，按檔案分組
      // 注意：對於被移動檔案的內部更新，filePath 是 target，但需要從 source 讀取內容
      const grouped = new Map<string, PathUpdate[]>();
      for (const update of pathUpdates) {
        const list = grouped.get(update.filePath) ?? [];
        list.push(update);
        grouped.set(update.filePath, list);
      }

      for (const [filePath, updates] of grouped) {
        // 判斷是否為被移動檔案的內部更新
        // 可能是單檔移動（filePath === target）或目錄移動（filePath 以 target 開頭）
        const isMovedFile = filePath === target || filePath.startsWith(target + path.sep);
        // 計算原始檔案路徑
        let readPath = filePath;
        if (isMovedFile) {
          if (filePath === target) {
            // 單檔移動
            readPath = source;
          } else {
            // 目錄移動：將 target 前綴替換為 source
            const relativePath = filePath.slice(target.length);
            readPath = source + relativePath;
          }
        }
        const content = await this.fileSystem.readFile(readPath, 'utf-8') as string;
        const lines = content.split('\n');

        const edits: TextEdit[] = updates.map(update => {
          const lineIndex = update.line - 1;
          const lineContent = lines[lineIndex] ?? '';
          const startCol = lineContent.indexOf(update.oldImport) + 1;
          const endCol = startCol + update.oldImport.length;

          return {
            range: {
              start: { line: update.line, column: startCol, offset: undefined },
              end: { line: update.line, column: endCol, offset: undefined }
            },
            newText: update.newImport,
            description: `Update import: ${update.oldImport} → ${update.newImport}`
          };
        });

        // 對於被移動檔案，使用原始路徑來建立 TextChange（轉換器會從該路徑讀取）
        // 實際的檔案移動由 fileOperations 處理
        builder.addTextChange(readPath, edits, 'modify');
      }

      // 新增檔案移動操作
      builder.addFileMove(source, target);

      return builder.build();
    } catch (error) {
      return builder
        .addError(error instanceof Error ? error.message : String(error))
        .build();
    }
  }

  /**
   * 驗證路徑（只讀版本，用於 generateChangeset）
   * 不建立任何目錄，只做驗證
   */
  private async validatePathsForChangeset(source: string, target: string): Promise<void> {
    // 檢查來源是否存在
    const sourceExists = await this.fileSystem.exists(source);
    if (!sourceExists) {
      throw new Error(`來源路徑不存在: ${source}`);
    }

    // 檢查目標是否已存在
    const targetExists = await this.fileSystem.exists(target);
    if (targetExists) {
      throw new Error(`目標路徑已存在: ${target}`);
    }
  }

  /**
   * 驗證路徑
   */
  private async validatePaths(source: string, target: string): Promise<void> {
    // 檢查來源是否存在
    const sourceExists = await this.fileSystem.exists(source);
    if (!sourceExists) {
      throw new Error(`來源路徑不存在: ${source}`);
    }

    // 檢查目標路徑的父目錄
    const targetDir = path.dirname(target);
    const targetDirExists = await this.fileSystem.exists(targetDir);
    if (!targetDirExists) {
      // 嘗試建立父目錄
      await this.fileSystem.createDirectory(targetDir);
    }

    // 檢查目標是否已存在
    const targetExists = await this.fileSystem.exists(target);
    if (targetExists) {
      throw new Error(`目標路徑已存在: ${target}`);
    }
  }

  /**
   * 執行實際的檔案移動
   */
  private async performMove(source: string, target: string): Promise<void> {
    const isDirectory = await this.fileSystem.isDirectory(source);

    if (isDirectory) {
      // 目錄移動：遞迴複製所有檔案，然後刪除原目錄
      await this.moveDirectory(source, target);
    } else {
      // 單一檔案移動
      const targetDir = path.dirname(target);
      await this.fileSystem.createDirectory(targetDir);
      await this.fileSystem.moveFile(source, target);
    }
  }

  /**
   * 遞迴移動目錄
   */
  private async moveDirectory(source: string, target: string): Promise<void> {
    // 建立目標目錄
    await this.fileSystem.createDirectory(target);

    // 讀取源目錄內容
    const entries = await this.fileSystem.readDirectory(source);

    for (const entry of entries) {
      const sourcePath = entry.path;
      const relativePath = path.relative(source, sourcePath);
      const targetPath = path.join(target, relativePath);

      if (entry.isDirectory) {
        // 遞迴處理子目錄
        await this.moveDirectory(sourcePath, targetPath);
      } else if (entry.isFile) {
        // 複製檔案
        const content = await this.fileSystem.readFile(sourcePath, 'utf-8');
        await this.fileSystem.writeFile(targetPath, content as string);
        await this.fileSystem.deleteFile(sourcePath);
      }
    }

    // 刪除原目錄
    await this.fileSystem.deleteDirectory(source);
  }

  /**
   * 找出受影響的檔案
   */
  private async findAffectedFiles(movedPath: string, projectRoot: string): Promise<string[]> {
    const affectedFiles: string[] = [];
    const files = await this.getAllProjectFiles(projectRoot);

    for (const file of files) {
      // 跳過被移動的檔案本身（處理不同的路徑格式）
      const normalizedFile = path.normalize(file);
      const normalizedMovedPath = path.normalize(movedPath);

      if (normalizedFile === normalizedMovedPath) {continue;}

      const hasReference = await this.fileReferencesPath(file, movedPath);
      if (hasReference) {
        affectedFiles.push(file);
      }
    }

    return affectedFiles;
  }

  /**
   * 獲取專案中的所有檔案
   */
  private async getAllProjectFiles(projectRoot: string): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          if (entry.isDirectory) {
            // 跳過排除的目錄
            if (EXCLUDE_PATTERNS.some(pattern => entry.name.includes(pattern))) {
              continue;
            }
            await walkDir(entry.path);
          } else if (entry.isFile) {
            // 只包含支援的副檔名
            if (ALLOWED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
              files.push(entry.path);
            }
          }
        }
      } catch {
        // 忽略無法存取的目錄
      }
    };

    await walkDir(projectRoot);
    return files;
  }

  /**
   * 獲取目錄內的所有檔案（遞迴）
   */
  private async getFilesInDirectory(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          if (entry.isDirectory) {
            await walkDir(entry.path);
          } else if (entry.isFile) {
            if (ALLOWED_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
              files.push(entry.path);
            }
          }
        }
      } catch {
        // 忽略無法存取的目錄
      }
    };

    await walkDir(dirPath);
    return files;
  }

  /**
   * 檢查檔案是否引用了指定路徑
   */
  private async fileReferencesPath(filePath: string, targetPath: string): Promise<boolean> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, filePath);

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 解析 import 路徑並檢查是否指向目標檔案
        const resolvedPath = this.resolveImportPath(importStatement.path, filePath);
        if (this.pathsMatch(resolvedPath, targetPath)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * 解析 import 路徑為絕對路徑
   */
  private resolveImportPath(importPath: string, fromFile: string): string {
    if (this.importResolver.isNodeModuleImport(importPath)) {
      return importPath; // Node 模組不處理
    }

    if (importPath.startsWith('.')) {
      // 相對路徑 - 轉換為絕對路徑
      const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
      const resolved = path.resolve(fromDir, importPath);
      // 正規化路徑
      return path.normalize(resolved);
    }

    // 嘗試解析別名（如 @/ 開頭的路徑映射）
    const resolved = this.importResolver.resolvePathAlias(importPath);
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

    return importPath;
  }

  /**
   * 檢查兩個路徑是否指向同一個檔案
   */
  private pathsMatch(path1: string, path2: string): boolean {
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

      return withoutExt1 === withoutExt2;
    } catch {
      return false;
    }
  }

  /**
   * 移除檔案副檔名
   */
  private removeExtension(filePath: string): string {
    const ext = path.extname(filePath);
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      return filePath.slice(0, -ext.length);
    }
    return filePath;
  }

  /**
   * 計算路徑更新
   */
  private async calculatePathUpdates(filePath: string, oldPath: string, newPath: string): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, filePath);

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 將 oldPath 規範化為絕對路徑以便比較
        const normalizedOldPath = path.isAbsolute(oldPath)
          ? path.normalize(oldPath)
          : path.normalize(path.resolve(oldPath));

        // 計算 import 指向的絕對路徑
        const resolvedPath = this.resolveImportPath(importStatement.path, filePath);

        // 使用 pathsMatch 檢查是否指向被移動的檔案
        if (this.pathsMatch(resolvedPath, normalizedOldPath)) {
          // 計算新的 import 路徑，保留原始路徑類型（別名或相對路徑）
          const newImportPath = this.calculateNewImportPathPreservingStyle(
            importStatement.path,
            filePath,
            normalizedOldPath,
            newPath
          );

          const newImport = importStatement.rawStatement.replace(
            new RegExp(`(['"\`])${this.escapeRegex(importStatement.path)}\\1`),
            `$1${newImportPath}$1`
          );

          updates.push({
            filePath,
            line: importStatement.position.line,
            oldImport: importStatement.rawStatement,
            newImport
          });
        }
      }
    } catch (error) {
      console.warn(`無法處理檔案 ${filePath}:`, error);
    }

    return updates;
  }

  /**
   * 計算被移動檔案內部的 import 更新
   * 這些更新會在檔案移動後套用
   */
  private async calculateMovedFileInternalUpdates(source: string, target: string): Promise<PathUpdate[]> {
    const updates: PathUpdate[] = [];

    try {
      const content = await this.fileSystem.readFile(source, 'utf-8') as string;
      const imports = this.importResolver.parseImportStatements(content, source);

      // 防禦性檢查：確保 imports 是陣列
      if (!imports || !Array.isArray(imports)) {
        return updates;
      }

      for (const importStatement of imports) {
        // 跳過 node_modules
        if (this.importResolver.isNodeModuleImport(importStatement.path)) {
          continue;
        }

        // 只處理相對路徑的 import
        if (importStatement.path.startsWith('.')) {
          // 計算這個 import 當前指向的檔案
          const sourceDir = path.dirname(source);
          const currentResolved = path.resolve(sourceDir, importStatement.path);

          // 計算從新位置應該如何 import 這個檔案
          const newImportPath = this.calculateNewImportPath(target, currentResolved);

          // 如果路徑改變了，加入更新列表
          if (newImportPath !== importStatement.path) {
            updates.push({
              filePath: target, // 注意：這裡是 target，因為更新會在檔案移動後套用
              line: importStatement.position.line,
              oldImport: importStatement.rawStatement,
              newImport: importStatement.rawStatement.replace(
                new RegExp(`(['"\`])${this.escapeRegex(importStatement.path)}\\1`),
                `$1${newImportPath}$1`
              )
            });
          }
        }
      }
    } catch (error) {
      console.warn(`無法處理被移動檔案的內部 import ${source}:`, error);
    }

    return updates;
  }

  /**
   * 計算新的 import 路徑，保留原始路徑樣式（別名或相對路徑）
   */
  private calculateNewImportPathPreservingStyle(
    originalImportPath: string,
    fromFile: string,
    oldFilePath: string,
    newFilePath: string
  ): string {
    // 如果原本是路徑別名，保留別名並更新路徑
    if (!originalImportPath.startsWith('.') && !originalImportPath.startsWith('/')) {
      // 檢查是否為路徑別名（精確匹配：alias 本身或 alias/ 開頭）
      for (const [alias, aliasPath] of Object.entries(this.importResolver.getPathAliases())) {
        if (originalImportPath === alias || originalImportPath.startsWith(alias + '/')) {
          const resolvedAliasPath = path.normalize(aliasPath);

          // 計算新檔案相對於別名基礎路徑的相對路徑
          let newRelativeToAlias = path.relative(resolvedAliasPath, path.normalize(newFilePath));
          newRelativeToAlias = newRelativeToAlias.replace(/\\/g, '/');

          // 移除副檔名
          const newExt = path.extname(newRelativeToAlias);
          if (['.js', '.ts', '.jsx', '.tsx'].includes(newExt)) {
            newRelativeToAlias = newRelativeToAlias.slice(0, -newExt.length);
          }

          // 組合新的別名路徑：alias + / + newRelativeToAlias
          // 如果 alias 本身不以 / 結尾，需要加上
          const separator = alias.endsWith('/') ? '' : '/';
          return alias + separator + newRelativeToAlias;
        }
      }
    }

    // 否則使用相對路徑
    return this.calculateNewImportPath(fromFile, newFilePath);
  }

  /**
   * 計算新的 import 路徑
   */
  private calculateNewImportPath(fromFile: string, toFile: string): string {
    const fromDir = path.dirname(fromFile);
    let relativePath = path.relative(fromDir, toFile);

    // 移除副檔名（如果目標是支援的檔案類型）
    const ext = path.extname(relativePath);
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      relativePath = relativePath.slice(0, -ext.length);
    }

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 應用路徑更新
   */
  private async applyPathUpdates(updates: PathUpdate[]): Promise<void> {
    const fileUpdates = new Map<string, PathUpdate[]>();

    // 按檔案分組
    for (const update of updates) {
      if (!fileUpdates.has(update.filePath)) {
        fileUpdates.set(update.filePath, []);
      }
      const list = fileUpdates.get(update.filePath);
      if (list) {
        list.push(update);
      }
    }

    // 逐檔案應用更新
    for (const [filePath, fileUpdateList] of fileUpdates) {
      await this.applyFileUpdates(filePath, fileUpdateList);
    }
  }

  /**
   * 應用單一檔案的更新
   */
  private async applyFileUpdates(filePath: string, updates: PathUpdate[]): Promise<void> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;

      let newContent = content;

      // 對於多行語句，需要特別處理
      for (const update of updates) {
        // 直接使用字串替換，支援多行
        newContent = newContent.replace(update.oldImport, update.newImport);

        // 如果未找到完全匹配，嘗試規範化並再試一次
        if (newContent.indexOf(update.oldImport) === -1) {
          // 嘗試將多行 oldImport 規範化（移除額外的空格和換行）
          const normalizedOldImport = update.oldImport.replace(/\s+/g, ' ').trim();
          const contentNormalized = newContent.replace(/\s+/g, ' ');

          if (contentNormalized.indexOf(normalizedOldImport) !== -1) {
            newContent = content; // 重置
            newContent = newContent.replace(
              new RegExp(this.escapeRegex(normalizedOldImport).replace(/\s+/g, '\\s+'), 'g'),
              update.newImport.replace(/\s+/g, ' ').trim()
            );
          }
        }
      }

      await this.fileSystem.writeFile(filePath, newContent);
    } catch (error) {
      throw new Error(`更新檔案 ${filePath} 失敗: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 跳脫正則表達式特殊字元
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}