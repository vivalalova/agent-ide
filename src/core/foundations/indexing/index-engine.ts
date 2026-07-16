/**
 * 索引引擎實作
 * 程式碼索引系統的核心引擎，協調檔案索引和符號索引
 */

import * as path from 'path';
import { createHash } from 'crypto';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import {
  ParserWorkerPool,
  createParserWorkerPool
} from '@infrastructure/worker-pool/index.js';

import type { Dependency, Symbol, SymbolType } from '@shared/types/index.js';
import type {
  IndexConfig,
  IndexStats,
  FileInfo,
  FileIndexEntry,
  SymbolSearchResult,
  SearchOptions
} from './types.js';
import { shouldIndexFile } from './types.js';

import { FileIndex } from './file-index.js';
import { SymbolIndex } from './symbol-index.js';
import { IndexBatchParser } from './index-batch-parser.js';
import { ParserModuleLifecycle } from './index-parser-lifecycle.js';
import {
  ParserRegistry,
  initializeDefaultParsers
} from '@infrastructure/parser/index.js';

/**
 * 索引引擎類別
 * 協調檔案索引、符號索引和解析器的核心引擎
 */
export class IndexEngine {
  private config: IndexConfig;
  private readonly fileIndex: FileIndex;
  private readonly symbolIndex: SymbolIndex;
  private readonly parserRegistry: ParserRegistry;
  private readonly fileSystem: IFileSystem;
  /** Worker Pool（測試環境為 null，使用單執行緒解析） */
  private readonly parserPool: ParserWorkerPool | null;
  private readonly parserModuleLifecycle: ParserModuleLifecycle;
  private readonly batchParser: IndexBatchParser;
  private _disposed = false;
  private _indexed = false;
  /**
   * 按（已 canonicalize 的）檔案路徑序列化單檔索引操作。
   * 同一路徑的多個 indexFile 呼叫若不序列化，較慢的舊操作可能在較新操作之後才完成，
   * 以「完成順序」而非「發起順序」覆蓋索引條目，讓較新的結果被舊結果蓋掉。
   * 用鏈式 Promise 讓同一路徑的操作依發起順序排隊執行，保證最後完成的必是最後發起的。
   */
  private readonly indexFileQueue = new Map<string, Promise<unknown>>();
  /**
   * 每路徑索引寫入互斥（batch 與 indexFile 共用）。
   * 僅包住「check gen → remove → set」臨界區，避免 remove 後被並行寫入半套／空索引。
   */
  private readonly pathWriteQueue = new Map<string, Promise<unknown>>();
  /**
   * 每路徑索引 generation：batch 與 indexFile 共用。
   * 寫入前若 generation 已前進，代表有更新的索引操作發起 → 丟棄過期結果，
   * 避免 worker batch 慢結果覆蓋較新的 indexFile 結果。
   */
  private readonly indexGeneration = new Map<string, number>();

  constructor(config: IndexConfig, fileSystem: IFileSystem) {
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

    // 驗證配置
    this.validateConfig(config);

    this.parserModuleLifecycle = new ParserModuleLifecycle(this.parserRegistry);
    this.config = this.mergeRegisteredParserExtensions(config);
    this.fileIndex = new FileIndex(this.config);
    this.symbolIndex = new SymbolIndex();
    this.fileSystem = fileSystem;

    // 建立 Worker Pool（多執行緒解析）
    // 測試環境禁用 Worker Pool，避免 worker 清理問題
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    this.parserPool = isTestEnv ? null : createParserWorkerPool({
      maxThreads: this.config.maxConcurrency,
      parserModulePaths: this.config.parserModulePaths ?? []
    });

    this.batchParser = new IndexBatchParser(
      this.fileSystem,
      this.parserRegistry,
      this.parserPool,
      this.fileIndex,
      this.symbolIndex,
      (filePath: string) => this.indexFile(filePath),
      {
        resolvePath: (filePath: string) => this.resolvePath(filePath),
        beginGeneration: (filePath: string) => this.beginIndexGeneration(filePath),
        isCurrentGeneration: (filePath: string, generation: number) =>
          this.isCurrentIndexGeneration(filePath, generation),
        runExclusiveWrite: <T>(filePath: string, fn: () => Promise<T>) =>
          this.runPathWriteExclusive(filePath, fn)
      }
    );
  }

  /**
   * 為路徑推進 generation，回傳新 generation 編號。
   * 路徑須已 canonicalize（或由此方法內 resolve）。
   */
  private beginIndexGeneration(filePath: string): number {
    const resolved = this.resolvePath(filePath);
    const next = (this.indexGeneration.get(resolved) ?? 0) + 1;
    this.indexGeneration.set(resolved, next);
    return next;
  }

  /**
   * 檢查 generation 是否仍為該路徑最新（未過期）
   */
  private isCurrentIndexGeneration(filePath: string, generation: number): boolean {
    const resolved = this.resolvePath(filePath);
    return this.indexGeneration.get(resolved) === generation;
  }

  /**
   * 同一 path 的索引寫入互斥（Promise 鏈）。
   * batch updateIndexFromParseResult 與 indexFile 的 remove/set 臨界區共用此鎖。
   */
  private runPathWriteExclusive<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const resolved = this.resolvePath(filePath);
    const previous = this.pathWriteQueue.get(resolved) ?? Promise.resolve();
    const run = previous.then(fn, fn);
    // 佇列本身不得因單次寫入失敗而卡死後續者
    this.pathWriteQueue.set(resolved, run.then(() => undefined, () => undefined));
    return run;
  }

  private mergeRegisteredParserExtensions(config: IndexConfig): IndexConfig {
    return this.parserModuleLifecycle.mergeRegisteredParserExtensions(config);
  }

  async initializeConfiguredParserModules(): Promise<void> {
    this.config = await this.parserModuleLifecycle.initializeConfigured(this.config);
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
   * public：cache key 計算需要與索引實際使用的排除集合一致（SSOT），見 cached-index-engine.ts
   */
  getEffectiveExcludePatterns(): string[] {
    // 取得 config 的排除模式
    const configPatterns = [...this.config.excludePatterns];

    // 取得所有註冊 parser 的排除模式
    const registeredParsers = this.parserRegistry.listParsers();
    const parserPatterns: string[] = [];

    for (const parserInfo of registeredParsers) {
      // 檢查 parser 是否支援 getDefaultExcludePatterns 方法；
      // 方法存在但執行時拋錯（非「不支援」，是真的執行失敗）不得吞下——
      // 吞下會讓 indexDirectory 在缺少該 parser 排除規則的情況下靜默繼續，
      // 索引到本該被排除的檔案（如 generated/**），依 fast-fail 原則直接讓例外往上拋
      if (parserInfo.plugin.getDefaultExcludePatterns) {
        const patterns = parserInfo.plugin.getDefaultExcludePatterns();
        parserPatterns.push(...patterns);
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

    await this.initializeConfiguredParserModules();

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
    await this.batchParser.batchIndexFiles(filesToIndex, this.config, {
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
   * 將任意輸入路徑 canonicalize 成絕對、正規化後的路徑，作為 FileIndex/SymbolIndex
   * 的唯一 key 形式。若無此步驟，同一檔案以絕對路徑（如 indexDirectory 內部的 glob
   * 結果）與相對路徑（如外部呼叫 updateFile('src/a.ts')）兩種形式索引，會在底層 Map
   * 產生兩筆各自獨立的條目，remove/update 只命中其中一筆，留下另一筆 stale 資料。
   */
  private resolvePath(filePath: string): string {
    return path.isAbsolute(filePath)
      ? path.normalize(filePath)
      : path.resolve(this.config.workspacePath, filePath);
  }

  /**
   * 索引單一檔案
   * 依（canonicalize 後的）檔案路徑序列化：同一路徑的並行呼叫依發起順序排隊執行，
   * 避免較慢的舊操作在較新操作之後才完成而覆蓋新結果（見 indexFileQueue 註解）。
   */
  async indexFile(filePathInput: string): Promise<void> {
    const filePath = this.resolvePath(filePathInput);
    const previous = this.indexFileQueue.get(filePath) ?? Promise.resolve();
    const run = previous.then(
      () => this.indexFileSerialized(filePath),
      () => this.indexFileSerialized(filePath)
    );
    // 佇列本身不得因單次操作失敗而卡死後續排隊者，故另存一份「必為 resolved」的鏈；
    // 呼叫端拿到的仍是 run，失敗會如常拋出。
    this.indexFileQueue.set(filePath, run.catch(() => undefined));
    return run;
  }

  private async indexFileSerialized(filePath: string): Promise<void> {
    // 推進 generation：與 batch 路徑共用，後到的寫入可讓先前 batch 結果過期丟棄
    const generation = this.beginIndexGeneration(filePath);
    // 讀檔／parse 成功並進入寫入臨界區前為 false；僅在 false 時的失敗需清 stale
    // （parse 失敗路徑在臨界區內已 removeFileSymbols + setFileParseErrors，不得再整筆刪除）
    let indexWriteStarted = false;

    try {
      await this.initializeConfiguredParserModules();

      const stat = await this.fileSystem.getStats(filePath);

      // 檢查檔案大小，超過限制則跳過
      if (stat.size > this.config.maxFileSize) {
        // 靜默跳過大檔案；若先前已有索引須清除 stale。經寫入鎖 + gen 檢查，
        // 避免與並行 batch/indexFile 交錯抹掉較新結果。
        await this.runPathWriteExclusive(filePath, async () => {
          if (!this.isCurrentIndexGeneration(filePath, generation)) {
            return;
          }
          if (this.fileIndex.hasFile(filePath)) {
            await this.symbolIndex.removeFileSymbols(filePath);
            await this.fileIndex.removeFile(filePath);
          }
        });
        return;
      }

      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;

      // 讀檔成功後、昂貴 parse 前可先丟棄過期（優化；真正的安全閘在寫入鎖內）
      if (!this.isCurrentIndexGeneration(filePath, generation)) {
        return;
      }

      // checksum 必須從同一份已讀取的 content 計算，不得另外獨立讀取一次檔案——
      // 否則兩次讀取之間檔案若被改寫，symbols 會來自版本 A、checksum 卻標記版本 B，
      // 讓依賴 checksum 判斷 staleness 的機制失真
      const fileInfo = await this.batchParser.createFileInfoFromContent(filePath, stat, content);

      // 解析在寫入鎖外執行，縮短臨界區；結果僅在鎖內 check gen 後一次寫入
      let parseErrorMessage: string | undefined;
      let symbols: Symbol[] = [];
      let dependencies: Dependency[] = [];

      try {
        const parser = this.parserRegistry.getParser(path.extname(filePath));
        if (!parser) {
          throw new Error(`找不到適合的解析器: ${filePath}`);
        }

        const ast = await parser.parse(content, filePath);
        symbols = await parser.extractSymbols(ast);
        dependencies = await parser.extractDependencies(ast);
      } catch (parseError) {
        parseErrorMessage = parseError instanceof Error ? parseError.message : '未知解析錯誤';
      }

      // 寫入臨界區：check gen → remove → set；過期則整段不碰索引
      await this.runPathWriteExclusive(filePath, async () => {
        if (!this.isCurrentIndexGeneration(filePath, generation)) {
          return;
        }

        await this.fileIndex.addFile(fileInfo);
        await this.symbolIndex.removeFileSymbols(filePath);
        indexWriteStarted = true;
        this._indexed = true;

        if (parseErrorMessage !== undefined) {
          await this.fileIndex.setFileParseErrors(filePath, [parseErrorMessage]);
          return;
        }

        await this.fileIndex.setFileSymbols(filePath, symbols);
        await this.fileIndex.setFileDependencies(filePath, dependencies);
        await this.symbolIndex.addSymbols(symbols, fileInfo);
      });

      if (parseErrorMessage !== undefined && indexWriteStarted) {
        throw new Error(`解析檔案失敗 ${filePath}: ${parseErrorMessage}`);
      }

    } catch (error) {
      // 讀檔／stat 失敗（尚未開始覆寫索引）時清除 stale：EACCES 等不得 silently
      // 保留舊符號當「索引仍有效」，否則呼叫端吞錯會把 stale 當成功。
      // 經寫入鎖 + gen 檢查，避免與並行較新 gen 交錯抹掉較新索引。
      await this.runPathWriteExclusive(filePath, async () => {
        if (!this.isCurrentIndexGeneration(filePath, generation)) return;
        if (!indexWriteStarted && this.fileIndex.hasFile(filePath)) {
          await this.symbolIndex.removeFileSymbols(filePath);
          await this.fileIndex.removeFile(filePath);
        }
      });
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      throw new Error(`索引檔案失敗 ${filePath}: ${errorMessage}`);
    }
  }

  /**
   * 更新檔案索引
   */
  async updateFile(filePathInput: string): Promise<void> {
    try {
      const filePath = this.resolvePath(filePathInput);

      // 檢查檔案是否存在
      const exists = await this.fileSystem.exists(filePath);
      if (!exists) {
        throw new Error('檔案不存在');
      }

      // 重新索引檔案
      await this.indexFile(filePath);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知錯誤';
      throw new Error(`更新檔案索引失敗 ${filePathInput}: ${errorMessage}`);
    }
  }

  /**
   * 移除檔案索引
   */
  async removeFile(filePathInput: string): Promise<void> {
    const filePath = this.resolvePath(filePathInput);

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
    return this.fileIndex.isFileIndexed(this.resolvePath(filePath));
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
   * 檢查檔案是否需要重新索引
   * 除 size/mtime 外另帶目前內容的 checksum 一併判斷：檔案若被替換成不同內容但
   * size 剛好相同、mtime 也剛好被保留（如 touch -m 還原時間戳），單靠 size/mtime
   * 無法偵測出內容已變，checksum 不一致時視為權威證據，強制判定需要重新索引。
   */
  async needsReindexing(filePathInput: string): Promise<boolean> {
    const filePath = this.resolvePath(filePathInput);
    try {
      const stat = await this.fileSystem.getStats(filePath);
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      const checksum = createHash('sha256').update(content).digest('hex');
      return this.fileIndex.needsReindexing(filePath, stat.modifiedTime, stat.size, checksum);
    } catch {
      // graceful-degradation: 檔案已被刪除時仍需標記重新索引以清理索引條目
      return this.fileIndex.hasFile(filePath);
    }
  }

  /**
   * 取得檔案的解析錯誤
   */
  getFileParseErrors(filePath: string): readonly string[] {
    return this.fileIndex.getFileParseErrors(this.resolvePath(filePath));
  }

  /**
   * 檢查檔案是否有解析錯誤
   */
  hasFileParseErrors(filePath: string): boolean {
    return this.fileIndex.hasFileParseErrors(this.resolvePath(filePath));
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
    return await this.symbolIndex.getFileSymbols(this.resolvePath(filePath));
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
    this.disposeAsync().catch(() => {
      // graceful-degradation: keep the legacy synchronous dispose contract.
    });
  }

  async disposeAsync(): Promise<void> {
    if (!this._disposed) {
      this._disposed = true;
      await this.clear();

      await Promise.all([
        this.parserPool
          ? this.parserPool.destroy().catch(() => undefined)
          : Promise.resolve(),
        this.disposeParserModules().catch(() => undefined)
      ]);
    }
  }

  private async disposeParserModules(): Promise<void> {
    await this.parserModuleLifecycle.dispose();
  }

}
