/**
 * 檔案操作工具類
 * 提供跨模組共用的檔案讀取和副檔名處理
 */

import { extname, join } from 'node:path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage } from '@shared/errors/index.js';
import {
  isJavaScriptSourceExtension,
  isTypeScriptSourceExtension
} from '@shared/types/index.js';
import { COMMON_EXCLUDE_DIR_NAMES } from '@shared/exclude-dirs.js';

/**
 * 檔案操作工具類
 * 封裝常用的檔案操作方法，避免各模組重複實作
 */
export class FileUtils {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly parserRegistry: ParserRegistry
  ) {}

  /**
   * 讀取檔案內容
   * @param filePath 檔案路徑
   * @returns 檔案內容，讀取失敗返回 null
   */
  async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      diagnostics.warn('file-utils', 'FILE_READ_ERROR', `Failed to read file: ${getErrorMessage(error)}`, filePath);
      return null;
    }
  }

  /**
   * 取得檔案副檔名
   * @param filePath 檔案路徑
   * @returns 副檔名（含點號），無副檔名返回空字串
   */
  static getFileExtension(filePath: string): string {
    // 比照 node:path.extname 語意：以 basename 為基準取副檔名，
    // 避免把含點號的父目錄（/project.v1/src/README）誤判成副檔名，
    // 且純隱藏檔名（.gitignore）視為無副檔名
    return extname(filePath);
  }

  /**
   * 取得對應的 Parser
   * @param filePath 檔案路徑
   * @returns Parser 實例，不支援的副檔名返回 undefined
   */
  getParser(filePath: string) {
    const extension = FileUtils.getFileExtension(filePath);
    return this.parserRegistry.getParser(extension);
  }

  /**
   * 檢查是否為 TypeScript 檔案
   */
  static isTypeScript(filePath: string): boolean {
    const ext = FileUtils.getFileExtension(filePath);
    return isTypeScriptSourceExtension(ext);
  }

  /**
   * 檢查是否為 JavaScript 檔案
   */
  static isJavaScript(filePath: string): boolean {
    const ext = FileUtils.getFileExtension(filePath);
    return isJavaScriptSourceExtension(ext);
  }

  /**
   * 檢查是否為支援的語言
   */
  static isSupportedLanguage(filePath: string): boolean {
    return FileUtils.isTypeScript(filePath) || FileUtils.isJavaScript(filePath);
  }

  /**
   * 遞迴收集專案內符合條件的檔案
   * 委派給獨立匯出的 collectProjectFiles（供無 ParserRegistry 可用、
   * 無法建立 FileUtils 實例的呼叫端直接重用同一套目錄走訪邏輯）。
   *
   * @param rootPath 掃描起始目錄
   * @param isSupportedFile 判斷檔案是否納入結果的謂詞
   */
  async collectProjectFiles(
    rootPath: string,
    isSupportedFile: (filename: string) => boolean
  ): Promise<string[]> {
    return collectProjectFiles(this.fileSystem, rootPath, isSupportedFile);
  }
}

/**
 * 建立 FileUtils 實例
 */
export function createFileUtils(
  fileSystem: IFileSystem,
  parserRegistry: ParserRegistry
): FileUtils {
  return new FileUtils(fileSystem, parserRegistry);
}

/**
 * 遞迴收集專案內符合條件的檔案
 * 跳過 @shared/exclude-dirs 權威清單中的目錄與所有隱藏目錄，
 * 供 change-signature、move-member 等模組共用同一套目錄走訪邏輯，
 * 不再各自複製一份 collectFiles/skipDirs。獨立匯出（非僅 FileUtils 類別方法），
 * 讓只有 IFileSystem、無 ParserRegistry 可建立 FileUtils 實例的呼叫端也能直接重用。
 *
 * @param fileSystem 檔案系統存取介面
 * @param rootPath 掃描起始目錄
 * @param isSupportedFile 判斷檔案是否納入結果的謂詞
 */
export async function collectProjectFiles(
  fileSystem: IFileSystem,
  rootPath: string,
  isSupportedFile: (filename: string) => boolean
): Promise<string[]> {
  const files: string[] = [];
  await collectFilesRecursive(fileSystem, rootPath, files, isSupportedFile);
  return files;
}

async function collectFilesRecursive(
  fileSystem: IFileSystem,
  dirPath: string,
  files: string[],
  isSupportedFile: (filename: string) => boolean
): Promise<void> {
  const entries = await fileSystem.readDirectory(dirPath);

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    // 跳過 node_modules、build 輸出目錄和隱藏目錄
    if ((COMMON_EXCLUDE_DIR_NAMES as readonly string[]).includes(entry.name) || entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory) {
      await collectFilesRecursive(fileSystem, fullPath, files, isSupportedFile);
    } else if (entry.isFile && isSupportedFile(entry.name)) {
      files.push(fullPath);
    }
  }
}
