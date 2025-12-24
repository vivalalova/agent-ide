/**
 * 引用更新器實作
 * 負責更新程式碼中的符號引用
 * 使用 SymbolFinder 進行精確的 AST 分析
 */

import {
  TextChange,
  SymbolReference
} from './types.js';
import { Range } from '@shared/types/core.js';
import { Symbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import { createSymbolFinder, SymbolReferenceType, type SymbolFinder } from '@core/shared/symbol-finder/index.js';

/**
 * 引用更新器類別
 * 使用 SymbolFinder 進行精確的 AST 分析
 */
export class ReferenceUpdater {
  private readonly fileCache = new Map<string, string>();
  private readonly fileSystem: IFileSystem;
  private readonly symbolFinder?: SymbolFinder;

  constructor(parserRegistry?: ParserRegistry, fileSystem?: IFileSystem) {
    // eslint-disable-next-line custom/no-new-filesystem, custom/no-default-instance-in-constructor -- 需要向後相容
    this.fileSystem = fileSystem ?? new FileSystem();

    if (parserRegistry) {
      this.symbolFinder = createSymbolFinder(parserRegistry, this.fileSystem);
    }
  }

  /**
   * 尋找檔案中的符號引用
   * 委託 SymbolFinder 進行 AST 分析
   */
  async findSymbolReferences(
    filePath: string,
    symbolName: string
  ): Promise<SymbolReference[]> {
    // 檢查參數有效性
    if (!filePath || typeof filePath !== 'string' || !symbolName) {
      return [];
    }

    // 使用 SymbolFinder 查找引用
    if (this.symbolFinder) {
      try {
        const refs = await this.symbolFinder.findReferencesInFile(filePath, symbolName);

        // 轉換 SymbolFinder 的 SymbolReference (@core/shared/symbol-finder)
        // 為本地型別 SymbolReference (@core/rename/types)
        // 兩者差異：
        // - SymbolFinder 版本：{ symbolName, location: Location, type: SymbolReferenceType, context? }
        // - 本地版本：{ symbolName, range: Range, type: 'definition' | 'usage' | 'comment' }
        // filePath 資訊已知（來自方法參數），故只需映射 range 和 type
        return refs.map(ref => ({
          symbolName,
          range: ref.location.range,
          type: this.mapReferenceType(ref.type)
        }));
      } catch (error) {
        // SymbolFinder 失敗時降級到文字匹配
        console.warn(`SymbolFinder failed for ${filePath}, falling back to text matching:`, error);
      }
    }

    // 降級：使用文字匹配方法
    return this.findSymbolReferencesByText(filePath, symbolName);
  }

  /**
   * 使用完整符號資訊查找檔案中的引用（作用域感知版本）
   *
   * 此方法會使用完整的符號資訊（包含類型、作用域等）進行精確匹配，
   * 避免同名符號被誤改的問題。
   *
   * @param filePath 檔案路徑
   * @param symbol 完整的符號資訊
   * @returns 符號引用陣列（包含 context 上下文）
   */
  async findSymbolReferencesWithSymbol(
    filePath: string,
    symbol: Symbol
  ): Promise<SymbolReference[]> {
    // 檢查參數有效性
    if (!filePath || typeof filePath !== 'string' || !symbol || !symbol.name) {
      return [];
    }

    // 使用 SymbolFinder 的作用域感知版本查找引用
    if (this.symbolFinder) {
      try {
        const refs = await this.symbolFinder.findReferencesInFileWithSymbol(filePath, symbol);

        return refs.map(ref => ({
          symbolName: symbol.name,
          range: ref.location.range,
          type: this.mapReferenceType(ref.type),
          context: ref.context // 傳遞上下文資訊
        }));
      } catch (error) {
        // SymbolFinder 失敗時降級到文字匹配
        console.warn(`SymbolFinder (with symbol) failed for ${filePath}, falling back to text matching:`, error);
      }
    }

    // 降級：使用文字匹配方法
    return this.findSymbolReferencesByText(filePath, symbol.name);
  }

  /**
   * 映射 SymbolFinder 的引用類型到本地類型
   *
   * 注意：'comment' 類型只會從降級方法 findSymbolReferencesByText 產生，
   * 不會經過此映射函式。SymbolReferenceType enum 目前沒有 Comment 類型。
   */
  private mapReferenceType(type: SymbolReferenceType): 'definition' | 'usage' | 'comment' {
    switch (type) {
      case SymbolReferenceType.Definition:
        return 'definition';
      case SymbolReferenceType.Usage:
      case SymbolReferenceType.Import:
      case SymbolReferenceType.Export:
        return 'usage';
      default:
        // 未來新增的 enum 值降級為 usage
        return 'usage';
    }
  }

  /**
   * 使用文字匹配查找符號引用（降級方法）
   */
  private async findSymbolReferencesByText(
    filePath: string,
    symbolName: string
  ): Promise<SymbolReference[]> {
    const content = await this.getFileContent(filePath);
    if (!content) {return [];}

    const references: SymbolReference[] = [];
    const lines = content.split('\n');

    // 快取 RegExp 避免重複編譯
    const regex = new RegExp(`\\b${this.escapeRegex(symbolName)}\\b`, 'g');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      // 重置 lastIndex 以便在每行重新匹配
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        // 跳過字串字面值內的匹配
        if (this.isInString(line, match.index)) {
          continue;
        }

        const startColumn = match.index + 1;
        const endColumn = startColumn + symbolName.length;

        const range: Range = {
          start: { line: lineIndex + 1, column: startColumn },
          end: { line: lineIndex + 1, column: endColumn }
        };

        // 簡化的型別判定：檢查是否在註解中
        const type = this.isInComment(line, match.index) ? 'comment' : 'usage';

        references.push({
          symbolName,
          range,
          type: type as 'definition' | 'usage' | 'comment',
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }
    }

    return references;
  }

  /**
   * 收集重新命名變更（不寫入檔案）
   * 用於 preview 和實際執行共用邏輯
   *
   * 使用作用域感知的符號查找，確保只修改目標符號的引用，
   * 不會影響其他同名但不同作用域的符號。
   */
  async collectRenameChanges(
    symbol: Symbol,
    newName: string,
    projectFiles: string[]
  ): Promise<{ filePath: string; changes: TextChange[] }[]> {
    const fileChanges: { filePath: string; changes: TextChange[] }[] = [];

    try {
      // 找出所有可能包含引用的檔案
      const referencingFiles = await this.findReferencingFiles(
        symbol.name,
        projectFiles
      );

      // 如果沒有找到引用檔案，至少處理符號定義所在的檔案
      let filesToProcess: string[] = referencingFiles;
      if (referencingFiles.length === 0 && symbol.location?.filePath) {
        filesToProcess = [symbol.location.filePath];
      }

      for (const filePath of filesToProcess) {
        // 跳過無效路徑
        if (!filePath || typeof filePath !== 'string') {
          continue;
        }

        // 使用作用域感知的方法查找引用
        const references = await this.findSymbolReferencesWithSymbol(filePath, symbol);

        // 如果沒有找到引用，檢查是否為符號定義所在檔案
        if (references.length === 0) {
          if (symbol.location?.filePath === filePath && symbol.location?.range) {
            // 至少包含符號定義位置
            fileChanges.push({
              filePath,
              changes: [{
                range: symbol.location.range,
                oldText: symbol.name,
                newText: newName
              }]
            });
          }
          continue;
        }

        // 轉換為 TextChange（包含 context 資訊）
        const changes: TextChange[] = references.map(ref => ({
          range: ref.range,
          oldText: symbol.name,
          newText: newName,
          context: ref.context
        }));

        fileChanges.push({ filePath, changes });
      }

      return fileChanges;
    } catch (error) {
      console.error('收集變更時發生錯誤:', error);
      return [];
    }
  }

  /**
   * 找出包含符號引用的檔案
   */
  async findReferencingFiles(
    symbolName: string,
    filePaths: string[]
  ): Promise<string[]> {
    const referencingFiles: string[] = [];

    for (const filePath of filePaths) {
      // 過濾無效路徑
      if (!filePath || typeof filePath !== 'string') {
        continue;
      }

      const content = await this.getFileContent(filePath);
      if (content && content.includes(symbolName)) {
        referencingFiles.push(filePath);
      }
    }

    return referencingFiles;
  }

  /**
   * 取得檔案內容
   */
  private async getFileContent(filePath: string): Promise<string | null> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      // 使用注入的 fileSystem 讀取檔案
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      this.fileCache.set(filePath, content);
      return content;
    } catch {
      return null;
    }
  }

  /**
   * 檢查是否在註解中
   */
  private isInComment(line: string, position: number): boolean {
    const beforePosition = line.substring(0, position);

    // 檢查單行註解
    if (beforePosition.includes('//')) {
      return true;
    }

    // Python 單行註解
    if (beforePosition.includes('#')) {
      return true;
    }

    // 檢查多行註解（簡化處理）
    const openComment = beforePosition.lastIndexOf('/*');
    const closeComment = beforePosition.lastIndexOf('*/');

    return openComment !== -1 && (closeComment === -1 || openComment > closeComment);
  }

  /**
   * 檢查位置是否在字串字面值內
   */
  private isInString(line: string, position: number): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < position; i++) {
      const char = line[i];
      const prevChar = i > 0 ? line[i - 1] : '';

      // 跳過轉義字符
      if (prevChar === '\\') {
        continue;
      }

      if (char === '\'' && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      }
    }

    return inSingleQuote || inDoubleQuote;
  }

  /**
   * 逸出正則表達式特殊字符
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}