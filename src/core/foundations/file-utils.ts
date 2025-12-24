/**
 * 檔案操作工具類
 * 提供跨模組共用的檔案讀取和副檔名處理
 */

import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';

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
    } catch {
      return null;
    }
  }

  /**
   * 取得檔案副檔名
   * @param filePath 檔案路徑
   * @returns 副檔名（含點號），無副檔名返回空字串
   */
  static getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.');
    return lastDot >= 0 ? filePath.substring(lastDot) : '';
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
    return ext === '.ts' || ext === '.tsx';
  }

  /**
   * 檢查是否為 JavaScript 檔案
   */
  static isJavaScript(filePath: string): boolean {
    const ext = FileUtils.getFileExtension(filePath);
    return ext === '.js' || ext === '.jsx';
  }

  /**
   * 檢查是否為支援的語言
   */
  static isSupportedLanguage(filePath: string): boolean {
    return FileUtils.isTypeScript(filePath) || FileUtils.isJavaScript(filePath);
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
