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
    private readonly indexFileSingleThread: (filePath: string) => Promise<void>
  ) {}

  /**
   * 批次索引檔案
   * - 生產環境：使用 Worker Pool 多執行緒解析
   * - 測試環境：使用單執行緒逐檔解析（避免 worker 清理問題）
   */
  async batchIndexFiles(files: string[], config: IndexConfig, options: BatchIndexOptions): Promise<void> {
    const { batchSize, progressCallback } = options;
    const totalFiles = files.length;
    let processedFiles = 0;
    const errors: string[] = [];

    // 測試環境：單執行緒逐檔解析
    if (!this.parserPool) {
      logger.verbose('indexer', `Indexing ${totalFiles} files (single-thread)`);
      for (const filePath of files) {
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
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // 1. 準備解析任務（主執行緒讀取檔案）
      const taskMap = await this.prepareParseTasks(batch, config);

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
  private async prepareParseTasks(files: string[], config: IndexConfig): Promise<Map<string, {
    task: ParseTask;
    fileInfo: FileInfo;
    content: string;
  }>> {
    const taskMap = new Map<string, { task: ParseTask; fileInfo: FileInfo; content: string }>();

    await Promise.all(files.map(async (filePath) => {
      try {
        const stat = await this.fileSystem.getStats(filePath);

        // 跳過大檔案
        if (stat.size > config.maxFileSize) {
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
    // 先將檔案加入索引（與單執行緒 indexFile 一致：先 addFile 再判斷錯誤），
    // 確保解析失敗的檔案也會留在索引中（帶 parseErrors），而非被靜默丟棄
    await this.fileIndex.addFile(fileInfo);

    // 處理解析錯誤
    if (result.errors.length > 0) {
      await this.fileIndex.setFileParseErrors(result.filePath, result.errors);
      return;
    }

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
   * 從檔案統計資訊建立 FileInfo
   */
  async createFileInfoFromStat(filePath: string, stat: FileStats): Promise<FileInfo> {
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
