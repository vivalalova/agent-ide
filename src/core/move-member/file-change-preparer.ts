/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的變更
 */

import * as path from 'path';
import type { IFileSystem } from '@infrastructure/storage/file-system.interface.js';
import type { ParserRegistry } from '@infrastructure/parser/registry.js';
import type { ImportDeclaration } from '@infrastructure/parser/interface.js';
import type { MemberDefinition, MoveMemberOptions, FileChange, TargetFileChange } from './types.js';
import { MoveTargetType } from './types.js';
import {
  parseExportSymbolPairs,
  hasDanglingExportReference,
  rewriteDanglingExportStatements
} from './utils/dangling-export.js';
import { diagnostics } from '@shared/errors/diagnostic-collector.js';
import { getErrorMessage, isFileNotFoundError } from '@shared/errors/index.js';
import { stripSourceFileExtension } from '@shared/types/index.js';
import {
  FileUtils,
  findMatchingBodyBraceEnd,
  createIdentifierBoundaryRegex,
  maskNonCode,
  computeCodeStateMask
} from '@core/foundations/index.js';
import { withEsmRuntimeExtension } from '@core/move/path-utils.js';
import { UNICODE_IDENTIFIER_PATTERN_SOURCE } from './utils/identifier-pattern.js';
import { createModuleIdentityResolver, createProjectFileResolver } from './utils/module-identity.js';

/**
 * Import 類型
 */
enum ImportType {
  Named = 'named',
  Namespace = 'namespace',
  Default = 'default'
}

/**
 * Import 符號資訊
 * 以程式碼中實際引用的 local binding 名稱為 key（見 indexImportedSymbols）
 */
interface ImportSymbolInfo {
  /**
   * import 語句在**來源檔語境**下的字面 module specifier；相對路徑要寫進其他目錄的檔案前
   * 必須先換算（見 rebaseExternalSpecifierToTarget）
   */
  modulePath: string;
  type: ImportType;
  /** 原始 imported/exported 名稱：named import 若有 `as` 別名時與 local binding 不同 */
  importedName: string;
  /** 是否為 type-only（語句層級 `import type` 或該 specifier 層級 `{ type X }`） */
  isTypeOnly: boolean;
}

/**
 * 來源檔案的符號資訊
 */
interface SourceSymbolInfo {
  /**
   * 本地定義的 export 符號：key 為程式碼中實際引用的 local binding 名稱，
   * value 為該符號實際對外可見的 export 名稱 —— 一般與 local 名稱相同，
   * 但 `export { local as alias }` 這種別名寫法時 value 是 alias、非 local 名稱。
   */
  localExports: Map<string, string>;
  /** 本地定義的 default export 符號 */
  defaultExports: Set<string>;
  /** import 的符號對應的來源，key 為程式碼中實際引用的 local binding 名稱 */
  importedSymbols: Map<string, ImportSymbolInfo>;
}

/**
 * File Change Preparer
 * 負責準備來源檔案和目標檔案的程式碼變更
 */
export class FileChangePreparer {
  constructor(
    private readonly fileSystem: IFileSystem,
    private readonly parserRegistry?: ParserRegistry
  ) {}

  /**
   * 準備來源檔案變更
   */
  async prepareSourceFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition
  ): Promise<FileChange> {
    const content = await this.readFile(options.sourceFile);
    if (!content) {
      throw new Error(`無法讀取來源檔案: ${options.sourceFile}`);
    }

    const lines = content.split('\n');
    const { start: removeStartLine, end: endLine } = this.getMemberRemovalLineRange(member);

    // 處理 re-export
    let reexportStatement = '';
    if (options.keepReexport) {
      const relativePath = this.calculateRelativePath(options.sourceFile, options.target.filePath);
      reexportStatement = `export { ${member.name} } from '${relativePath}';\n`;
    }

    const newLines = this.mergeWithSingleBlankBoundary(
      [
        ...lines.slice(0, removeStartLine),
        ...(options.keepReexport ? [reexportStatement] : [])
      ],
      lines.slice(endLine + 1)
    );

    // 成員宣告本體移除後，檔內若還留著獨立語句形式的 export（`export default NAME;`
    // 或 `export { NAME };`，非成員宣告行本身帶 inline export modifier），該語句
    // 會變成指向已不存在符號的孤兒 export（DANGLING-SOURCE-EXPORT）。改寫成指向
    // 目標檔的 re-export，語意與既有 keepReexport 橋接手法一致。同檔案內移動不
    // 適用：成員只是搬到同一檔案的另一位置，獨立 export 陳述式仍指向合法存在
    // 的宣告，不是孤兒引用，也不該產生指向自己的無意義 relative path。
    const isCrossFileMove = options.sourceFile !== options.target.filePath;
    const mergedCode = isCrossFileMove
      ? rewriteDanglingExportStatements(
          newLines.join('\n'),
          member,
          this.calculateRelativePath(options.sourceFile, options.target.filePath)
        )
      : newLines.join('\n');

    return {
      filePath: options.sourceFile,
      originalCode: content,
      newCode: mergedCode
    };
  }

  /**
   * 準備目標檔案變更
   * 自動判斷目標檔案是否存在：存在則插入，不存在則創建新檔案
   *
   * @param sameFileOverride 同檔案內移動成員時使用：來源檔與目標檔是同一個檔案，
   *   插入位置必須算在「成員已從舊位置移除後」的內容上，而非磁碟上仍含舊成員的
   *   原始內容 —— 否則會產生「成員重複出現」的錯誤結果（移除與插入各自基於獨立
   *   讀取的原始磁碟內容，互不知道對方的變更）。呼叫端（MoveMemberEngine）在偵測到
   *   sourceFile === target.filePath 時傳入 { originalCode: 真實磁碟原始內容,
   *   content: 已移除成員後的內容 }；originalCode 仍用於整檔替換 range 的行數計算
   *   （範圍必須對應磁碟上實際存在的內容），content 才是插入運算的基底。
   */
  async prepareTargetFileChange(
    options: MoveMemberOptions,
    member: MemberDefinition,
    sameFileOverride?: { originalCode: string; content: string }
  ): Promise<TargetFileChange> {
    const { target } = options;

    // 準備要插入的程式碼
    let memberCode = member.sourceCode;
    if (member.documentation) {
      memberCode = member.documentation + '\n' + memberCode;
    }

    // 需先讀來源檔內容才能判斷是否有獨立語句 export（見下方 hasDanglingExport），
    // 也供稍後 generateDependencyImports 共用，避免重複讀取磁碟同一份檔案
    const sourceContent = await this.readFile(options.sourceFile);

    // 跨檔案搬移時，來源檔若以獨立語句（`export default NAME;` / `export { NAME };`）
    // 匯出此成員（inline 宣告本身無 export modifier），該語句稍後會被
    // prepareSourceFileChange 改寫成指向本檔的 re-export；本檔必須真的匯出這個
    // binding，否則 re-export 會指向一個不存在的匯出，只是把孤兒引用從來源檔
    // 搬到本檔（DANGLING-SOURCE-EXPORT 修復）。同檔案內移動不適用：成員只是搬到
    // 同一檔案的另一位置，原本的獨立 export 陳述式依然合法，見
    // rewriteDanglingExportStatements 的同檔判斷。
    const isCrossFileMove = options.sourceFile !== target.filePath;
    const hasDanglingExport = isCrossFileMove && !!sourceContent &&
      hasDanglingExportReference(sourceContent, member.name);

    // 確保有 export：inline export modifier，或來源檔以獨立語句匯出此成員
    if (!memberCode.includes('export') && (member.modifiers.includes('export') || hasDanglingExport)) {
      memberCode = 'export ' + memberCode;
    }

    // 自動判斷檔案是否存在；同檔案移動時直接沿用呼叫端已讀好的內容，不重複讀磁碟
    const diskContent = sameFileOverride ? sameFileOverride.originalCode : await this.readFile(target.filePath);
    // 插入運算的基底：同檔案移動時用「已移除成員」後的內容，避免插入位置仍看得到
    // 舊位置的成員（否則插入與移除各自基於原始磁碟內容獨立運算，合併後成員重複）
    const content = sameFileOverride ? sameFileOverride.content : diskContent;
    // 判斷依據直接看 content（而非 diskContent）：sameFileOverride.content 型別保證非 null，
    // 讓 TS 能在下方 isNewFile 為 false 的分支正確窄化 content 為 string
    const isNewFile = content === null;

    // 分析成員依賴並生成需要的 import（需先知道目標檔既有 import 才能判重，避免重複插入）
    const dependencyImports = sourceContent
      ? await this.generateDependencyImports(
          member,
          sourceContent,
          options.sourceFile,
          target.filePath,
          content
        )
      : '';

    if (isNewFile) {
      // 新檔案：生成完整的檔案內容
      const newCode = this.ensureTrailingNewline(dependencyImports + (dependencyImports ? '\n\n' : '') + memberCode);

      return {
        filePath: target.filePath,
        originalCode: null,
        newCode,
        isNewFile: true
      };
    }

    // 現有檔案；classInsertContent 預設沿用原始 content，僅當目標類別收尾
    // `}` 與其他程式碼同一行（含單行 class）時才會被 findClassInsertPosition
    // 替換成「該行已拆行」版本，讓下游以行為單位的插入邏輯仍能正確運作
    let classInsertContent = content;
    let insertLine = target.insertPosition ?? -1;

    if (target.type === MoveTargetType.ExistingClass && target.className) {
      // 插入到類別內（位置已在 content 座標系上計算；找不到類別時 throw，
      // 不得 silent 落到檔尾 class 外——見 M3）
      const classInsertResult = await this.findClassInsertPosition(content, target.className);
      classInsertContent = classInsertResult.content;
      insertLine = classInsertResult.insertLine;
    } else if (sameFileOverride && insertLine >= 0) {
      // 同檔：CLI/呼叫端的 insertPosition 是磁碟原文座標（1-based 行號；
      // 0 = 檔案開頭），但 content 已是 post-removal。必須 remap 到
      // post-removal 的 0-based slice 索引，否則會插到錯位（M1）。
      const removal = this.getMemberRemovalLineRange(member);
      insertLine = this.remapSameFileInsertLine(insertLine, removal.start, removal.end);
    }

    // classInsertContent 只在 ExistingClass 分支可能被替換成「已拆行」版本，
    // 其餘分支維持原始 content；後續行為基礎的插入/import 定位一律以此為準，
    // 確保 insertLine 與實際用來 slice 的 lines 出自同一份座標系
    const lines = classInsertContent.split('\n');

    if (insertLine < 0) {
      // 預設插入到檔案結尾
      insertLine = this.findAppendInsertPosition(lines);
    }

    // 現有檔案：將 import 插入到檔案開頭（在現有 import 之後）
    let finalCode: string;
    if (dependencyImports) {
      const importInsertLine = this.findImportInsertPosition(classInsertContent);
      // 成員插入點不得落在 import 區內：若指定位置早於 import 區結尾，
      // clamp 到 import 區之後，避免 [memberInsertLine, importInsertLine) 這段
      // import 行同時被 slice(importInsertLine, memberInsertLine) 略過、又被
      // slice(memberInsertLine) 重新納入而複製一份
      const memberInsertLine = Math.max(insertLine, importInsertLine);
      const newLines = [
        ...lines.slice(0, importInsertLine),
        dependencyImports,
        ...lines.slice(importInsertLine, memberInsertLine),
        '',
        memberCode,
        ...lines.slice(memberInsertLine)
      ];
      finalCode = this.ensureTrailingNewline(newLines.join('\n'));
    } else {
      const newLines = [
        ...lines.slice(0, insertLine),
        '',
        memberCode,
        ...lines.slice(insertLine)
      ];
      finalCode = this.ensureTrailingNewline(newLines.join('\n'));
    }

    // originalCode 必須是磁碟原文：buildChangeset 用它算整檔 range，
    // applyTextEdits 對磁碟全文算 offset。同檔時 content 是 post-removal，
    // 若當 originalCode 會使 range 短於磁碟、尾段殘留（C1）。
    // newCode 仍是 post-removal + insert 的完整結果。
    return {
      filePath: target.filePath,
      originalCode: diskContent ?? content,
      newCode: finalCode,
      isNewFile: false
    };
  }

  /**
   * 成員在來源檔中要移除的行區間（0-based inclusive），含前方 documentation。
   * prepareSourceFileChange 與同檔 insertPosition remap 共用，避免兩處算法漂移。
   */
  private getMemberRemovalLineRange(member: MemberDefinition): { start: number; end: number } {
    const startLine = member.location.range.start.line - 1;
    const endLine = member.location.range.end.line - 1;
    let removeStartLine = startLine;
    if (member.documentation) {
      const docLines = member.documentation.split('\n').length;
      removeStartLine = Math.max(0, startLine - docLines);
    }
    return { start: removeStartLine, end: endLine };
  }

  /**
   * 同檔 move：把 insertPosition（磁碟座標）轉成 post-removal 上的 0-based slice 索引。
   *
   * 座標慣例（與 types.MoveTarget.insertPosition / CLI path:line 對齊）：
   * - 0 = 檔案開頭
   * - 正整數 = 1-based 磁碟行號（插在該行之前）
   * - 內部 slice 使用 0-based 索引
   *
   * 相對刪除區間：
   * - 刪除區之前：不變
   * - 刪除區之內：夾到刪除起點
   * - 刪除區之後：減去刪除行數
   */
  private remapSameFileInsertLine(
    insertPosition: number,
    removeStart0: number,
    removeEnd0: number
  ): number {
    const diskIndex0 = insertPosition === 0 ? 0 : insertPosition - 1;

    if (diskIndex0 <= removeStart0) {
      return diskIndex0;
    }
    if (diskIndex0 <= removeEnd0) {
      return removeStart0;
    }
    return diskIndex0 - (removeEnd0 - removeStart0 + 1);
  }

  /**
   * 找到 import 插入位置（在最後一個 import 之後）
   *
   * 以大括號深度追蹤多行具名 import（如 `import {\n  Existing\n} from './dep';`）：
   * 原本逐行判斷「這行是不是 import 開頭」，多行具名 import 的延續行（如
   * `  Existing`）既不以 `import` 開頭也非註解/空行，會被誤判為「遇到非 import
   * 內容」而提前停止搜尋，導致插入位置落在該多行語句中間、產生無效語法
   * （見缺陷：新 import 被插入到既有多行具名 import 的具名區塊內部）。深度歸零
   * 前的延續行一律視為同一語句的一部分，不影響搜尋是否該停止。大括號計數用
   * computeCodeStateMask 排除字串/註解內容中恰巧出現的大括號干擾（如具名 import
   * 區塊內的行內註解含 `}` 字樣）。
   */
  private findImportInsertPosition(content: string): number {
    const lines = content.split('\n');
    const mask = computeCodeStateMask(content);
    let lastImportLine = 0;
    let bracketDepth = 0;
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (bracketDepth > 0) {
        // 身處未閉合的多行具名 import 區塊內部，此行是其延續行，非新語句起點
        bracketDepth = Math.max(0, bracketDepth + this.netBraceDepth(rawLine, offset, mask));
        lastImportLine = i + 1;
      } else if (line.startsWith('import ') || line.startsWith('import{')) {
        lastImportLine = i + 1;
        bracketDepth = Math.max(0, this.netBraceDepth(rawLine, offset, mask));
      } else if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
        // 遇到非 import、非空行、非註解、且非多行 import 延續行，停止搜尋
        break;
      }

      offset += rawLine.length + 1;
    }

    return lastImportLine;
  }

  /**
   * 計算單一行內大括號的淨深度變化（`{` 數量減 `}` 數量），排除 mask 標記為
   * 非 code（字串/樣板/註解/regex 字面值）內容中的大括號干擾。供
   * findImportInsertPosition 追蹤多行具名 import 是否仍未閉合。
   *
   * @param line 該行原始文字
   * @param lineStartOffset 該行第一個字元在完整檔案內容中的字元位移
   * @param mask 完整檔案內容的程式碼狀態遮罩（見 computeCodeStateMask）
   */
  private netBraceDepth(line: string, lineStartOffset: number, mask: readonly boolean[]): number {
    let delta = 0;
    for (let j = 0; j < line.length; j++) {
      if (!mask[lineStartOffset + j]) { continue; }
      if (line[j] === '{') { delta++; }
      else if (line[j] === '}') { delta--; }
    }
    return delta;
  }

  /**
   * 生成成員依賴的 import
   * @param targetContent 目標檔既有內容（null 表示目標檔尚不存在），用於判重避免重複插入（S4）
   */
  private async generateDependencyImports(
    member: MemberDefinition,
    sourceContent: string,
    sourceFile: string,
    targetFile: string,
    targetContent: string | null
  ): Promise<string> {
    const symbolInfo = this.analyzeSourceSymbols(sourceContent, sourceFile);

    // 判重身分一律以目標檔為解析基準：問的是「這行 import 寫進目標檔後會綁到哪個檔案」，
    // 既有 import 與待插入 import 都必須在同一語境下比較
    const resolveIdentity = createModuleIdentityResolver(this.fileSystem, targetFile);
    // 來源檔語境的解析器：外部依賴 import 的相對 specifier 只在來源檔目錄下有意義，
    // 要先在此語境解析出實際被依賴的檔案，才能換算成目標檔語境的 specifier
    const resolveSourceContextFile = createProjectFileResolver(this.fileSystem, sourceFile);

    const existingTargetBindings = targetContent
      ? await this.collectExistingBindings(targetContent, targetFile, resolveIdentity)
      : new Map<string, Set<string>>();

    // 按 modulePath + importType + isTypeOnly 分組
    // key: `${modulePath}::${importType}::${isTypeOnly}`, value: Map<localName, importedName>
    const neededImports: Map<string, { modulePath: string; type: ImportType; isTypeOnly: boolean; symbols: Map<string, string> }> = new Map();

    const addNeeded = async (modulePath: string, type: ImportType, isTypeOnly: boolean, localName: string, importedName: string): Promise<void> => {
      // 目標檔「同一個模組」下已有同名 local binding：視為已可解析，跳過避免重複宣告（S4）。
      // 同一模組的判定以實際解析到的檔案為準，見 createModuleIdentityResolver
      if (existingTargetBindings.get(await resolveIdentity(modulePath))?.has(localName)) { return; }
      const key = `${modulePath}::${type}::${isTypeOnly}`;
      const entry = neededImports.get(key) ?? { modulePath, type, isTypeOnly, symbols: new Map<string, string>() };
      entry.symbols.set(localName, importedName);
      neededImports.set(key, entry);
    };

    const isSameFileMove = path.resolve(sourceFile) === path.resolve(targetFile);

    // 分析成員依賴的符號（member.dependencies 內的名稱即程式碼中實際引用的 local binding）
    for (const dep of member.dependencies) {
      // 跳過成員自己的名稱
      if (dep === member.name) { continue; }

      if (symbolInfo.localExports.has(dep)) {
        // same-file move：依賴的本地 export 與成員仍在同一份檔案、同一 module
        // scope，本來就可見，補一個指向自身的 import 反而會與檔案內既存的本地
        // 宣告衝突（TS2440）。比對前先正規化路徑，避免同一檔案不同寫法漏判。
        if (isSameFileMove) { continue; }

        // 依賴來自來源檔案的本地 export，依 export 類型決定 import 形式。
        // exportedName 可能因 `export { local as alias }` 與 local 名稱（dep）不同，
        // import 語句必須用實際 export 名稱，並用 as 別名映射回成員程式碼引用的 local 名稱，
        // 否則會生成指向不存在匯出的無效 import（見缺陷：aliased export 遺失映射）。
        const relativePath = this.calculateRelativePath(targetFile, sourceFile);
        const importType = symbolInfo.defaultExports.has(dep) ? ImportType.Default : ImportType.Named;
        const exportedName = symbolInfo.localExports.get(dep) ?? dep;
        await addNeeded(relativePath, importType, false, dep, exportedName);
      } else if (symbolInfo.importedSymbols.has(dep)) {
        // 依賴來自外部模組，保持原本的 import 類型、別名與 type 修飾；
        // specifier 須換算到目標檔語境（來源檔語境的相對路徑不可直接沿用）
        const importInfo = symbolInfo.importedSymbols.get(dep);
        if (!importInfo) { continue; }
        const modulePath = await this.rebaseExternalSpecifierToTarget(
          importInfo.modulePath,
          resolveSourceContextFile,
          sourceFile,
          targetFile
        );
        await addNeeded(modulePath, importInfo.type, importInfo.isTypeOnly, dep, importInfo.importedName);
      }
    }

    // 生成 import 語句
    const importLines: string[] = [];
    for (const { modulePath, type, isTypeOnly, symbols } of neededImports.values()) {
      if (symbols.size === 0) { continue; }
      const typePrefix = isTypeOnly ? 'type ' : '';

      switch (type) {
        case ImportType.Namespace: {
          // import * as name from 'module' - 只取第一個符號作為 namespace 名稱
          const [localName] = symbols.keys();
          importLines.push(`import ${typePrefix}* as ${localName} from '${modulePath}';`);
          break;
        }
        case ImportType.Default: {
          // import name from 'module' - 只取第一個符號作為 default 名稱
          const [localName] = symbols.keys();
          importLines.push(`import ${typePrefix}${localName} from '${modulePath}';`);
          break;
        }
        case ImportType.Named:
        default: {
          // import { A, B as C } from 'module'（保留別名：local binding 與 imported name 不同時用 as 映射）
          const parts = Array.from(symbols.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([localName, importedName]) => localName === importedName ? localName : `${importedName} as ${localName}`);
          importLines.push(`import ${typePrefix}{ ${parts.join(', ')} } from '${modulePath}';`);
          break;
        }
      }
    }

    return importLines.join('\n');
  }

  /**
   * 用 Parser AST 解析 import 宣告（SSOT：與 deadcode/move 模組共用同一份
   * ParserPlugin.getImportDeclarations 介面），取得每個 import 的 local binding 名稱、
   * imported 名稱、default/namespace/named 種類、per-specifier 與語句層級的 type 修飾、
   * module specifier。Parser 不支援或解析失敗時回傳空陣列（無法辨識的依賴不隨遷，
   * 與既有行為一致，非新增的降級分支）
   */
  private parseImportDeclarations(content: string, filePath: string): ImportDeclaration[] {
    if (!this.parserRegistry) { return []; }
    const parser = this.parserRegistry.getParser(FileUtils.getFileExtension(filePath));
    return parser?.getImportDeclarations?.(content) ?? [];
  }

  /**
   * 索引來源檔案的 import：key 為程式碼中實際引用的 local binding 名稱
   * （named import 若有 `as` 別名，local binding 與 imported name 不同）
   */
  private indexImportedSymbols(content: string, filePath: string): Map<string, ImportSymbolInfo> {
    const importedSymbols = new Map<string, ImportSymbolInfo>();

    for (const decl of this.parseImportDeclarations(content, filePath)) {
      if (decl.defaultImport) {
        importedSymbols.set(decl.defaultImport, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Default,
          importedName: decl.defaultImport,
          isTypeOnly: decl.isTypeOnly
        });
      }
      if (decl.namespaceImport) {
        importedSymbols.set(decl.namespaceImport, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Namespace,
          importedName: decl.namespaceImport,
          isTypeOnly: decl.isTypeOnly
        });
      }
      for (const named of decl.namedImports ?? []) {
        const localName = named.alias ?? named.name;
        importedSymbols.set(localName, {
          modulePath: decl.moduleSpecifier,
          type: ImportType.Named,
          importedName: named.name,
          isTypeOnly: decl.isTypeOnly || !!named.isTypeOnly
        });
      }
    }

    return importedSymbols;
  }

  /**
   * 收集檔案既有 import 已提供的 local binding，供插入依賴 import 前判重（S4）
   * key: 該 import specifier 的 module 身分 key（見 createModuleIdentityResolver）
   *   → 該 module 下已存在的 local binding 名稱集合
   */
  private async collectExistingBindings(
    content: string,
    filePath: string,
    resolveIdentity: (moduleSpecifier: string) => Promise<string>
  ): Promise<Map<string, Set<string>>> {
    const bindings = new Map<string, Set<string>>();

    for (const decl of this.parseImportDeclarations(content, filePath)) {
      const key = await resolveIdentity(decl.moduleSpecifier);
      const set = bindings.get(key) ?? new Set<string>();
      if (decl.defaultImport) { set.add(decl.defaultImport); }
      if (decl.namespaceImport) { set.add(decl.namespaceImport); }
      for (const named of decl.namedImports ?? []) {
        set.add(named.alias ?? named.name);
      }
      bindings.set(key, set);
    }

    return bindings;
  }

  /**
   * 分析來源檔案的符號（本地 export 和 import）
   * import 分析改用 Parser AST（見 indexImportedSymbols）；本地 export 偵測使用正則。
   *
   * export 偵測正則一律對 maskNonCode(content) 執行：字串/註解內容中恰巧長得像
   * export 宣告的文字（如 `/* export const Fake = 1; *\/`）遮罩後即消失，不會被
   * 誤判為真實 export（見缺陷：搬移成員引用同名但實際未 export 的 `Fake` 時，
   * 誤判導致目標檔生成一筆指向不存在導出的假 import）。indexImportedSymbols 走
   * Parser AST 解析，一律仍傳未遮罩的原始 content。
   */
  private analyzeSourceSymbols(content: string, filePath: string): SourceSymbolInfo {
    const localExports = new Map<string, string>();
    const defaultExports = new Set<string>();
    const maskedContent = maskNonCode(content);

    // export default [async] function NAME / export default class NAME
    // 僅匹配具名宣告；匿名 default export 維持不辨識
    const defaultExportPattern = new RegExp(
      `export\\s+default\\s+(?:async\\s+)?function\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      `export\\s+default\\s+class\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})`,
      'gu'
    );

    let match;
    while ((match = defaultExportPattern.exec(maskedContent)) !== null) {
      const name = match[1] ?? match[2];
      if (name !== undefined) {
        localExports.set(name, name);
        defaultExports.add(name);
      }
    }

    // 複合正則：匹配所有 export 語句
    const exportPattern = new RegExp(
      // export const/let/var NAME
      `export\\s+(?:const|let|var)\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export [async] function NAME
      `export\\s+(?:async\\s+)?function\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export [abstract] class NAME
      `export\\s+(?:abstract\\s+)?class\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export interface NAME
      `export\\s+interface\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export type NAME
      `export\\s+type\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export enum NAME
      `export\\s+enum\\s+(${UNICODE_IDENTIFIER_PATTERN_SOURCE})|` +
      // export { A, B }（不帶 from）
      'export\\s+\\{([^}]+)\\}(?!\\s+from)',
      'gu'
    );

    while ((match = exportPattern.exec(maskedContent)) !== null) {
      if (match[7] !== undefined) {
        // export { A, B as C }：local 名稱 B 實際對外可見的是別名 C，須分開記錄
        for (const [localName, exportedName] of parseExportSymbolPairs(match[7])) {
          localExports.set(localName, exportedName);
        }
      } else {
        const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
        if (name !== undefined) { localExports.set(name, name); }
      }
    }

    return { localExports, defaultExports, importedSymbols: this.indexImportedSymbols(content, filePath) };
  }

  /**
   * 找到類別內的插入位置
   * 使用正則表達式嚴格匹配類別定義，避免匹配註解中的類別名稱
   *
   * 收尾大括號改委派共用的 findMatchingBodyBraceEnd（見 code-state-mask.ts），
   * 以 mask 排除字串/註解內容中恰巧出現的大括號干擾（見缺陷：
   * `class Target { method(){ const text = "}"; } }` 字串內的 `}` 被逐字元計數
   * 誤認為類別收尾，導致插入位置算錯）。
   * className 以 createIdentifierBoundaryRegex 逸出並加 Unicode 識別符邊界
   * （`\b` 對純 Unicode 名稱失效；含 `$` 等特殊字元亦一併安全內嵌）。
   *
   * @returns `content`（收尾 `}` 與其他程式碼同一行時已拆行）與該行的 0-based 插入索引
   * @throws 找不到目標類別，或類別 body 大括號無法配對時
   */
  private async findClassInsertPosition(
    content: string,
    className: string
  ): Promise<{ content: string; insertLine: number }> {
    // 嚴格匹配類別定義：可選的 export/abstract，後接 class 關鍵字和類別名稱。
    // 名稱邊界用 createIdentifierBoundaryRegex（SSOT）：JS `\b` 對純 Unicode
    // 類別名（如 `服務`）失效，會回 -1 並被誤插到 class 外（M3）。
    const classPattern = new RegExp(
      `^[ \\t]*(export\\s+)?(abstract\\s+)?class\\s+${createIdentifierBoundaryRegex(className).source}`,
      'mu'
    );

    const match = classPattern.exec(content);
    if (!match || match.index === undefined) {
      throw new Error(`找不到目標類別: ${className}`);
    }

    const braceEndIndex = findMatchingBodyBraceEnd(content, match.index);
    if (braceEndIndex === -1) {
      throw new Error(`目標類別 body 無法解析（大括號不配對）: ${className}`);
    }

    const linesBeforeBrace = content.slice(0, braceEndIndex).split('\n');
    const targetLineIndex = linesBeforeBrace.length - 1;
    const columnInLine = linesBeforeBrace[targetLineIndex].length;
    const lines = content.split('\n');
    const targetLine = lines[targetLineIndex];
    const beforeBraceOnLine = targetLine.slice(0, columnInLine);

    if (beforeBraceOnLine.trim().length === 0) {
      // 既有正常情況：收尾 `}` 獨佔一行（前面只有縮排空白），下游以
      // 「行」為單位插入即可正確落在大括號前，維持原本行為不變
      return { content, insertLine: targetLineIndex };
    }

    // 收尾 `}` 與其他程式碼同一行（單行 class 是最常見的情況，如
    // `export class Svc { existing() {} }`）：下游插入邏輯以整行為單位
    // slice/插入，無法插入到行中間，否則會算出 insertLine=0 之類的位置，
    // 把成員插到 class 宣告之前、跑到 class 外。這裡先把該行從大括號處
    // 拆成兩行——大括號前內容留在原行，大括號（含其後殘餘內容）獨立成
    // 新的一行，插入點指向這條新行，讓下游 slice(0, insertLine) 完整
    // 保留大括號前的類別內容、slice(insertLine) 完整保留大括號起的收尾內容
    const fromBraceLine = targetLine.slice(columnInLine);
    const splitLines = [
      ...lines.slice(0, targetLineIndex),
      beforeBraceOnLine,
      fromBraceLine,
      ...lines.slice(targetLineIndex + 1)
    ];

    return {
      content: splitLines.join('\n'),
      insertLine: targetLineIndex + 1
    };
  }

  /**
   * 把成員外部依賴 import 的 specifier 從「來源檔語境」換算到「目標檔語境」。
   *
   * 相對 specifier 的意義綁在所在檔案的目錄上：`dirA/source.ts` 的 `'./helpers.js'`
   * 原樣寫進 `dirB/target.ts` 後，無同名檔時指向不存在的模組、目標目錄剛好有同名檔
   * （`dirB/helpers.ts`）時更糟——會被判重（以目標檔為基準解析身分）誤判成「目標檔
   * 已有這個 import」而靜默跳過插入，搬進來的成員綁到錯的模組（值錯且無編譯錯）。
   * 先以來源檔為基準解析出被依賴檔案的實際路徑，再以目標檔重算相對路徑（與本地
   * export 依賴分支的 calculateRelativePath 用法一致）。
   *
   * 維持原字面的情況：
   * - 非相對 specifier（bare package、path alias、絕對路徑）：語意與所在目錄無關
   * - 來源檔與目標檔同目錄（含同檔案搬移）：相對 specifier 在兩邊解析結果必然相同
   * - 解析不到實際檔案（依賴檔不存在、未設定的 alias）：無從重算，維持原字面
   *
   * 重算後若與目標檔既有 import 同名不同源（`dirA/helpers` 的 `helper` vs 既有
   * `dirB/helpers` 的 `helper`），插入會產生 duplicate identifier——這是編譯期即報錯的
   * 響亮失敗，優於靜默綁錯模組。
   */
  private async rebaseExternalSpecifierToTarget(
    moduleSpecifier: string,
    resolveSourceContextFile: (specifier: string) => Promise<string | null>,
    sourceFile: string,
    targetFile: string
  ): Promise<string> {
    if (!moduleSpecifier.startsWith('.')) { return moduleSpecifier; }
    if (path.dirname(path.resolve(sourceFile)) === path.dirname(path.resolve(targetFile))) {
      return moduleSpecifier;
    }

    const dependencyFile = await resolveSourceContextFile(moduleSpecifier);
    return dependencyFile ? this.calculateRelativePath(targetFile, dependencyFile) : moduleSpecifier;
  }

  /**
   * 計算相對路徑
   */
  private calculateRelativePath(from: string, to: string): string {
    const fromDir = path.dirname(from);
    let relativePath = path.relative(fromDir, to);

    relativePath = stripSourceFileExtension(relativePath);

    // 確保以 ./ 開頭
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 專案 ESM 慣例：相對 import 一律帶副檔名（C10；SSOT 見 withEsmRuntimeExtension）
    return withEsmRuntimeExtension(relativePath.replace(/\\/g, '/'), to);
  }

  private ensureTrailingNewline(content: string): string {
    return content.endsWith('\n') ? content : `${content}\n`;
  }

  private findAppendInsertPosition(lines: string[]): number {
    return lines.at(-1) === '' ? lines.length - 1 : lines.length;
  }

  private mergeWithSingleBlankBoundary(before: string[], after: string[]): string[] {
    const mergedBefore = [...before];
    const mergedAfter = [...after];
    let trailingBlankCount = this.countTrailingBlankLines(mergedBefore);
    let leadingBlankCount = this.countLeadingBlankLines(mergedAfter);

    if (trailingBlankCount + leadingBlankCount <= 1) {
      return [...mergedBefore, ...mergedAfter];
    }

    while (trailingBlankCount > 1) {
      mergedBefore.pop();
      trailingBlankCount--;
    }

    const keepLeadingBlank = trailingBlankCount === 0 ? 1 : 0;
    while (leadingBlankCount > keepLeadingBlank) {
      mergedAfter.shift();
      leadingBlankCount--;
    }

    return [...mergedBefore, ...mergedAfter];
  }

  private countTrailingBlankLines(lines: string[]): number {
    let count = 0;
    for (let i = lines.length - 1; i >= 0 && lines[i].trim() === ''; i--) {
      count++;
    }
    return count;
  }

  private countLeadingBlankLines(lines: string[]): number {
    let count = 0;
    for (let i = 0; i < lines.length && lines[i].trim() === ''; i++) {
      count++;
    }
    return count;
  }

  /**
   * 讀取檔案內容；回傳 null 僅代表「檔案不存在」（呼叫端以此判斷是否為新檔案），
   * 其餘讀取失敗（如權限不足）一律往外拋，避免被誤判成「檔案不存在」而靜默
   * 當成新檔案處理、覆蓋寫入或漏掉既有內容（與 move/path-calculator.ts 同型缺陷）。
   */
  private async readFile(filePath: string): Promise<string | null> {
    try {
      const content = await this.fileSystem.readFile(filePath, 'utf-8');
      return typeof content === 'string' ? content : content.toString('utf-8');
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return null;
      }
      diagnostics.warn('move-member/file-change-preparer', 'FILE_READ_ERROR', `Failed to read file: ${getErrorMessage(error)}`, filePath);
      throw error;
    }
  }
}
