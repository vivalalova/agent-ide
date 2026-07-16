/**
 * 批次索引解析協調
 * 負責將檔案內容解析為 FileInfo/AST，並透過 Worker Pool 或單執行緒管線
 * 將解析結果寫入 FileIndex / SymbolIndex
 */

import * as path from 'path';
import { createHash } from 'crypto';
import type { IFileSystem, FileStats } from '@infrastructure/storage/index.js';
import {
  ParserWorkerPool,
  type ParseTask,
  type ParseResult
} from '@infrastructure/worker-pool/index.js';
import { getSourceLanguage } from '@shared/types/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { logger } from '@infrastructure/logging/index.js';
import type { ParserRegistry } from '@infrastructure/parser/index.js';
import type {
  IndexConfig,
  FileInfo,
  BatchIndexOptions
} from './types.js';
import {
  createFileInfo,
  calculateProgress
} from './types.js';
import type { FileIndex } from './file-index.js';
import type { SymbolIndex } from './symbol-index.js';

/**
 * batch 與 indexFile 共用的路徑／generation／寫入互斥協調介面。
 * worker batch 不走 indexFileQueue，需靠 generation 丟棄過期寫入；
 * 實際改索引必須經 runExclusiveWrite，與 indexFile 共用 per-path 鎖。
 */
export interface IndexBatchCoordination {
  /** 將路徑 canonicalize 成與 FileIndex key 一致的形式 */
  resolvePath: (filePath: string) => string;
  /** 推進 generation，回傳新編號 */
  beginGeneration: (filePath: string) => number;
  /** 寫入前確認 generation 仍為最新 */
  isCurrentGeneration: (filePath: string, generation: number) => boolean;
  /**
   * 同一 path 的索引寫入互斥（Promise 鏈）。
   * critical section 內才允許 remove/set；過期則整段不碰索引。
   */
  runExclusiveWrite: <T>(filePath: string, fn: () => Promise<T>) => Promise<T>;
}

/**
 * 批次索引解析器
 * - 生產環境：使用 Worker Pool 多執行緒解析
 * - 測試環境：使用單執行緒逐檔解析（避免 worker 清理問題）
 */
export class IndexBatchParser {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly parserRegistry: ParserRegistry,
    private readonly parserPool: ParserWorkerPool | null,
    private readonly fileIndex: FileIndex,
    private readonly symbolIndex: SymbolIndex,
    private readonly indexFileSingleThread: (filePath: string) => Promise<void>,
    private readonly coordination?: IndexBatchCoordination
  ) {}

  /**
   * 批次索引檔案
   * - 生產環境：使用 Worker Pool 多執行緒解析
   * - 測試環境：使用單執行緒逐檔解析（避免 worker 清理問題）
   */
  async batchIndexFiles(files: string[], config: IndexConfig, options: BatchIndexOptions): Promise<void> {
    const { batchSize, progressCallback } = options;
    // 統一 resolvePath，與 indexFile 寫入同一 key 空間
    const resolvedFiles = files.map(f =>
      this.coordination ? this.coordination.resolvePath(f) : f
    );
    const totalFiles = resolvedFiles.length;
    let processedFiles = 0;
    const errors: string[] = [];

    // 測試環境：單執行緒逐檔解析（走 indexFile 佇列，天然與 generation 合流）
    if (!this.parserPool) {
      logger.verbose('indexer', `Indexing ${totalFiles} files (single-thread)`);
      for (const filePath of resolvedFiles) {
        try {
          await this.indexFileSingleThread(filePath);
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

      logger.verbose('indexer', `Done: ${processedFiles} indexed, ${errors.length} errors`);
      if (errors.length > 0) {
        diagnostics.warn('index-engine', 'ANALYSIS_DEGRADED', `索引過程中發生 ${errors.length} 個錯誤: ${errors.join(', ')}`);
      }
      return;
    }

    // 生產環境：Worker Pool 多執行緒解析
    logger.verbose('indexer', `Indexing ${totalFiles} files (worker pool)`);
    for (let i = 0; i < resolvedFiles.length; i += batchSize) {
      const batch = resolvedFiles.slice(i, i + batchSize);

      // 1. 準備解析任務（主執行緒讀取檔案；同時取得 generation）
      const taskMap = await this.prepareParseTasks(batch, config);

      // 2. Worker Pool 並行解析（CPU 密集操作在 worker 執行緒）
      const tasks = Array.from(taskMap.values()).map(t => t.task);
      const parseResults = await this.parserPool.parseFiles(tasks);

      // 3. 主執行緒更新索引（使用 filePath 匹配；過期 generation 丟棄）
      for (const result of parseResults) {
        const prepared = taskMap.get(result.filePath);
        if (!prepared) {
          errors.push(`${result.filePath}: 找不到對應的準備任務`);
          continue;
        }

        try {
          await this.updateIndexFromParseResult(
            result,
            prepared.fileInfo,
            prepared.content,
            prepared.generation
          );
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
  private async prepareParseTasks(files: string[], config: IndexConfig): Promise<Map<string, {
    task: ParseTask;
    fileInfo: FileInfo;
    content: string;
    generation: number;
  }>> {
    const taskMap = new Map<string, {
      task: ParseTask;
      fileInfo: FileInfo;
      content: string;
      generation: number;
    }>();

    await Promise.all(files.map(async (filePath) => {
      // 在讀取前推進 generation，讓並行 indexFile 能讓本次 batch 結果過期
      const generation = this.coordination
        ? this.coordination.beginGeneration(filePath)
        : 0;

      /** 清除 stale 索引：必須經寫入鎖 + gen 檢查，禁與並行寫入交錯抹掉較新結果 */
      const clearStaleIfCurrent = async (): Promise<void> => {
        const clear = async (): Promise<void> => {
          if (
            this.coordination &&
            !this.coordination.isCurrentGeneration(filePath, generation)
          ) {
            return;
          }
          if (this.fileIndex.hasFile(filePath)) {
            await this.symbolIndex.removeFileSymbols(filePath);
            await this.fileIndex.removeFile(filePath);
          }
        };
        if (this.coordination) {
          await this.coordination.runExclusiveWrite(filePath, clear);
        } else {
          await clear();
        }
      };

      try {
        const stat = await this.fileSystem.getStats(filePath);

        // 跳過大檔案：若該路徑先前已有索引項目（檔案在兩次索引之間變大），
        // 必須連同清除舊條目，否則 stale 符號會繼續被查到（同型缺陷見 index-engine.ts 單檔索引路徑）
        if (stat.size > config.maxFileSize) {
          await clearStaleIfCurrent();
          return;
        }

        const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
        const fileInfo = await this.createFileInfoFromContent(filePath, stat, content);

        taskMap.set(filePath, {
          task: {
            filePath,
            content,
            parserModulePaths: config.parserModulePaths ?? []
          },
          fileInfo,
          content,
          generation
        });
      } catch (error) {
        // 讀檔失敗（EACCES 等）：若先前已有索引，清除 stale，不得 silently 保留舊符號
        await clearStaleIfCurrent();
        diagnostics.warn('index-engine', 'FILE_READ_ERROR', `Skipping unreadable file: ${error instanceof Error ? error.message : String(error)}`, filePath);
      }
    }));

    return taskMap;
  }

  /**
   * 從解析結果更新索引
   * @param generation 準備任務時取得的 generation；若已過期則丟棄寫入
   *
   * 寫入臨界區（check gen → remove → set）必須：
   * 1. 僅在確認 current generation 後才開始改索引
   * 2. 經 runExclusiveWrite 與 indexFile 互斥，避免 remove 後被並行覆蓋半套
   * 過期則整段不碰索引（禁先 remove 再因過期 return 留下空索引）。
   */
  private async updateIndexFromParseResult(
    result: ParseResult,
    fileInfo: FileInfo,
    _content: string,
    generation: number
  ): Promise<void> {
    const applyWrite = async (): Promise<void> => {
      // 臨界區入口：過期則整段不碰索引
      if (
        this.coordination &&
        !this.coordination.isCurrentGeneration(result.filePath, generation)
      ) {
        return;
      }

      // 先將檔案加入索引（與單執行緒 indexFile 一致：先 addFile 再判斷錯誤），
      // 確保解析失敗的檔案也會留在索引中（帶 parseErrors），而非被靜默丟棄
      await this.fileIndex.addFile(fileInfo);

      // 重新索引前先清除該檔案的舊符號，避免內容變更後留下 stale entry
      await this.symbolIndex.removeFileSymbols(result.filePath);

      // 處理解析錯誤（已在 current gen 臨界區內，必須寫完錯誤狀態，不得半套離開）
      if (result.errors.length > 0) {
        await this.fileIndex.setFileParseErrors(result.filePath, result.errors);
        return;
      }

      // 更新檔案索引的符號和依賴
      await this.fileIndex.setFileSymbols(result.filePath, result.symbols);
      await this.fileIndex.setFileDependencies(result.filePath, result.dependencies);

      // 新增符號到符號索引
      await this.symbolIndex.addSymbols(result.symbols, fileInfo);
    };

    if (this.coordination) {
      await this.coordination.runExclusiveWrite(result.filePath, applyWrite);
    } else {
      await applyWrite();
    }
  }

  /**
   * 從內容建立 FileInfo（避免重複讀取檔案）
   * public：單執行緒索引路徑（index-engine.ts indexFile）與批次路徑共用同一份已讀取的
   * content 計算 checksum，避免對同一檔案獨立讀取兩次造成 TOCTOU（parse 用的內容版本
   * 與 checksum 對應的內容版本不一致，corrupting 以 checksum 判斷 staleness 的機制）
   */
  async createFileInfoFromContent(
    filePath: string,
    stat: FileStats,
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
   * 根據副檔名判斷語言
   */
  private getLanguageFromExtension(extension: string): string | undefined {
    const parser = this.parserRegistry.getParser(extension);
    const parserLanguage = parser?.supportedLanguages[0];
    if (parserLanguage) {
      return parserLanguage;
    }

    const languageMap: Record<string, string> = {
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust'
    };

    return getSourceLanguage(extension) ?? languageMap[extension];
  }
}
