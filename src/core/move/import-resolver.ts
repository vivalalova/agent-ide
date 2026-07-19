/**
 * Import 解析器
 * 負責解析和更新程式碼中的 import 語句
 */

import * as path from 'path';
import { builtinModules } from 'node:module';
import type { IFileSystem } from '@infrastructure/storage/index.js';
import { ImportStatement, ImportStatementType, PathType, ImportResolverConfig, ImportUpdate } from './types.js';
import { createPosition, createRange } from '@shared/types/core.js';
import { escapeRegex } from '@shared/regex-utils.js';
import { stripSourceFileExtension } from '@shared/types/index.js';
import {
  resolveBarePathAlias,
  resolveBarePathAliasAsync,
  findPathAliasMatch,
  withLegacyPathAliasWildcards,
  type PathAliasInput
} from '@shared/path-alias-resolver.js';
import { computeMaskedLines } from './source-masking.js';
import {
  collectMultilineImportStatement,
  collectMultilineExportStatement,
  collectMultilineCallStatement,
  UNICODE_IDENTIFIER_CLASS,
  EXPORT_FROM_STATEMENT_PATTERN,
  type MultilineStatementSpan
} from './statement-collector.js';

/**
 * 匯入陳述式偵測用正則：辨識 `import ... from '...'`
 * （default / namespace / named / type-only 皆可），identifier 部分支援
 * Unicode（見 C6 regression）。套用 'u' flag 以啟用 \p{} 屬性跳脫。
 */
const IMPORT_STATEMENT_PATTERN = new RegExp(
  'import\\s+(?:type\\s+)?(?:(?:\\{[^}]*\\}|' + UNICODE_IDENTIFIER_CLASS + '|\\*\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + ')' +
    '(?:\\s*,\\s*(?:\\{[^}]*\\}|' + UNICODE_IDENTIFIER_CLASS + '|\\*\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + '))*\\s+from\\s+)?' +
    '[\'"`]([^\'"`]+)[\'"`]',
  'gu'
);

/**
 * findImportedSymbols 用的識別符正則，皆採 UNICODE_IDENTIFIER_CLASS
 * （支援 Unicode 與 `$` 開頭識別符，見 adversarial R1 regression：舊版用 `\w+`
 * 無法辨識 `工具`、`$api` 等合法識別符）。別名比對（`X as Y`）在混合 import
 * 與具名 import 兩處共用同一份解析邏輯（見下方 parseNamedImportItems），
 * 避免同一正則重複維護（Single Source of Truth）。
 */
const MIXED_IMPORT_PATTERN = new RegExp(
  'import\\s+(' + UNICODE_IDENTIFIER_CLASS + ')\\s*,\\s*\\{([^}]+)\\}\\s+from', 'u'
);
const DEFAULT_IMPORT_PATTERN = new RegExp('import\\s+(' + UNICODE_IDENTIFIER_CLASS + ')\\s+from', 'u');
const NAMED_IMPORT_BLOCK_PATTERN = /import\s+\{([^}]+)\}/;
const NAMESPACE_IMPORT_PATTERN = new RegExp('import\\s+\\*\\s+as\\s+(' + UNICODE_IDENTIFIER_CLASS + ')', 'u');
const NAMED_IMPORT_ALIAS_PATTERN = new RegExp(
  '(' + UNICODE_IDENTIFIER_CLASS + ')\\s+as\\s+(' + UNICODE_IDENTIFIER_CLASS + ')', 'u'
);

export class ImportResolver {
  private readonly config: ImportResolverConfig;
  private readonly aliasKeys: string[];

  constructor(config: ImportResolverConfig) {
    this.config = {
      ...config,
      pathAliases: withLegacyPathAliasWildcards(config.pathAliases)
    };
    this.aliasKeys = Object.keys(this.config.pathAliases);
  }

  /**
   * 取得路徑別名映射
   * @returns 別名與實際路徑的映射物件
   */
  getPathAliases(): PathAliasInput {
    return this.config.pathAliases;
  }

  /**
   * 取得 baseUrl 設定
   * @returns baseUrl 絕對路徑，若無設定則返回 undefined
   */
  getBaseUrl(): string | undefined {
    return this.config.baseUrl;
  }

  /**
   * 分析 import 語句 (別名，保持向後相容)
   */
  analyzeImports(filePath: string, code: string): ImportStatement[] {
    return this.parseImportStatements(code, filePath);
  }

  /**
   * 解析程式碼中的 import 語句
   */
  parseImportStatements(code: string, _filePath: string): ImportStatement[] {
    const statements: ImportStatement[] = [];
    const lines = code.split('\n');
    // 對整份檔案內容一次計算跨行狀態感知的遮罩行（見 source-masking.ts 的
    // computeMaskedLines）：取代原本每處各自呼叫 maskStringsAndComments 逐行
    // 重算、彼此無記憶的做法，讓身處前面幾行才開始、尚未結束的樣板字面值/
    // 區塊註解內部的行，能正確得知自己並非真正的頂層程式碼（見缺陷：跨行
    // 樣板字面值中間行含 `import { x } from './old';` 這種文字，逐行獨立遮罩
    // 因不知道自己身處樣板字面值內部，被誤判為真正的 import 並誤改寫）。
    const maskedLines = computeMaskedLines(code);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 跳過註解行
      if (this.isCommentLine(line)) {
        continue;
      }

      // 解析 ES6 import（包含 import type 語法）
      const importStatement = collectMultilineImportStatement(lines, i, maskedLines);
      // 只有真正跨行的 import 語句（一個區塊只會有一筆 import）才用整段多行文字；
      // 單行內可能有多個 import 指向不同（或相同）模組，各自的 rawStatement 必須
      // 以「該 import 在行內的實際出現位置」（match[0]）切出，避免同行多筆 import
      // 共用同一份整行文字，造成後續去重誤判與替換錯位（見 C7 regression）
      const multilineSpan = importStatement && importStatement.endLineIndex > importStatement.startLineIndex
        ? importStatement
        : null;
      const searchText = importStatement?.statement ?? line;
      // 字串字面值與行內註解可能包含長得像 import 陳述式的文字（如
      // "import { x } from './y'" 或 // import ... 註解），或多行 import 中間行
      // 含 `// } from './decoy.js'` 這種假收尾形狀，若不遮罩會被誤判成真正的
      // import 或誤判成真正的收尾（見 C5、P3-1 regression）。跨行情境下用
      // 各行遮罩後以 '\n' 拼接的版本，與 searchText（未遮罩、同樣以 '\n' 拼接）
      // 逐字元對齊，可用同一組 index 切換；遮罩改直接取用預先計算好的 maskedLines。
      const maskedSearchText = multilineSpan
        ? maskedLines.slice(multilineSpan.startLineIndex, multilineSpan.endLineIndex + 1).join('\n')
        : maskedLines[i];
      // searchText / maskedSearchText 皆自「起始行」起算（單行時即該行，多行時為
      // 整段 span）；baseLineIndex 為該起始行的 0-based 行索引，供下方由 matchIndex
      // 反推 import 真實行號時作基準。
      const baseLineIndex = importStatement ? importStatement.startLineIndex : i;
      const importMatches = maskedSearchText.matchAll(IMPORT_STATEMENT_PATTERN);
      for (const match of importMatches) {
        const matchIndex = match.index ?? 0;
        // 一律從「未遮罩」的原始文字切出對應片段：遮罩後的 match 只用來判斷
        // 「這裡是不是一個 import 陳述式」，真正的模組路徑與語句文字必須來自
        // 原文（遮罩版本引號內的內容只是佔位空白，不是真正路徑）。
        const originalMatchText = searchText.slice(matchIndex, matchIndex + match[0].length);
        const pathMatch = originalMatchText.match(/['"`]([^'"`]+)['"`]$/);
        if (!pathMatch) {
          continue;
        }
        const importPath = pathMatch[1];
        // 行、列一律由 matchIndex 反推，不再靠「對起始行找第一個 'import' 關鍵字」
        // 猜測。IMPORT_STATEMENT_PATTERN 以 `import` 起頭，match.index 即 import
        // 關鍵字在遮罩後 span 文字中的精確 offset，交由 resolveSpanPosition 反推真實
        // 行、列（與 export 分支共用同一定位）。舊法有兩個缺陷：
        //  1. 對多行 span 恆把行號記成 span 起始行，但真正的 import 未必落在起始行
        //     （起始行可能只是遮罩後才確定不含真 import 的假陽性行），造成行號歸屬錯誤；
        //  2. indexOf('import') 在起始行遮罩後不含 'import' 時回傳 -1，column 變 -1 →
        //     createPosition 拋「Column 必須大於等於 1」，並從 file-scanner 引用掃描
        //     階段（無 try/catch）逸出使整個 move 失敗（見 P2-B regression）。
        const { lineNumber: lineNumberForStatement, columnIndex } =
          this.resolveSpanPosition(maskedSearchText, baseLineIndex, matchIndex);
        // rawStatement 一律取「該筆 match 本身」（originalMatchText，match[0]
        // 精確涵蓋 `import ... from '<path>'` 到 specifier 收尾引號為止），必要時併
        // 入緊接的 `;`。單、多行皆同一切法：
        //  - 不含關鍵字前方的任何前綴文字（如字串字面值裡的假 'import'），與 column
        //    錨定對齊（見 P3-4 regression）；
        //  - 不把 specifier 之後的尾隨程式碼一起吞進來。舊法多行沿用 span 結尾
        //    （searchText.slice(matchIndex)），遇 `} from './a'; doSomething();`
        //    這種收尾行 specifier 後還有程式碼時，rawStatement 尾端不是 `from '...'`，
        //    下游 replaceModuleSpecifier 的「from 樣式須錨定語句結尾」lookahead 不命中
        //    → newImport === rawStatement → 更新被靜默跳過（見 P3 複審）。
        // 同行多筆 import 指向不同模組（C7）也靠此各取自身 match、不共用整行。
        const rawStatementText = this.appendTrailingSemicolonIfAdjacent(searchText, originalMatchText, matchIndex);
        const statement = this.createImportStatement(
          ImportStatementType.IMPORT,
          importPath,
          lineNumberForStatement,
          columnIndex,
          rawStatementText
        );
        if (statement) {
          statements.push(statement);
        }
      }
      if (importStatement && importStatement.endLineIndex > importStatement.startLineIndex) {
        i = importStatement.endLineIndex;
        continue;
      }

      // 解析 ES6 export from（包含單行和多行）；進場檢查一律用遮罩後文字：字串
      // 字面值／行內註解中的 'export' 字樣（如 `const note = "export ... from ..."`）
      // 遮罩後即消失，不應觸發 export 收集（C5 的 export 版類比，見 export 分支
      // 實驗形狀 A/B）。
      const maskedLineForExport = maskedLines[i];
      if (maskedLineForExport.includes('export')) {
        // 收集多行 export 語句
        const exportStatement = collectMultilineExportStatement(lines, i, maskedLines);
        if (exportStatement) {
          const { endLineIndex, startLineIndex } = exportStatement;
          const exportSpanLines = lines.slice(startLineIndex, endLineIndex + 1);
          const rawSpanText = exportSpanLines.join('\n');
          // from '...' 與 export 定位一律在「遮罩後、逐字元對齊」的 span 文字上進行
          // （字串字面值／行內註解中長得像 re-export 的假 from 已被遮罩消除），真正的
          // 模組路徑再從未遮罩原文的同一 offset 切出（見形狀 B/C）。
          const maskedSpanText = maskedLines.slice(startLineIndex, endLineIndex + 1).join('\n');
          // 對整個 span 的遮罩文字 matchAll，逐筆列舉真正的 export-from、各自建
          // ImportStatement，rawStatement/column per-match。單行 span 可能含同行多筆
          // （`export { a } from './x'; export { b } from './y';`，P3-DUAL-EXPORT-LINE）；
          // 前置無 from 的本地清單（`export { setup };`）不含 from、自然不被 matchAll
          // 命中而略過，只有真 re-export 被解析（P2-STICKY-SINGLE-ANCHOR）。多行 span
          // 的 export-from（含 `export *` 換行形狀 P3-C、跨行具名 P2-CAP）同樣由 matchAll
          // 就地定位其精確 offset，毋須另外猜測 export 關鍵字位置。每筆的 exportOffset
          // 與 specifierEnd（match[0] 涵蓋至 specifier 收尾引號）交給共用 helper 建立。
          for (const match of maskedSpanText.matchAll(EXPORT_FROM_STATEMENT_PATTERN)) {
            const exportOffset = match.index ?? 0;
            this.pushExportFromStatement(
              statements, rawSpanText, maskedSpanText, startLineIndex, exportOffset, exportOffset + match[0].length
            );
          }
          // 僅「真跨行」span 才跳行 continue（比照 import 分支）；單行 span 解析完
          // export-from 後不可 continue——否則同行尾隨的呼叫式（如
          // `export { a } from './keep.js'; const z = require('./real.js');`）會被跳過而
          // 永不解析。單行時讓本輪流程繼續往下走 require/dynamic import 階段；export-from
          // 文字不含 require(/import( 字樣，與呼叫式解析無交互。
          if (endLineIndex > startLineIndex) {
            i = endLineIndex;
            continue;
          }
        }
      }

      // 解析 CommonJS require：module specifier 可能跨行書寫（如
      // `require(\n  './x'\n)`），先嘗試收集完整的多行呼叫語句（見 C10
      // regression）；非跨行時才視為單行呼叫（同行可能有多筆）。
      //
      // 多行呼叫結束後跳到 endLineIndex - 1（而非 endLineIndex），讓外層迴圈的
      // `i++` 剛好落在收尾行本身、對它重新走一次完整流程：收尾行（如
      // `);`）除了結束多行呼叫，同一物理行可能還接著第二個獨立的 require()/
      // import() 呼叫（如 `); require('./old2');`），原本直接跳過整個收尾行會
      // 讓這第二筆呼叫完全沒被掃描到、既不會被收集也不會被改寫（見缺陷：
      // 多行 require() 收尾行上的第二個呼叫消失）。收尾行本身的內容（單純的
      // `)`/`;`）不含 require/import 關鍵字，重新掃描它不會誤重複收集已處理過
      // 的多行呼叫本體。
      const requireCall = collectMultilineCallStatement(lines, i, 'require', maskedLines);
      if (requireCall && requireCall.endLineIndex > requireCall.startLineIndex) {
        this.pushMultilineCallStatement(statements, lines, maskedLines, requireCall, ImportStatementType.REQUIRE, 'require');
        i = requireCall.endLineIndex - 1;
        continue;
      }
      this.pushSingleLineCallStatements(statements, line, maskedLines[i], lineNumber, ImportStatementType.REQUIRE, 'require');

      // 解析動態 import，處理方式與 require 相同（見上，含收尾行重新掃描的理由）
      const dynamicImportCall = collectMultilineCallStatement(lines, i, 'import', maskedLines);
      if (dynamicImportCall && dynamicImportCall.endLineIndex > dynamicImportCall.startLineIndex) {
        this.pushMultilineCallStatement(statements, lines, maskedLines, dynamicImportCall, ImportStatementType.DYNAMIC_IMPORT, 'import');
        i = dynamicImportCall.endLineIndex - 1;
        continue;
      }
      this.pushSingleLineCallStatements(statements, line, maskedLines[i], lineNumber, ImportStatementType.DYNAMIC_IMPORT, 'import');
    }

    return statements;
  }

  /**
   * 單行 import 的 rawStatement 若緊接著一個 `;`，把它併入 rawStatement，
   * 使輸出（pathUpdates 的 oldImport/newImport）與修復同行多 import 去重問題前
   * 的逐字語句保持一致。不影響去重鍵唯一性：唯一性來自 matchedText 本身
   * （不同 specifier 的文字本就不同），加不加分號都唯一。
   */
  private appendTrailingSemicolonIfAdjacent(searchText: string, matchedText: string, matchIndex: number): string {
    const nextCharIndex = matchIndex + matchedText.length;
    return searchText[nextCharIndex] === ';' ? matchedText + ';' : matchedText;
  }

  /**
   * 由「錨點（import／export 關鍵字）在遮罩後 span 文字中的精確 offset」反推它
   * 相對於 span 起始行的實際行號（1-based）與列（0-based）。maskedSpanText 與其
   * 未遮罩原文逐字元對齊（各行遮罩後以 '\n' 拼接），故 offset 之前的換行數即錨點
   * 相對起始行的行位移，最後一個換行之後的距離即列。import 與 export 分支共用此
   * 定位，避免各自以「對起始行找關鍵字」手刻，杜絕 P2-B／P3-4 一類行列歸屬錯誤
   * （含 indexOf 落空回 -1 → column 為 0 拋例外）的重複缺陷。
   */
  private resolveSpanPosition(
    maskedSpanText: string,
    baseLineIndex: number,
    offset: number
  ): { lineNumber: number; columnIndex: number } {
    const precedingText = maskedSpanText.slice(0, offset);
    const lineOffset = precedingText.split('\n').length - 1;
    const columnIndex = offset - (precedingText.lastIndexOf('\n') + 1);
    return { lineNumber: baseLineIndex + lineOffset + 1, columnIndex };
  }

  /**
   * 由 export span 的一段範圍（export 關鍵字 offset 到 specifier 收尾引號 offset）
   * 建立並收錄一筆 EXPORT 型別 ImportStatement。單行 span 對每筆 export-from 各呼叫
   * 一次（同行多筆），多行 span 呼叫一次。
   *
   * from 子句一律在「遮罩後」span 的 [exportOffset, specifierEndOffset) 範圍內定位，
   * 真路徑再從未遮罩原文同一 offset 切出：具名區塊或註解裡的假 from（如形狀 C 的
   * `// } from './decoy.js'`）遮罩後已消失、不會被誤取。rawStatement 自 export 關鍵字
   * 起算、止於 specifier 收尾引號、必要時併入緊鄰的 `;`，不吞 specifier 之後的尾隨
   * 程式碼（形狀 E）；行、列由 export 關鍵字 offset 反推，與 column 錨定同基準
   * （P3-4 export 版）。下游 replaceModuleSpecifier 的 from 樣式已內嵌實際 oldPath
   * 並錨定語句結尾，只替換真正的 `from '<oldPath>'`，故毋須額外傳 specifierOffset。
   */
  private pushExportFromStatement(
    statements: ImportStatement[],
    rawSpanText: string,
    maskedSpanText: string,
    startLineIndex: number,
    exportOffset: number,
    specifierEndOffset: number
  ): void {
    const maskedSegment = maskedSpanText.slice(exportOffset, specifierEndOffset);
    const fromInSegment = maskedSegment.match(/from\s+['"`][^'"`]+['"`]/);
    if (!fromInSegment || fromInSegment.index === undefined) {
      return;
    }
    const fromAbsOffset = exportOffset + fromInSegment.index;
    const originalFromText = rawSpanText.slice(fromAbsOffset, fromAbsOffset + fromInSegment[0].length);
    const pathMatch = originalFromText.match(/from\s+['"`]([^'"`]+)['"`]/);
    if (!pathMatch) {
      return;
    }
    const { lineNumber, columnIndex } = this.resolveSpanPosition(maskedSpanText, startLineIndex, exportOffset);
    const exportMatchText = rawSpanText.slice(exportOffset, specifierEndOffset);
    const rawStatement = this.appendTrailingSemicolonIfAdjacent(rawSpanText, exportMatchText, exportOffset);
    const statement = this.createImportStatement(
      ImportStatementType.EXPORT,
      pathMatch[1],
      lineNumber,
      columnIndex,
      rawStatement
    );
    if (statement) {
      statements.push(statement);
    }
  }

  /**
   * 將已收集完成的多行 require()/import() 呼叫語句轉為 ImportStatement。
   * module specifier 一律從未遮罩的原始多行文字重新切出，遮罩版本只用於
   * collectMultilineCallStatement 判斷「呼叫語句是否完整」（見 C9/C10 regression）。
   *
   * 定位真正呼叫的起點一律用遮罩後文字找 match index：起始行行尾若有註解含
   * 完整形狀的假呼叫（如 `require( // legacy: require('./fake.js')`），對
   * 未遮罩原文取第一個 regex 命中會抓到註解裡的假呼叫，導致真正呼叫的
   * specifier 完全沒被解析（見 P2-1 regression）。遮罩後文字逐行拼接時保留
   * 每行原始長度（computeMaskedLines 只把內容置換成等長空白），與未遮罩
   * 版本以 '\n' join 的結果字元位置一一對應，可直接用同一組 index/length 切出
   * 未遮罩原文對應片段。
   */
  private pushMultilineCallStatement(
    statements: ImportStatement[],
    lines: string[],
    maskedLines: readonly string[],
    call: MultilineStatementSpan,
    type: ImportStatementType,
    keyword: 'require' | 'import'
  ): void {
    const callLines = lines.slice(call.startLineIndex, call.endLineIndex + 1);
    const rawStatementText = callLines.join('\n');
    const maskedStatementText = maskedLines.slice(call.startLineIndex, call.endLineIndex + 1).join('\n');
    const callPattern = new RegExp(`\\b${keyword}\\s*\\(\\s*['"\`][^'"\`]+['"\`]\\s*\\)`);
    const maskedMatch = maskedStatementText.match(callPattern);
    if (!maskedMatch || maskedMatch.index === undefined) {
      return;
    }
    const originalMatchText = rawStatementText.slice(maskedMatch.index, maskedMatch.index + maskedMatch[0].length);
    // 引號區間的「位置」必須從遮罩後的呼叫文字取得，不可對 originalMatchText 重新搜尋：
    // originalMatchText 是未遮罩原文，若起始行行尾註解含完整假呼叫，其中的假引號對
    // 會比真正的引號對更早出現，對 originalMatchText 直接搜尋第一個引號對會抓到假的
    // （見 P2-1 regression）。遮罩後文字中註解已整段變空白，僅真正的引號對還在，
    // 兩者逐字元等長對齊，用遮罩版本找到的位置去原文切內容即可保證抓到真正的引號對。
    const quoteSpanMatch = maskedMatch[0].match(/['"`][^'"`]*['"`]/);
    if (!quoteSpanMatch || quoteSpanMatch.index === undefined) {
      return;
    }
    const importPath = originalMatchText.slice(quoteSpanMatch.index + 1, quoteSpanMatch.index + quoteSpanMatch[0].length - 1);
    // 真正 specifier（含引號）在 rawStatementText 中的絕對起始位置：下游
    // path-calculator.replaceModuleSpecifier 遇到起始行行尾有假呼叫註解時，
    // 「keyword( 緊接著引號」的結構假設會因中間插入的註解文字而找不到真正呼叫
    // （見 P2-1 regression：真正呼叫的 keyword( 與引號之間隔著整段行內註解，
    // \s* 無法跨越非空白字元），須帶上精確位置錨點才能正確定位替換，不能只靠
    // 文字內容比對。
    const specifierOffset = maskedMatch.index + quoteSpanMatch.index;
    const startLine = lines[call.startLineIndex];
    const columnIndex = startLine.length - startLine.trimStart().length;
    const statement = this.createImportStatement(
      type,
      importPath,
      call.startLineIndex + 1,
      columnIndex,
      rawStatementText,
      specifierOffset
    );
    if (statement) {
      statements.push(statement);
    }
  }

  /**
   * 解析單行內的 require()/import() 呼叫（同行可能有多筆，見既有行為）。
   * 存在性比對一律用遮罩後文字，避免字串字面值／行內註解中長得像呼叫的文字
   * 被誤判為真正呼叫（見 C9 regression）；module specifier 一律從未遮罩的
   * 原始文字依相同字元位置重新切出（遮罩版本引號內容只是佔位空白）。
   *
   * rawStatement 與 column 一律以「該筆呼叫在行內的實際出現位置」（match）為準，
   * 不可共用整行文字與行首縮排：同一行兩筆呼叫指向同一模組時，若都用整行當
   * rawStatement、行首縮排當 column，下游 path-calculator 的去重鍵會碰撞，只有
   * 第一筆被當作有效更新，第二筆殘留舊 specifier（見 P2-2 regression，比照
   * 上方 parseImportStatements 對同行多個 ES6 import 的 C7 修復）。
   */
  private pushSingleLineCallStatements(
    statements: ImportStatement[],
    line: string,
    maskedLine: string,
    lineNumber: number,
    type: ImportStatementType,
    keyword: 'require' | 'import'
  ): void {
    const pattern = new RegExp(`\\b${keyword}\\s*\\(\\s*['"\`][^'"\`]+['"\`]\\s*\\)`, 'g');
    const matches = maskedLine.matchAll(pattern);
    for (const match of matches) {
      const matchIndex = match.index ?? 0;
      const originalMatchText = line.slice(matchIndex, matchIndex + match[0].length);
      const pathMatch = originalMatchText.match(/['"`]([^'"`]+)['"`]/);
      if (!pathMatch) {
        continue;
      }
      const statement = this.createImportStatement(
        type,
        pathMatch[1],
        lineNumber,
        matchIndex,
        originalMatchText
      );
      if (statement) {
        statements.push(statement);
      }
    }
  }

  /**
   * 更新 import 路徑
   */
  updateImportPath(
    importStatement: ImportStatement,
    oldFilePath: string,
    newFilePath: string
  ): ImportUpdate {
    const { path: importPath, rawStatement, position } = importStatement;

    // 如果是 Node 模組，不需要更新
    if (this.isNodeModuleImport(importPath)) {
      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: rawStatement,
        success: true
      };
    }

    try {
      let newImportPath = importPath;

      if (importStatement.pathType === PathType.RELATIVE) {
        // 計算新的相對路徑
        const currentDir = path.dirname(oldFilePath);
        const targetPath = path.resolve(currentDir, importPath);
        const newDir = path.dirname(newFilePath);
        newImportPath = this.calculateRelativePath(newDir, targetPath);
      } else if (importStatement.pathType === PathType.ALIAS) {
        // 解析別名並重新計算
        const resolvedPath = this.resolvePathAlias(importPath);
        if (resolvedPath !== importPath) {
          const absoluteTargetPath = path.resolve(resolvedPath);
          newImportPath = this.calculateRelativePath(newFilePath, absoluteTargetPath);
        }
      }

      // 更新 import 語句
      const newStatement = rawStatement.replace(
        new RegExp(`['"\`]${escapeRegex(importPath)}['"\`]`),
        `'${newImportPath}'`
      );

      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: newStatement,
        success: true
      };
    } catch (error) {
      return {
        filePath: oldFilePath,
        line: position.line,
        oldImport: rawStatement,
        newImport: rawStatement,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 解析路徑別名
   * 返回絕對路徑（如果 pathAliases 中的值是絕對路徑）
   */
  resolvePathAlias(aliasPath: string): string {
    const resolved = resolveBarePathAlias(aliasPath, this.config.pathAliases);
    if (resolved === null) {
      return aliasPath;
    }

    // 同步 API 沒有檔案系統可用，只能維持 loader 相容 view 的單一路徑投影；
    // move 的實際解析一律由下方 async 版本依具體 target 存在性選擇候選。
    const match = findPathAliasMatch(aliasPath, this.config.pathAliases);
    return match?.candidates.at(-1) ?? resolved;
  }

  /**
   * 解析路徑別名，依實際檔案存在性選擇候選路徑。
   */
  async resolvePathAliasAsync(aliasPath: string, fileSystem: IFileSystem): Promise<string> {
    return await resolveBarePathAliasAsync(
      aliasPath,
      this.config.pathAliases,
      async candidate => await fileSystem.exists(candidate) && await fileSystem.isFile(candidate),
      this.config.supportedExtensions
    ) ?? aliasPath;
  }

  /**
   * 計算相對路徑
   */
  calculateRelativePath(fromPath: string, toPath: string): string {
    // 如果 fromPath 是檔案，取其目錄
    const fromDir = path.extname(fromPath) ? path.dirname(fromPath) : fromPath;
    let relativePath = path.relative(fromDir, toPath);

    // 移除副檔名（如果目標是受支援的檔案類型）；沿用 stripSourceFileExtension
    // 正確處理 .d.ts/.d.mts/.d.cts 等宣告檔特殊映射，不用手刻 path.extname 版本
    // （naive 版本對 .d.ts 只會剝掉 .ts，遺留 .d 尾綴）
    relativePath = stripSourceFileExtension(relativePath, this.config.supportedExtensions);

    // 確保相對路徑以 ./ 或 ../ 開始
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    // 統一使用正斜線
    return relativePath.replace(/\\/g, '/');
  }

  /**
   * 提取 import 語句中的符號
   */
  findImportedSymbols(statement: string): string[] {
    const symbols: string[] = [];

    // 處理混合 import: import React, { Component, useState } from 'react'
    const mixedImportMatch = statement.match(MIXED_IMPORT_PATTERN);
    if (mixedImportMatch) {
      symbols.push(mixedImportMatch[1]); // 預設 import
      symbols.push(...this.parseNamedImportItems(mixedImportMatch[2]));
      return symbols;
    }

    // 處理預設 import: import React from 'react'
    const defaultImportMatch = statement.match(DEFAULT_IMPORT_PATTERN);
    if (defaultImportMatch) {
      symbols.push(defaultImportMatch[1]);
    }

    // 處理具名 import: import { Component, useState } from 'react'
    const namedImportMatch = statement.match(NAMED_IMPORT_BLOCK_PATTERN);
    if (namedImportMatch) {
      symbols.push(...this.parseNamedImportItems(namedImportMatch[1]));
    }

    // 處理 namespace import: import * as React from 'react'
    const namespaceImportMatch = statement.match(NAMESPACE_IMPORT_PATTERN);
    if (namespaceImportMatch) {
      symbols.push(namespaceImportMatch[1]);
    }

    return symbols;
  }

  /**
   * 解析具名 import 區塊內容（如 `Component, useState as State`），支援
   * Unicode／`$` 別名。供混合 import 與具名 import 兩處共用（見上方
   * findImportedSymbols），避免同一份別名解析邏輯重複維護。
   */
  private parseNamedImportItems(namedImportsText: string): string[] {
    return namedImportsText
      .split(',')
      .map(item => {
        const trimmed = item.trim();
        // 處理別名: Component as Comp
        const aliasMatch = trimmed.match(NAMED_IMPORT_ALIAS_PATTERN);
        return aliasMatch ? aliasMatch[2] : trimmed;
      })
      .filter(Boolean);
  }

  /**
   * 是否為 Node 內建模組（含子路徑，如 `fs/promises`、`node:fs/promises`）。
   * `builtinModules` 為 Node 自身權威清單（Single Source of Truth），非猜測式白名單。
   * 抽成獨立方法供 isNodeModuleImport 與 resolveImportPath 共用同一判定（見 R2-6b）。
   */
  isBuiltinModule(importPath: string): boolean {
    const withoutNodePrefix = importPath.startsWith('node:') ? importPath.slice(5) : importPath;
    return builtinModules.includes(importPath) || builtinModules.includes(withoutNodePrefix);
  }

  /**
   * 檢查是否為 Node 模組 import
   */
  isNodeModuleImport(importPath: string): boolean {
    // 相對路徑不是 Node 模組
    if (importPath.startsWith('.') || importPath.startsWith('/')) {
      return false;
    }

    // 檢查是否為路徑別名（使用快取的 aliasKeys）
    for (const alias of this.aliasKeys) {
      if (importPath === alias || importPath.startsWith(alias + '/')) {
        return false;
      }
    }

    // Node 內建模組一律視為 node module：即使 baseUrl 已設定，也不應被下方
    // 「含 '/' 即視為 baseUrl 相對路徑」的結構性判斷誤判成專案內路徑
    // （見 P2-2 bug：`fs/promises` 被誤判為 baseUrl 相對路徑）。
    if (this.isBuiltinModule(importPath)) {
      return true;
    }

    // 檢查是否為 baseUrl 相對路徑（如 src/utils、client/utils、server/api）
    // TypeScript 允許在設定 baseUrl 時使用非 ./ 開頭的路徑。真實專案的 baseUrl
    // 根目錄名稱不限於少數幾個常見字（如 'client'、'server'），猜測式白名單
    // 會把任意第一段路徑誤判為 node module，導致 move 拒絕改寫合法的內部 import
    // （見 adversarial R1 regression）。改用結構性判斷：非 scoped package 且含子路徑
    // （有 '/'）時，視為 baseUrl 相對路徑；scoped package 保留 node module 判定，
    // 由具備目標路徑上下文的 move scanner/calculator 另行驗證 baseUrl 候選。
    if (this.config.baseUrl && !importPath.startsWith('@') && importPath.includes('/')) {
      return false;
    }

    // 其他都視為 Node 模組
    return true;
  }

  /** Scoped bare imports may be project-internal under baseUrl; callers must verify the target file. */
  isScopedBaseUrlImport(importPath: string): boolean {
    return Boolean(
      this.config.baseUrl
      && importPath.startsWith('@')
      && importPath.includes('/')
      && !this.isBuiltinModule(importPath)
    );
  }

  /**
   * 建立 ImportStatement 物件
   */
  private createImportStatement(
    type: ImportStatementType,
    importPath: string,
    lineNumber: number,
    columnIndex: number,
    rawStatement: string,
    specifierOffset?: number
  ): ImportStatement | null {
    // columnIndex 必須指向 rawStatement trim 後在該行的起始位置，供下游以 column 錨定替換。
    const position = createPosition(lineNumber, columnIndex + 1);
    const range = createRange(position, createPosition(lineNumber, columnIndex + rawStatement.length));

    const pathType = this.determinePathType(importPath);
    const isRelative = pathType === PathType.RELATIVE;

    const importedSymbols = type === ImportStatementType.IMPORT ? this.findImportedSymbols(rawStatement) : undefined;

    // specifierOffset 是相對於「trim 前」rawStatement 算出來的絕對位置（見
    // pushMultilineCallStatement），trim() 只會移除開頭空白，故需扣掉被移除的
    // 開頭空白長度，換算成相對於最終儲存的 rawStatement（已 trim）的位置，
    // 供下游 path-calculator 精確錨定 specifier、不受同語句內其他文字（如
    // 起始行行尾註解裡的假呼叫）干擾（見 P2-1 regression）。
    const leadingTrimmedLength = rawStatement.length - rawStatement.trimStart().length;
    const adjustedSpecifierOffset = specifierOffset !== undefined
      ? specifierOffset - leadingTrimmedLength
      : undefined;

    return {
      type,
      path: importPath,
      pathType,
      position,
      range,
      isRelative,
      importedSymbols,
      rawStatement: rawStatement.trim(),
      specifierOffset: adjustedSpecifierOffset
    };
  }

  /**
   * 判斷路徑型別
   */
  private determinePathType(importPath: string): PathType {
    if (importPath.startsWith('.')) {
      return PathType.RELATIVE;
    }

    // 檢查是否為路徑別名（使用快取的 aliasKeys）
    for (const alias of this.aliasKeys) {
      if (importPath.startsWith(alias)) {
        return PathType.ALIAS;
      }
    }

    return PathType.ABSOLUTE;
  }

  /**
   * 檢查是否為註解行
   */
  private isCommentLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith('//') ||
           trimmed.startsWith('/*') ||
           trimmed.startsWith('*');
  }
}
