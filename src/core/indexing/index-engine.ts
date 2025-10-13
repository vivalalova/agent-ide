/**
 * 索引引擎實作
 * 程式碼索引系統的核心引擎，協調檔案索引和符號索引
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';
import type { Stats } from 'fs';

import type { Symbol, SymbolType } from '../../shared/types/index.js';
import type {
  IndexConfig,
  IndexStats,
  FileInfo,
  SymbolSearchResult,
  SearchOptions,
  IndexProgress,
  BatchIndexOptions
} from './types.js';
import {
  createFileInfo,
  createSearchOptions,
  shouldIndexFile,
  calculateProgress
} from './types.js';

import { FileIndex } from './file-index.js';
import { SymbolIndex } from './symbol-index.js';
import { ParserRegistry } from '../../infrastructure/parser/index.js';
import { TypeScriptParser } from '../../plugins/typescript/parser.js';

/**
 * 索引引擎類別
 * 協調檔案索引、符號索引和解析器的核心引擎
 */
export class IndexEngine {
  private readonly config: IndexConfig;
  private readonly fileIndex: FileIndex;
  private readonly symbolIndex: SymbolIndex;
  private readonly parserRegistry: ParserRegistry;
  private _disposed = false;
  private _indexed = false;

  constructor(config: IndexConfig) {
    // 驗證配置
    this.validateConfig(config);

    this.config = config;
    this.fileIndex = new FileIndex(config);
    this.symbolIndex = new SymbolIndex();

    // 檢查 ParserRegistry 是否已被清理，如果是則重新建立實例
    const registry = ParserRegistry.getInstance();
    if (registry.isDisposed) {
      ParserRegistry.resetInstance();
      this.parserRegistry = ParserRegistry.getInstance();
    } else {
      this.parserRegistry = registry;
    }

    // 確保 TypeScript Parser 已註冊
    if (!this.parserRegistry.getParser('.ts')) {
      const tsParser = new TypeScriptParser();
      this.parserRegistry.register(tsParser);
    }
  }

  /**
   * 驗證配置
   */
  private validateConfig(config: any): void {
    // 檢查配置物件
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('索引配置必須是物件');
    }

    // 收集所有驗證錯誤，按優先級排序

    // 檢查包含副檔名
    if (config.includeExtensions !== undefined) {
      if (!Array.isArray(config.includeExtensions)) {
        throw new Error('包含副檔名必須是陣列');
      }
    }

    // 檢查排除模式
    if (config.excludePatterns !== undefined) {
      if (!Array.isArray(config.excludePatterns)) {
        throw new Error('排除模式必須是陣列');
      }
    }

    // 檢查最大檔案大小
    if (config.maxFileSize !== undefined) {
      if (typeof config.maxFileSize !== 'number' || config.maxFileSize <= 0) {
        throw new Error('最大檔案大小必須是正數');
      }
    }

    // 檢查根路徑（最後檢查，作為後備）
    const rootPath = config.workspacePath;
    if (!rootPath || typeof rootPath !== 'string' || rootPath.trim() === '') {
      throw new Error('根路徑必須是有效字串');
    }
  }

  /**
   * 索引整個專案
   */
  async indexProject(projectPath?: string | any): Promise<void> {
    let workspacePath: string;

    // 如果沒有傳入參數，使用配置中的路徑
    if (arguments.length === 0) {
      workspacePath = this.config.workspacePath;
    } else {
      // 如果明確傳入參數，驗證其有效性
      if (projectPath === null || projectPath === undefined || projectPath === '' || typeof projectPath !== 'string') {
        throw new Error('索引路徑必須是有效字串');
      }
      workspacePath = projectPath;
    }

    // 再次驗證最終路徑
    if (!workspacePath || typeof workspacePath !== 'string' || workspacePath.trim() === '') {
      throw new Error('索引路徑必須是有效字串');
    }

    try {
      const stat = await fs.stat(workspacePath);
      if (!stat.isDirectory()) {
        throw new Error('索引路徑必須是目錄');
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error('路徑不存在');
      }
      throw error;
    }

    await this.indexDirectory(workspacePath);
    this._indexed = true;
  }

  /**
   * 索引目錄
   */
  async indexDirectory(dirPath: string): Promise<void> {
    try {
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        throw new Error(`路徑不是有效的目錄: ${dirPath}`);
      }
    } catch (error) {
      throw new Error(`無法存取目錄: ${dirPath}`);
    }

    // 使用 glob 模式查找檔案
    const includePatterns = this.config.includeExtensions.map(ext =>
      `**/*${ext}`
    );

    const allFiles: string[] = [];
    for (const pattern of includePatterns) {
      const files = await glob(pattern, {
        cwd: dirPath,
        ignore: [...this.config.excludePatterns],
        absolute: true
      });
      allFiles.push(...files);
    }

    // 過濾重複檔案並檢查是否應該索引
    const uniqueFiles = [...new Set(allFiles)];
    const filesToIndex = uniqueFiles.filter(file =>
      shouldIndexFile(file, this.config)
    );

    // 批次索引檔案
    await this.batchIndexFiles(filesToIndex, {
      concurrency: this.config.maxConcurrency,
      batchSize: 10,
      progressCallback: (progress) => {
        // 可以添加進度回調處理
      }
    });

    // 清除已不存在的檔案索引
    await this.cleanupStaleIndexEntries(filesToIndex);

    // 標記索引已建立
    this._indexed = true;
  }

  /**
   * 清除已不存在的檔案索引
   */
  private async cleanupStaleIndexEntries(currentFiles: string[]): Promise<void> {
    // 取得所有已索引的檔案
    const allIndexedFiles = this.fileIndex.getAllFiles();
    const currentFilesSet = new Set(currentFiles);

    // 找出已索引但不在當前檔案列表中的檔案
    const staleFiles = allIndexedFiles
      .map(fileInfo => fileInfo.filePath)
      .filter(filePath => !currentFilesSet.has(filePath));

    // 從索引中移除這些過期的檔案
    for (const stalePath of staleFiles) {
      // 先從符號索引中移除該檔案的符號
      const symbols = this.fileIndex.getFileSymbols(stalePath);
      for (const symbol of symbols) {
        await this.symbolIndex.removeSymbol(symbol.name, stalePath);
      }

      // 再從檔案索引中移除
      await this.fileIndex.removeFile(stalePath);
    }
  }

  /**
   * 索引單一檔案
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);

      // 檢查檔案大小，超過限制則跳過
      if (stat.size > this.config.maxFileSize) {
        // 靜默跳過大檔案，不報錯
        return;
      }

      const content = await fs.readFile(filePath, 'utf-8');

      const fileInfo = await this.createFileInfoFromStat(filePath, stat);

      // 新增到檔案索引
      await this.fileIndex.addFile(fileInfo);

      // 標記索引已建立（即使只索引了一個檔案）
      this._indexed = true;

      try {
        // 解析檔案並提取符號
        const parser = this.parserRegistry.getParser(path.extname(filePath));
        if (!parser) {
          throw new Error(`找不到適合的解析器: ${filePath}`);
        }

        const ast = await parser.parse(content, filePath);
        const symbols = await parser.extractSymbols(ast);
        const dependencies = await parser.extractDependencies(ast);

        // 更新檔案索引的符號和依賴
        await this.fileIndex.setFileSymbols(filePath, symbols);
        await this.fileIndex.setFileDependencies(filePath, dependencies);

        // 新增符號到符號索引
        await this.symbolIndex.addSymbols(symbols, fileInfo);

      } catch (parseError) {
        // 記錄解析錯誤
        const errorMessage = parseError instanceof Error ? parseError.message : '未知解析錯誤';
        await this.fileIndex.setFileParseErrors(filePath, [errorMessage]);

        // 重新拋出解析錯誤
        throw new Error(`解析檔案失敗 ${filePath}: ${errorMessage}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      throw new Error(`索引檔案失敗 ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * 更新檔案索引
   */
  async updateFile(filePath: string): Promise<void> {
    try {
      // 檢查檔案是否存在
      await fs.access(filePath);

      // 如果檔案已在索引中，先移除
      if (this.isIndexed(filePath)) {
        await this.removeFile(filePath);
      }

      // 重新索引檔案
      await this.indexFile(filePath);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      throw new Error(`更新檔案索引失敗 ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * 移除檔案索引
   */
  async removeFile(filePath: string): Promise<void> {
    // 從符號索引中移除
    await this.symbolIndex.removeFileSymbols(filePath);

    // 從檔案索引中移除
    await this.fileIndex.removeFile(filePath);
  }

  /**
   * 根據名稱查找符號
   */
  async findSymbol(name: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    // 檢查是否已被釋放
    if (this._disposed) {
      throw new Error('索引引擎已被釋放');
    }

    // 如果尚未索引，返回空結果
    if (!this._indexed) {
      return [];
    }

    if (typeof name !== 'string') {
      throw new Error('查詢必須是字串');
    }
    return await this.symbolIndex.findSymbol(name, options);
  }

  /**
   * 根據類型查找符號
   */
  async findSymbolByType(type: SymbolType, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    return await this.symbolIndex.findSymbolsByType(type, options);
  }

  /**
   * 模糊搜尋符號
   */
  async searchSymbols(pattern: string, options?: SearchOptions): Promise<SymbolSearchResult[]> {
    return await this.symbolIndex.searchSymbols(pattern, options);
  }

  /**
   * 根據副檔名查找檔案
   */
  findFilesByExtension(ext: string): readonly FileInfo[] {
    return this.fileIndex.findFilesByExtension(ext);
  }

  /**
   * 檢查檔案是否已被索引
   */
  isIndexed(filePath: string): boolean {
    return this.fileIndex.isFileIndexed(filePath);
  }

  /**
   * 取得索引統計資訊
   */
  async getStats(): Promise<IndexStats> {
    // 檢查是否已被釋放
    if (this._disposed) {
      throw new Error('索引引擎已被釋放');
    }

    // 如果尚未索引，返回初始狀態
    if (!this._indexed) {
      return {
        totalFiles: 0,
        indexedFiles: 0,
        totalSymbols: 0,
        totalDependencies: 0,
        lastUpdated: new Date(),
        indexSize: 0
      };
    }

    const fileStats = this.fileIndex.getStats();
    const symbolStats = this.symbolIndex.getStats();

    return {
      totalFiles: fileStats.totalFiles,
      indexedFiles: fileStats.indexedFiles,
      totalSymbols: symbolStats.totalSymbols,
      totalDependencies: fileStats.totalDependencies,
      lastUpdated: fileStats.lastUpdated,
      indexSize: fileStats.indexSize
    };
  }

  /**
   * 取得配置
   */
  getConfig(): IndexConfig {
    return { ...this.config };
  }

  /**
   * 清空所有索引
   */
  async clear(): Promise<void> {
    await this.fileIndex.clear();
    await this.symbolIndex.clear();
    this._indexed = false;
  }

  /**
   * 批次索引檔案
   */
  private async batchIndexFiles(files: string[], options: BatchIndexOptions): Promise<void> {
    const { concurrency, batchSize, progressCallback } = options;
    const totalFiles = files.length;
    let processedFiles = 0;
    const errors: string[] = [];

    // 將檔案分批處理
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // 並行處理當前批次
      const promises = batch.map(async (file) => {
        try {
          await this.indexFile(file);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知錯誤';
          errors.push(`${file}: ${errorMessage}`);
        } finally {
          processedFiles++;

          // 回報進度
          progressCallback({
            totalFiles,
            processedFiles,
            currentFile: file,
            percentage: calculateProgress(processedFiles, totalFiles),
            errors: [...errors]
          });
        }
      });

      // 限制並行數量
      const chunks = [];
      for (let j = 0; j < promises.length; j += concurrency) {
        chunks.push(promises.slice(j, j + concurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(chunk);
      }
    }

    if (errors.length > 0) {
      console.warn(`索引過程中發生 ${errors.length} 個錯誤:`);
      errors.forEach(error => console.warn(`  ${error}`));
    }
  }

  /**
   * 從檔案統計資訊建立 FileInfo
   */
  private async createFileInfoFromStat(filePath: string, stat: Stats): Promise<FileInfo> {
    const extension = path.extname(filePath);
    const language = this.getLanguageFromExtension(extension);

    // 計算檔案 checksum
    const content = await fs.readFile(filePath, 'utf-8');
    const checksum = createHash('sha256').update(content).digest('hex');

    return createFileInfo(
      filePath,
      stat.mtime,
      stat.size,
      extension,
      language,
      checksum
    );
  }

  /**
   * 根據副檔名判斷語言
   */
  private getLanguageFromExtension(extension: string): string | undefined {
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.swift': 'swift',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust'
    };

    return languageMap[extension];
  }

  /**
   * 檢查檔案是否需要重新索引
   */
  async needsReindexing(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return this.fileIndex.needsReindexing(filePath, stat.mtime);
    } catch (error) {
      // 檔案不存在或無法存取，但如果在索引中則需要標記為需要重新索引（用於清理）
      return this.fileIndex.hasFile(filePath);
    }
  }

  /**
   * 取得檔案的解析錯誤
   */
  getFileParseErrors(filePath: string): readonly string[] {
    return this.fileIndex.getFileParseErrors(filePath);
  }

  /**
   * 檢查檔案是否有解析錯誤
   */
  hasFileParseErrors(filePath: string): boolean {
    return this.fileIndex.hasFileParseErrors(filePath);
  }

  /**
   * 取得所有已索引的檔案
   */
  getAllIndexedFiles(): readonly FileInfo[] {
    return this.fileIndex.getAllFiles();
  }

  /**
   * 根據語言查找檔案
   */
  findFilesByLanguage(language: string): readonly FileInfo[] {
    return this.fileIndex.findFilesByLanguage(language);
  }

  /**
   * 取得檔案的所有符號
   */
  async getFileSymbols(filePath: string): Promise<readonly Symbol[]> {
    return await this.symbolIndex.getFileSymbols(filePath);
  }

  /**
   * 釋放資源
   */
  dispose(): void {
    if (!this._disposed) {
      this.clear();
      this._disposed = true;
    }
    // 可以在這裡加入其他清理邏輯
  }

  /**
   * 檢查索引是否已被釋放或尚未建立
   */
  private checkDisposed(): void {
    if (this._disposed || !this._indexed) {
      throw new Error('索引尚未建立');
    }
  }
}