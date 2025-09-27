/**
 * 索引引擎實作
 * 程式碼索引系統的核心引擎，協調檔案索引和符號索引
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { createHash } from 'crypto';
import type { Stats } from 'fs';

import type { Symbol, SymbolType } from '../../shared/types';
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

import { FileIndex } from './file-index';
import { SymbolIndex } from './symbol-index';
import { ParserRegistry } from '../../infrastructure/parser';

/**
 * 索引引擎類別
 * 協調檔案索引、符號索引和解析器的核心引擎
 */
export class IndexEngine {
  private readonly config: IndexConfig;
  private readonly fileIndex: FileIndex;
  private readonly symbolIndex: SymbolIndex;
  private readonly parserRegistry: ParserRegistry;

  constructor(config: IndexConfig) {
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
  }

  /**
   * 索引整個專案
   */
  async indexProject(projectPath?: string): Promise<void> {
    const workspacePath = projectPath || this.config.workspacePath;
    
    try {
      const stat = await fs.stat(workspacePath);
      if (!stat.isDirectory()) {
        throw new Error(`路徑不是有效的目錄: ${workspacePath}`);
      }
    } catch (error) {
      throw new Error(`無法存取專案路徑: ${workspacePath}`);
    }

    await this.indexDirectory(workspacePath);
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
      `${dirPath}/**/*${ext}`
    );

    const allFiles: string[] = [];
    for (const pattern of includePatterns) {
      const files = await glob(pattern, {
        ignore: this.config.excludePatterns.map(p => `${dirPath}/${p}`)
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
  }

  /**
   * 索引單一檔案
   */
  async indexFile(filePath: string): Promise<void> {
    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath, 'utf-8');
      
      // 檢查檔案大小
      if (stat.size > this.config.maxFileSize) {
        throw new Error(`檔案過大: ${filePath} (${stat.size} bytes)`);
      }

      const fileInfo = await this.createFileInfoFromStat(filePath, stat);
      
      // 新增到檔案索引
      await this.fileIndex.addFile(fileInfo);

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
        // 記錄解析錯誤但不阻止索引過程
        const errorMessage = parseError instanceof Error ? parseError.message : '未知解析錯誤';
        await this.fileIndex.setFileParseErrors(filePath, [errorMessage]);
        
        // 重新拋出錯誤讓調用者知道解析失敗
        throw parseError;
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
    return this.fileIndex.hasFile(filePath);
  }

  /**
   * 取得索引統計資訊
   */
  getStats(): IndexStats {
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
  }

  /**
   * 批次索引檔案
   */
  private async batchIndexFiles(files: string[], options: BatchIndexOptions): Promise<void> {
    const { concurrency, batchSize, progressCallback } = options;
    const totalFiles = files.length;
    let processedFiles = 0;
    let errors: string[] = [];

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
      // 檔案不存在或無法存取
      return false;
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
}