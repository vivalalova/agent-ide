/**
 * 檔案移動服務
 * 提供安全的檔案移動功能，自動更新所有相關的 import 路徑
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ImportResolver } from './import-resolver.js';
import { MoveOperation, MoveOptions, PathUpdate, ImportResolverConfig } from './types.js';

export interface MoveResult {
  success: boolean;
  source: string;
  target: string;
  moved: boolean;
  pathUpdates: PathUpdate[];
  error?: string;
  message: string;
}

export class MoveService {
  private importResolver: ImportResolver;

  constructor(config?: ImportResolverConfig) {
    const defaultConfig: ImportResolverConfig = {
      pathAliases: {},
      supportedExtensions: ['.js', '.ts', '.jsx', '.tsx', '.vue'],
      ...config
    };
    this.importResolver = new ImportResolver(defaultConfig);
  }

  /**
   * 移動檔案或目錄
   */
  async moveFile(operation: MoveOperation, options: MoveOptions = {}): Promise<MoveResult> {
    const { source, target, updateImports = true } = operation;
    const { preview = false, projectRoot = process.cwd() } = options;

    try {
      // 1. 驗證路徑
      await this.validatePaths(source, target);

      // 2. 收集需要更新的檔案
      const pathUpdates: PathUpdate[] = [];
      
      if (updateImports) {
        const affectedFiles = await this.findAffectedFiles(source, projectRoot);
        
        for (const filePath of affectedFiles) {
          const updates = await this.calculatePathUpdates(filePath, source, target);
          pathUpdates.push(...updates);
        }
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

      // 5. 更新 import 路徑
      if (updateImports) {
        await this.applyPathUpdates(pathUpdates);
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
        moved: false,
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
    try {
      await fs.access(source);
    } catch {
      throw new Error(`來源路徑不存在: ${source}`);
    }

    // 檢查目標路徑的父目錄
    const targetDir = path.dirname(target);
    try {
      await fs.access(targetDir);
    } catch {
      // 嘗試建立父目錄
      await fs.mkdir(targetDir, { recursive: true });
    }

    // 檢查目標是否已存在
    try {
      await fs.access(target);
      throw new Error(`目標路徑已存在: ${target}`);
    } catch (error) {
      // 如果是因為檔案不存在而拋出錯誤，這是預期的
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 執行實際的檔案移動
   */
  private async performMove(source: string, target: string): Promise<void> {
    // 確保目標目錄存在
    const targetDir = path.dirname(target);
    await fs.mkdir(targetDir, { recursive: true });

    // 移動檔案或目錄
    await fs.rename(source, target);
  }

  /**
   * 找出受影響的檔案
   */
  private async findAffectedFiles(movedPath: string, projectRoot: string): Promise<string[]> {
    const affectedFiles: string[] = [];
    const files = await this.getAllProjectFiles(projectRoot);

    for (const file of files) {
      if (file === movedPath) continue; // 跳過被移動的檔案本身
      
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
    const allowedExtensions = ['.ts', '.tsx', '.js', '.jsx', '.vue'];
    const excludePatterns = ['node_modules', 'dist', '.git', 'coverage'];

    async function walkDir(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory()) {
            // 跳過排除的目錄
            if (excludePatterns.some(pattern => entry.name.includes(pattern))) {
              continue;
            }
            await walkDir(fullPath);
          } else if (entry.isFile()) {
            // 只包含支援的副檔名
            if (allowedExtensions.some(ext => entry.name.endsWith(ext))) {
              files.push(fullPath);
            }
          }
        }
      } catch (error) {
        // 忽略無法存取的目錄
      }
    }

    await walkDir(projectRoot);
    return files;
  }

  /**
   * 檢查檔案是否引用了指定路徑
   */
  private async fileReferencesPath(filePath: string, targetPath: string): Promise<boolean> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const imports = this.importResolver.parseImportStatements(content, filePath);
      
      for (const importStatement of imports) {
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
      // 相對路徑
      const fromDir = path.dirname(fromFile);
      let resolved = path.resolve(fromDir, importPath);

      // 如果沒有副檔名，嘗試加上常見的副檔名
      if (!path.extname(resolved)) {
        for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
          const withExt = resolved + ext;
          // 直接返回可能的路徑（在 pathsMatch 中會處理）
          return resolved;
        }
      }
      return resolved;
    }

    // 嘗試解析別名
    const resolved = this.importResolver.resolvePathAlias(importPath);
    if (resolved !== importPath && resolved.startsWith('.')) {
      const fromDir = path.dirname(fromFile);
      return path.resolve(fromDir, resolved);
    }

    return importPath;
  }

  /**
   * 檢查兩個路徑是否指向同一個檔案
   */
  private pathsMatch(path1: string, path2: string): boolean {
    const normalized1 = path.resolve(path1);
    const normalized2 = path.resolve(path2);
    
    // 檢查完全匹配
    if (normalized1 === normalized2) return true;
    
    // 檢查去除副檔名後是否匹配（TypeScript/JavaScript 可以省略副檔名）
    const withoutExt1 = this.removeExtension(normalized1);
    const withoutExt2 = this.removeExtension(normalized2);
    
    return withoutExt1 === withoutExt2;
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
      const content = await fs.readFile(filePath, 'utf-8');
      const imports = this.importResolver.parseImportStatements(content, filePath);
      
      for (const importStatement of imports) {
        const resolvedPath = this.resolveImportPath(importStatement.path, filePath);
        
        if (this.pathsMatch(resolvedPath, oldPath)) {
          // 計算新的 import 路徑
          const newImportPath = this.calculateNewImportPath(filePath, newPath);
          
          updates.push({
            filePath,
            line: importStatement.position.line,
            oldImport: importStatement.rawStatement,
            newImport: importStatement.rawStatement.replace(
              new RegExp(`(['"\`])${this.escapeRegex(importStatement.path)}\\1`),
              `$1${newImportPath}$1`
            )
          });
        }
      }
    } catch (error) {
      console.warn(`無法處理檔案 ${filePath}:`, error);
    }

    return updates;
  }

  /**
   * 計算新的 import 路徑
   */
  private calculateNewImportPath(fromFile: string, toFile: string): string {
    return this.importResolver.calculateRelativePath(fromFile, toFile);
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
      let content = await fs.readFile(filePath, 'utf-8');
      
      // 按行號從高到低排序，避免行號偏移問題
      const sortedUpdates = updates.sort((a, b) => b.line - a.line);
      
      for (const update of sortedUpdates) {
        content = content.replace(update.oldImport, update.newImport);
      }
      
      await fs.writeFile(filePath, content, 'utf-8');
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