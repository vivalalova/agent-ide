/**
 * 檔案移動服務
 * 提供安全的檔案移動功能，自動更新所有相關的 import 路徑
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportResolver } from '@core/transform/location/move-file/import-resolver.js';
import { MoveOperation, MoveOptions, MoveResult, PathUpdate, ImportResolverConfig } from '@core/transform/location/move-file/types.js';

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
        supportedExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue', '.swift'],
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

    try {
      // 1. 驗證路徑
      await this.validatePaths(source, target);

      // 2. 收集需要更新的檔案
      const pathUpdates: PathUpdate[] = [];

      if (updateImports) {
        // 2.1 更新其他檔案對被移動檔案的引用
        const affectedFiles = await this.findAffectedFiles(source, projectRoot);

        for (const filePath of affectedFiles) {
          const updates = await this.calculatePathUpdates(filePath, source, target);
          pathUpdates.push(...updates);
        }

        // 2.2 更新被移動檔案內部的 import（在移動前處理）
        const movedFileInternalUpdates = await this.calculateMovedFileInternalUpdates(source, target);
        pathUpdates.push(...movedFileInternalUpdates);
      }

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
      await this.performMove(source, target);
      fileMoved = true;

      // 5. 更新 import 路徑
      if (updateImports && pathUpdates.length > 0) {
        try {
          await this.applyPathUpdates(pathUpdates);
        } catch (updateError) {
          // 如果更新 import 失敗，記錄錯誤但仍然回傳 success
          // 因為檔案已經移動成功
          // 測試環境中靜默處理
          if (process.env.NODE_ENV !== 'test') {
            console.error('更新 import 路徑失敗:', updateError);
          }
          const errorMessage = updateError instanceof Error ? updateError.message : 'Unknown error';

          // 如果錯誤訊息包含 "更新檔案" 或其他寫入相關錯誤，表示更新失敗
          if (errorMessage.includes('更新檔案') || errorMessage.includes('Write permission') || errorMessage.includes('permission denied')) {
            // 回滾檔案移動（如果可能）
            try {
              await this.fileSystem.moveFile(target, source);
              fileMoved = false;
            } catch {
              // 無法回滾，但仍然要回傳失敗
            }

            return {
              success: false,
              source,
              target,
              moved: fileMoved,
              pathUpdates: [],
              error: errorMessage,
              message: `移動失敗: ${errorMessage}`
            };
          }
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
      return {
        success: false,
        source,
        target,
        moved: fileMoved,
        pathUpdates: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `移動失敗: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
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
    // 確保目標目錄存在
    const targetDir = path.dirname(target);
    await this.fileSystem.createDirectory(targetDir);

    // 移動檔案或目錄
    await this.fileSystem.moveFile(source, target);
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
    const allowedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue', '.swift'];
    const excludePatterns = ['node_modules', 'dist', '.git', 'coverage', '.build'];

    const walkDir = async (dir: string): Promise<void> => {
      try {
        const entries = await this.fileSystem.readDirectory(dir);

        for (const entry of entries) {
          if (entry.isDirectory) {
            // 跳過排除的目錄
            if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
              continue;
            }
            await walkDir(entry.path);
          } else if (entry.isFile) {
            // 只包含支援的副檔名
            if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
              files.push(entry.path);
            }
          }
        }
      } catch (error) {
        // 忽略無法存取的目錄
        // console.debug(`無法存取目錄 ${dir}:`, error);
      }
    };

    await walkDir(projectRoot);
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

    // 嘗試解析別名
    const resolved = this.importResolver.resolvePathAlias(importPath);
    if (resolved !== importPath) {
      // 如果解析成功（與原始路徑不同）
      if (path.isAbsolute(resolved)) {
        // 絕對路徑直接返回
        return path.normalize(resolved);
      } else if (resolved.startsWith('.')) {
        // 相對路徑需要轉換為絕對路徑
        const fromDir = path.dirname(path.isAbsolute(fromFile) ? fromFile : path.resolve(fromFile));
        const absoluteResolved = path.resolve(fromDir, resolved);
        return path.normalize(absoluteResolved);
      }
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
    if (['.js', '.ts', '.jsx', '.tsx', '.swift'].includes(ext)) {
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
      // 檢查是否為路徑別名
      for (const [alias, aliasPath] of Object.entries(this.importResolver['config'].pathAliases)) {
        if (originalImportPath.startsWith(alias)) {
          // 將舊路徑轉換為別名格式
          const resolvedOldPath = path.normalize(oldFilePath);
          const resolvedAliasPath = path.normalize(aliasPath);

          // 計算舊檔案相對於別名基礎路徑的相對路徑
          let relativeToAlias = path.relative(resolvedAliasPath, resolvedOldPath);
          relativeToAlias = relativeToAlias.replace(/\\/g, '/');

          // 移除副檔名
          const ext = path.extname(relativeToAlias);
          if (['.js', '.ts', '.jsx', '.tsx', '.swift'].includes(ext)) {
            relativeToAlias = relativeToAlias.slice(0, -ext.length);
          }

          // 計算新檔案相對於別名基礎路徑的相對路徑
          let newRelativeToAlias = path.relative(resolvedAliasPath, path.normalize(newFilePath));
          newRelativeToAlias = newRelativeToAlias.replace(/\\/g, '/');

          // 移除副檔名
          const newExt = path.extname(newRelativeToAlias);
          if (['.js', '.ts', '.jsx', '.tsx', '.swift'].includes(newExt)) {
            newRelativeToAlias = newRelativeToAlias.slice(0, -newExt.length);
          }

          // 替換路徑部分
          return originalImportPath.replace(relativeToAlias, newRelativeToAlias);
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
    if (['.js', '.ts', '.jsx', '.tsx', '.swift'].includes(ext)) {
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
      fileUpdates.get(update.filePath)!.push(update);
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