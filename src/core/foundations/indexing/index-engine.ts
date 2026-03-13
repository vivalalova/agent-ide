/**
 * 索引引擎實作
 * 程式碼索引系統的核心引擎，協調檔案索引和符號索引
 */

import * as path from 'path';
import { createHash } from 'crypto';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  ParserWorkerPool,
  createParserWorkerPool,
  type ParseTask,
  type ParseResult
} from '@infrastructure/worker-pool/index.js';

import type { Symbol, SymbolType } from '@shared/types/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import type {
  IndexConfig,
  IndexStats,
  FileInfo,
  FileIndexEntry,
  SymbolSearchResult,
  SearchOptions,
  BatchIndexOptions
} from './types.js';
import {
  createFileInfo,
  shouldIndexFile,
  calculateProgress
} from './types.js';

import { FileIndex } from './file-index.js';
import { SymbolIndex } from './symbol-index.js';
import { ParserRegistry } from '@infrastructure/parser/index.js';
import { initializeDefaultParsers } from '@infrastructure/parser/index.js';

/**
 * 索引引擎類別
 * 協調檔案索引、符號索引和解析器的核心引擎
 */
export class IndexEngine {
  private readonly config: IndexConfig;
  private readonly fileIndex: FileIndex;
  private readonly symbolIndex: SymbolIndex;
  private readonly parserRegistry: ParserRegistry;
  private readonly fileSystem: IFileSystem;
  /** Worker Pool（測試環境為 null，使用單執行緒解析） */
  private readonly parserPool: ParserWorkerPool | null;
  private _disposed = false;
  private _indexed = false;

  constructor(config: IndexConfig, fileSystem: IFileSystem) {
    // 驗證配置
    this.validateConfig(config);

    this.config = config;
    this.fileIndex = new FileIndex(config);
    this.symbolIndex = new SymbolIndex();
    this.fileSystem = fileSystem;

    // 檢查 ParserRegistry 是否已被清理，如果是則重新建立實例
    const registry = ParserRegistry.getInstance();
    if (registry.isDisposed) {
      ParserRegistry.resetInstance();
      this.parserRegistry = ParserRegistry.getInstance();
    } else {
      this.parserRegistry = registry;
    }

    // 確保所有內建 Parser 已註冊（透過 infrastructure 層初始化）
    initializeDefaultParsers(this.parserRegistry);

    // 建立 Worker Pool（多執行緒解析）
    // 測試環境禁用 Worker Pool，避免 worker 清理問題
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    this.parserPool = isTestEnv ? null : createParserWorkerPool({
      maxThreads: this.config.maxConcurrency
    });
  }

  /**
   * 驗證配置
   */
  private validateConfig(config: Partial<IndexConfig>): void {
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
  async indexProject(projectPath?: string): Promise<void> {
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
      const stat = await this.fileSystem.getStats(workspacePath);
      if (!stat.isDirectory) {
        throw new Error('索引路徑必須是目錄');
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error('路徑不存在');
      }
      throw error;
    }

    await this.indexDirectory(workspacePath);
    this._indexed = true;
  }

  /**
   * 獲取有效的排除模式
   * 整合 config 設定和所有 parser 的預設排除模式
   */
  private getEffectiveExcludePatterns(): string[] {
    // 取得 config 的排除模式
    const configPatterns = [...this.config.excludePatterns];

    // 取得所有註冊 parser 的排除模式
    const registeredParsers = this.parserRegistry.listParsers();
    const parserPatterns: string[] = [];

    for (const parserInfo of registeredParsers) {
      try {
        // 檢查 parser 是否支援 getDefaultExcludePatterns 方法
        if (parserInfo.plugin.getDefaultExcludePatterns) {
          const patterns = parserInfo.plugin.getDefaultExcludePatterns();
          parserPatterns.push(...patterns);
        }
      } catch {
        // 如果 parser 不支援此方法，忽略錯誤
        diagnostics.warn('index-engine', 'ANALYSIS_DEGRADED', `Parser ${parserInfo.name} does not support getDefaultExcludePatterns`);
      }
    }

    // 合併並去重
    const allPatterns = [...configPatterns, ...parserPatterns];
    return [...new Set(allPatterns)];
  }

  /**
   * 索引目錄
   */
  async indexDirectory(dirPath: string): Promise<void> {
    try {
      const stat = await this.fileSystem.getStats(dirPath);
      if (!stat.isDirectory) {
        throw new Error(`路徑不是有效的目錄: ${dirPath}`);
      }
    } catch {
      throw new Error(`無法存取目錄: ${dirPath}`);
    }

    // 使用 glob 模式查找檔案
    const includePatterns = this.config.includeExtensions.map(ext =>
      `**/*${ext}`
    );

    // 使用整合後的排除模式
    const effectiveExcludePatterns = this.getEffectiveExcludePatterns();

    const allFiles: string[] = [];
    for (const pattern of includePatterns) {
      const files = await this.fileSystem.glob(pattern, {
        cwd: dirPath,
        ignore: effectiveExcludePatterns,
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
      progressCallback: (_progress) => {
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
   * 使用 Promise.all 批次處理，避免 N+1 問題
   */
  private async cleanupStaleIndexEntries(currentFiles: string[]): Promise<void> {
    // 取得所有已索引的檔案
    const allIndexedFiles = this.fileIndex.getAllFiles();
    const currentFilesSet = new Set(currentFiles);

    // 找出已索引但不在當前檔案列表中的檔案
    const staleFiles = allIndexedFiles
      .map(fileInfo => fileInfo.filePath)
      .filter(filePath => !currentFilesSet.has(filePath));

    // 批次移除過期檔案（使用已優化的 removeFileSymbols）
    await Promise.all(staleFiles.map(async stalePath => {
      await this.symbolIndex.removeFileSymbols(stalePath);
      await this.fileIndex.removeFile(stalePath);
    }));
  }

  /**
   * 索引單一檔案
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      const stat = await this.fileSystem.getStats(filePath);

      // 檢查檔案大小，超過限制則跳過
      if (stat.size > this.config.maxFileSize) {
        // 靜默跳過大檔案，不報錯
        return;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;

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
      const exists = await this.fileSystem.exists(filePath);
      if (!exists) {
        throw new Error('檔案不存在');
      }

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
   * 獲取所有符號
   */
  async getAllSymbols(): Promise<SymbolSearchResult[]> {
    // 檢查是否已被釋放
    if (this._disposed) {
      throw new Error('索引引擎已被釋放');
    }

    // 如果尚未索引，返回空結果
    if (!this._indexed) {
      return [];
    }

    return await this.symbolIndex.getAllSymbols();
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
   * - 生產環境：使用 Worker Pool 多執行緒解析
   * - 測試環境：使用單執行緒逐檔解析（避免 worker 清理問題）
   */
  private async batchIndexFiles(files: string[], options: BatchIndexOptions): Promise<void> {
    const { batchSize, progressCallback } = options;
    const totalFiles = files.length;
    let processedFiles = 0;
    const errors: string[] = [];

    // 測試環境：單執行緒逐檔解析
    if (!this.parserPool) {
      for (const filePath of files) {
        try {
          await this.indexFile(filePath);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知錯誤';
          errors.push(`${filePath}: ${errorMessage}`);
        }

        processedFiles++;
        progressCallback({
          totalFiles,
          processedFiles,
          currentFile: filePath,
          percentage: calculateProgress(processedFiles, totalFiles),
          errors: [...errors]
        });
      }

      if (errors.length > 0) {
        diagnostics.warn('index-engine', 'ANALYSIS_DEGRADED', `索引過程中發生 ${errors.length} 個錯誤: ${errors.join(', ')}`);
      }
      return;
    }

    // 生產環境：Worker Pool 多執行緒解析
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // 1. 準備解析任務（主執行緒讀取檔案）
      const taskMap = await this.prepareParseTasks(batch);

      // 2. Worker Pool 並行解析（CPU 密集操作在 worker 執行緒）
      const tasks = Array.from(taskMap.values()).map(t => t.task);
      const parseResults = await this.parserPool.parseFiles(tasks);

      // 3. 主執行緒更新索引（使用 filePath 匹配）
      for (const result of parseResults) {
        const prepared = taskMap.get(result.filePath);
        if (!prepared) {
          errors.push(`${result.filePath}: 找不到對應的準備任務`);
          continue;
        }

        try {
          await this.updateIndexFromParseResult(result, prepared.fileInfo, prepared.content);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知錯誤';
          errors.push(`${result.filePath}: ${errorMessage}`);
        }

        processedFiles++;
        progressCallback({
          totalFiles,
          processedFiles,
          currentFile: result.filePath,
          percentage: calculateProgress(processedFiles, totalFiles),
          errors: [...errors]
        });
      }
    }

    if (errors.length > 0) {
      diagnostics.warn('index-engine', 'ANALYSIS_DEGRADED', `索引過程中發生 ${errors.length} 個錯誤: ${errors.join(', ')}`);
    }
  }

  /**
   * 準備解析任務
   * 在主執行緒讀取檔案內容和 stat，傳給 worker 解析
   * 回傳 Map 以 filePath 為 key，確保與 parseResults 正確對應
   */
  private async prepareParseTasks(files: string[]): Promise<Map<string, {
    task: ParseTask;
    fileInfo: FileInfo;
    content: string;
  }>> {
    const taskMap = new Map<string, { task: ParseTask; fileInfo: FileInfo; content: string }>();

    await Promise.all(files.map(async (filePath) => {
      try {
        const stat = await this.fileSystem.getStats(filePath);

        // 跳過大檔案
        if (stat.size > this.config.maxFileSize) {
          return;
        }

        const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
        const fileInfo = await this.createFileInfoFromContent(filePath, stat, content);

        taskMap.set(filePath, {
          task: { filePath, content },
          fileInfo,
          content
        });
      } catch (error) {
        diagnostics.warn('index-engine', 'FILE_READ_ERROR', `Skipping unreadable file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      }
    }));

    return taskMap;
  }

  /**
   * 從解析結果更新索引
   */
  private async updateIndexFromParseResult(
    result: ParseResult,
    fileInfo: FileInfo,
    _content: string
  ): Promise<void> {
    // 處理解析錯誤
    if (result.errors.length > 0) {
      await this.fileIndex.setFileParseErrors(result.filePath, result.errors);
      return;
    }

    // 新增到檔案索引
    await this.fileIndex.addFile(fileInfo);

    // 更新檔案索引的符號和依賴
    await this.fileIndex.setFileSymbols(result.filePath, result.symbols);
    await this.fileIndex.setFileDependencies(result.filePath, result.dependencies);

    // 新增符號到符號索引
    await this.symbolIndex.addSymbols(result.symbols, fileInfo);
  }

  /**
   * 從內容建立 FileInfo（避免重複讀取檔案）
   */
  private async createFileInfoFromContent(
    filePath: string,
    stat: Awaited<ReturnType<typeof this.fileSystem.getStats>>,
    content: string
  ): Promise<FileInfo> {
    const extension = path.extname(filePath);
    const language = this.getLanguageFromExtension(extension);
    const checksum = createHash('sha256').update(content).digest('hex');

    return createFileInfo(
      filePath,
      stat.modifiedTime,
      stat.size,
      extension,
      language,
      checksum
    );
  }

  /**
   * 從檔案統計資訊建立 FileInfo
   */
  private async createFileInfoFromStat(filePath: string, stat: Awaited<ReturnType<typeof this.fileSystem.getStats>>): Promise<FileInfo> {
    const extension = path.extname(filePath);
    const language = this.getLanguageFromExtension(extension);

    // 計算檔案 checksum
    const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
    const checksum = createHash('sha256').update(content).digest('hex');

    return createFileInfo(
      filePath,
      stat.modifiedTime,
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
      const stat = await this.fileSystem.getStats(filePath);
      return this.fileIndex.needsReindexing(filePath, stat.modifiedTime);
    } catch {
      // graceful-degradation: 檔案已被刪除時仍需標記重新索引以清理索引條目
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
   * 取得當前 fileIndex 的快照（用於快取儲存）
   */
  snapshot(): { fileEntries: Map<string, FileIndexEntry> } {
    // 複製一份，避免外部修改影響內部狀態
    return {
      fileEntries: new Map(this.fileIndex.getAllEntries())
    };
  }

  /**
   * 從快取資料水合引擎（跳過 indexProject）
   */
  hydrate(fileEntries: Map<string, FileIndexEntry>): void {
    this.fileIndex.hydrateEntries(fileEntries);
    this.symbolIndex.hydrateFromFileEntries(fileEntries);
    this._indexed = true;
  }

  /**
   * 釋放資源
   */
  dispose(): void {
    if (!this._disposed) {
      this.clear();
      this._disposed = true;

      // 釋放 Worker Pool 資源（非阻塞，測試環境無 pool）
      if (this.parserPool) {
        this.parserPool.destroy().catch(() => {
          // graceful-degradation: dispose 時 pool 可能已銷毀，忽略銷毀失敗
        });
      }
    }
  }

}
