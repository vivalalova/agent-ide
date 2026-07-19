/**
 * 引用更新器實作
 * 負責更新程式碼中的符號引用
 * 使用 SymbolFinder 進行精確的 AST 分析
 */

import * as path from 'path';
import {
  TextChange,
  SymbolReference
} from './types.js';
import { Range } from '@shared/types/core.js';
import { Symbol, isFunctionLocalSymbol } from '@shared/types/symbol.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { FileSystem } from '@infrastructure/storage/index.js';
import { createSymbolFinder, SymbolReferenceType, type SymbolFinder, FileUtils, createFileUtils, createIdentifierBoundaryRegex, computeCodeStateMask } from '@core/foundations/index.js';
import { createLRUCache, type MemoryCache } from '@infrastructure/cache/index.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage } from '@shared/errors/index.js';
import type { ModuleSpecifierResolver } from '@infrastructure/parser/types.js';
import { createTargetExposureResolver } from './target-exposure-resolver.js';
import type { PathAliasInput } from '@shared/path-alias-resolver.js';

/** rename 的 tsconfig 路徑解析設定（pathAliases 期望已解析為絕對路徑，見 tsconfig-loader） */
export interface RenameModuleResolutionConfig {
  readonly pathAliases?: PathAliasInput;
  readonly baseUrl?: string;
}

/**
 * 檔案快取項目
 * 包含內容、大小和修改時間，用於失效檢查
 */
interface FileCacheEntry {
  content: string;
  size: number;
  modifiedTime: Date;
}

/**
 * 引用更新器類別
 * 使用 SymbolFinder 進行精確的 AST 分析
 * 注意：LRU 淘汰由 MemoryCache 自動處理
 */
export class ReferenceUpdater {
  /** 檔案內容快取，包含大小與修改時間用於失效檢查 */
  private readonly fileCache: MemoryCache<string, FileCacheEntry> = createLRUCache(200);
  private readonly fileSystem: IFileSystem;
  private readonly symbolFinder?: SymbolFinder;
  private readonly fileUtils?: FileUtils;
  private readonly pathConfig?: RenameModuleResolutionConfig;

  constructor(
    parserRegistry?: ParserRegistry,
    fileSystem?: IFileSystem,
    pathConfig?: RenameModuleResolutionConfig
  ) {
    // eslint-disable-next-line custom/no-new-filesystem, custom/no-default-instance-in-constructor -- 需要向後相容
    this.fileSystem = fileSystem ?? new FileSystem();
    this.pathConfig = pathConfig;

    if (parserRegistry) {
      this.symbolFinder = createSymbolFinder(parserRegistry, this.fileSystem);
      this.fileUtils = createFileUtils(this.fileSystem, parserRegistry);
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

        // 轉換 SymbolFinder 的 SymbolReference (@core/foundations/symbol-finder)
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
        diagnostics.warn('rename/reference-updater', 'ANALYSIS_DEGRADED', `SymbolFinder failed, falling back to text matching: ${getErrorMessage(error)}`, filePath);
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
    symbol: Symbol,
    moduleResolver?: ModuleSpecifierResolver
  ): Promise<SymbolReference[]> {
    // 檢查參數有效性
    if (!filePath || typeof filePath !== 'string' || !symbol || !symbol.name) {
      return [];
    }

    // 使用 SymbolFinder 的作用域感知版本查找引用
    if (this.symbolFinder) {
      try {
        const refs = await this.symbolFinder.findReferencesInFileWithSymbol(filePath, symbol, moduleResolver);

        return refs.map(ref => ({
          symbolName: symbol.name,
          range: ref.location.range,
          type: this.mapReferenceType(ref.type),
          context: ref.context, // 傳遞上下文資訊
          ...(ref.shorthandKeyText !== undefined ? { shorthandKeyText: ref.shorthandKeyText } : {})
        }));
      } catch (error) {
        // SymbolFinder 失敗時降級到文字匹配
        diagnostics.warn('rename/reference-updater', 'ANALYSIS_DEGRADED', `SymbolFinder (with symbol) failed, falling back to text matching: ${getErrorMessage(error)}`, filePath);
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

    // 快取 RegExp 避免重複編譯；使用 Unicode 邊界感知比對，純 Unicode 識別符（如 `用戶`）
    // 用 `\b` 會比對不到（缺陷 G6）。
    const regex = createIdentifierBoundaryRegex(symbolName, 'g');

    // 對整份 content 一次計算跨行狀態感知的程式碼遮罩（見 code-state-mask.ts），
    // 取代原本逐行、僅認得單/雙引號字串與同行註解的 findStringRanges/
    // findCommentStart：後者完全不辨識樣板字面值（`` ` ``），導致 rename 的
    // 降級文字匹配路徑會把 `` `oldName` `` 樣板字面值內容當成真實引用一併改掉、
    // 破壞字面文字（見缺陷：rename 樣板字面值內容未排除）；同時原本的逐行方式
    // 也無法辨識跨行區塊註解的延續行，一併修正。
    const codeMask = computeCodeStateMask(content);
    let lineStartOffset = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];

      // 重置 lastIndex 以便在每行重新匹配
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        const matchPos = match.index;

        // 不在真實程式碼狀態（字串/樣板/註解/regex 字面值內容）中的比對一律跳過
        if (!codeMask[lineStartOffset + matchPos]) {
          continue;
        }

        const startColumn = matchPos + 1;
        const endColumn = startColumn + symbolName.length;

        const range: Range = {
          start: { line: lineIndex + 1, column: startColumn },
          end: { line: lineIndex + 1, column: endColumn }
        };

        references.push({
          symbolName,
          range,
          type: 'usage',
          // 保留原始行內容（不 trim），讓 diff 輸出保持正確的縮排
          context: line
        });
      }

      lineStartOffset += line.length + 1;
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

    // 找出所有可能包含引用的檔案
    const referencingFiles = await this.findReferencingFiles(
      symbol.name,
      projectFiles
    );

    // 如果沒有找到引用檔案，至少處理符號定義所在的檔案
    let filesToProcess: string[] = isFunctionLocalSymbol(symbol)
      ? [symbol.location.filePath]
      : referencingFiles;
    if (referencingFiles.length === 0 && symbol.location?.filePath) {
      filesToProcess = [symbol.location.filePath];
    }

    // 建立跨檔曝露述詞（一次），供錨定層判定 consumer 的 import/re-export specifier 是否曝露目標符號：
    // 涵蓋 tsconfig path alias（缺陷 C3）與多層 barrel re-export 鏈（缺陷 C4）。函式區域符號無跨檔
    // 引用、免建。無 tsconfig 時 pathAliases 為空，述詞退化為「相對 specifier 直接解析到定義檔或
    // 經 barrel 轉發回定義檔」，涵蓋既有相對路徑行為。
    const moduleResolver: ModuleSpecifierResolver | undefined =
      symbol.location?.filePath && !isFunctionLocalSymbol(symbol)
        ? await createTargetExposureResolver({
          fileSystem: this.fileSystem,
          projectFiles,
          definitionFilePath: symbol.location.filePath,
          symbolName: symbol.name,
          pathAliases: this.pathConfig?.pathAliases,
          baseUrl: this.pathConfig?.baseUrl
        })
        : undefined;

    for (const filePath of filesToProcess) {
      // 跳過無效路徑
      if (!filePath || typeof filePath !== 'string') {
        continue;
      }

      // 使用作用域感知的方法查找引用
      const references = await this.findSymbolReferencesWithSymbol(filePath, symbol, moduleResolver);

      // N2-b：別名 import（`import { x as y }`）下，Language Service 的 findReferences 會連同
      // 別名本地綁定（`y`）的引用群組一併回傳，這些引用的實際 token 是別名 `y`、而非目標符號 `x`。
      // rename 只應改「目標符號名的出現位置」（定義、無別名的使用、import specifier 的被匯入名），
      // 保留使用者自訂別名 `y` 及其呼叫點不動。故排除實際 token 文字不等於目標符號名的引用
      // （等價排除別名群組），避免把 `import { x as y }` 盲改成 `import { newName as newName }`。
      const matchingReferences = references.filter(ref => this.referenceTokenMatchesName(ref, symbol.name));

      // 如果沒有匹配到引用，檢查是否為符號定義所在檔案
      if (matchingReferences.length === 0) {
        // 路徑正規化後比較（縱深防禦）：symbol.location.filePath 來自索引（絕對），filePath 可能
        // 沿用呼叫端傳入的形式，形式分歧會讓定義端漏改（缺陷 N2-a 的其中一環）。
        if (symbol.location?.filePath
          && path.resolve(symbol.location.filePath) === path.resolve(filePath)
          && symbol.location?.range) {
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
      // shorthand token（`{ foo }`／`const { foo } = opts`）需展開為 `key: newName`，
      // 保留原始 key（見 SymbolReference.shorthandKeyText），否則物件 key／解構來源
      // 欄位會被天真替換一併改掉。
      const changes: TextChange[] = matchingReferences.map(ref => ({
        range: ref.range,
        oldText: symbol.name,
        newText: ref.shorthandKeyText !== undefined ? `${ref.shorthandKeyText}: ${newName}` : newName,
        context: ref.context
      }));

      fileChanges.push({ filePath, changes });
    }

    return fileChanges;
  }

  /**
   * 判定引用位置的實際 token 文字是否等於目標符號名。
   *
   * 用於排除別名 import 群組：Language Service 會把別名本地綁定（`import { x as y }` 的 `y`）
   * 的引用一併回傳，其 token 為別名而非符號名，不應被 rename 動到。
   *
   * `context` 為引用所在整行原文（見 SymbolFinder / 文字降級路徑，皆保留未 trim 的整行）；
   * 跨行或無 context 時無法精確取字，回傳 true 予以保留（不過度過濾）。
   */
  private referenceTokenMatchesName(ref: SymbolReference, symbolName: string): boolean {
    const { context, range } = ref;
    if (typeof context !== 'string' || range.start.line !== range.end.line) {
      return true;
    }
    const token = context.slice(range.start.column - 1, range.end.column - 1);
    return token === symbolName;
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
   * 使用 size 與 modifiedTime 進行快取失效檢查
   */
  private async getFileContent(filePath: string): Promise<string | null> {
    const cached = this.fileCache.get(filePath);

    if (cached) {
      // 檢查快取是否仍有效
      try {
        const stat = await this.fileSystem.getStats(filePath);
        if (stat.modifiedTime <= cached.modifiedTime && stat.size === cached.size) {
          return cached.content;
        }
      } catch {
        // graceful-degradation: stat 失敗時快取視為過期，重新讀取
      }
    }

    // 重新讀取檔案
    const content = this.fileUtils
      ? await this.fileUtils.readFile(filePath)
      : await this.readFileFallback(filePath);

    if (content) {
      // 取得 modifiedTime 並快取
      try {
        const stat = await this.fileSystem.getStats(filePath);
        this.fileCache.set(filePath, { content, size: stat.size, modifiedTime: stat.modifiedTime });
      } catch {
        // graceful-degradation: 無法取得 stat 時不快取，下次會重新讀取
      }
    }

    return content;
  }

  /**
   * 降級檔案讀取方法（當 FileUtils 不可用時）
   */
  private async readFileFallback(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8') as string;
      return content;
    } catch (error) {
      diagnostics.warn('rename/reference-updater', 'FILE_READ_ERROR', `Failed to read file: ${getErrorMessage(error)}`, filePath);
      return null;
    }
  }

  /**
   * 清除快取
   */
  clearCache(): void {
    this.fileCache.clear();
  }
}
