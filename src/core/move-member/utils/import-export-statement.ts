/**
 * Import/Export 語句掃描
 * 從 reference-updater.ts 抽出（該檔逼近 800 行上限）：本模組不依賴
 * ReferenceUpdater 實例狀態，純函式化的語句範圍掃描邏輯獨立成檔更易維護。
 */

import type { ReferenceUpdate } from '../types.js';

/**
 * `export ` 後緊接這些關鍵字（含 default/async/abstract/declare 修飾詞）時，
 * 一定是宣告（class/function/interface/enum/namespace/module 本體，或
 * const/let/var 賦值），不可能是 import/export-from 語句——後者只會是
 * `export {`、`export *`、`export type {` 等具名/星號形式。用於在多行收集
 * 一開始就排除宣告本體，避免 ASI 無分號風格下把整段宣告本體誤吸收成
 * 未結束的 import/export 語句（見 collectImportExportStatement 說明）。
 */
const declarationBodyStartPattern =
  /^(?:default\b|(?:async\s+|abstract\s+|declare\s+)*(?:class|function|interface|enum|namespace|module|const|let|var)\b)/;

/**
 * 計算文字中大括號的最大巢狀深度（忽略字串/樣板字面值內容中的大括號字元）。
 * 合法的 import/export 具名清單（`{ a, b }`）只會有單層深度；深度達到 2
 * 代表已經吃進宣告本體內部的巢狀結構（如 class 內的 method body），
 * 用於多行收集的累積安全網（見 collectImportExportStatement 說明）。
 */
function computeMaxBraceDepth(text: string): number {
  let depth = 0;
  let maxDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (char === '\\') { i++; continue; }
      if (char === quote) { quote = null; }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      quote = char;
    } else if (char === '{') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (char === '}') {
      depth = Math.max(0, depth - 1);
    }
  }

  return maxDepth;
}

export interface ImportExportStatement {
  readonly text: string;
  readonly startLineIndex: number;
  /** 語句起始字元在 startLineIndex 該行的 0-based 欄位（略過前導空白） */
  readonly startColumnIndex: number;
  readonly endLineIndex: number;
  /** 語句結束字元在 endLineIndex 該行的 0-based 欄位（exclusive，即結尾字元的下一個位置） */
  readonly endColumnIndex: number;
}

/**
 * 由 import/export 語句建立 ReferenceUpdate 的 location 範圍
 * 一律用語句自身精確的起訖欄位（見 collectImportExportStatement），而非
 * 固定「整行」（column 1 到行尾）：多個 import/export 語句共用同一物理行時
 * （如 `import { moved } from './source'; import { unrelated } from './other';`），
 * 固定整行範圍會讓其中一筆語句的替換覆蓋掉同行另一筆語句的文字，導致該筆
 * 語句在改寫時被靜默丟棄（見缺陷：同行第二個 import 消失）。
 */
export function createStatementLocation(
  filePath: string,
  statement: ImportExportStatement
): ReferenceUpdate['location'] {
  return {
    filePath,
    range: {
      start: { line: statement.startLineIndex + 1, column: statement.startColumnIndex + 1 },
      end: {
        line: statement.endLineIndex + 1,
        column: statement.endColumnIndex + 1
      }
    }
  };
}

/**
 * 收集單一 import/export-from 語句的精確範圍（起訖行 + 起訖欄位）。
 *
 * `startColumnIndex` 為掃描起點在 startLineIndex 該行的 0-based 欄位，預設 0
 * （行首）；呼叫端在同一物理行已處理完一筆語句、該行仍有殘餘內容（如緊接著
 * 第二筆 import/export）時，會帶入該語句結束後的欄位重新掃描同一行，而非
 * 整行跳過（見缺陷：同物理行多筆 import 只有第一筆被辨識，第二筆連同其存在
 * 一併被忽略）。
 *
 * 語句結尾精確定位在「本語句自己的」`from '<path>'` 子句結束處（必要時併入
 * 緊接的 `;`），而非「這一整行/整段累積文字是否含分號」——原本以整行/整段
 * 文字當作語句內容，同行有第二筆語句時會把它一併吞進 text，造成後續改寫
 * 覆蓋掉第二筆語句的原文。
 *
 * 多行收集的繼續條件需要結構性邊界，不能只靠「還沒出現分號」判斷：ASI（無
 * 分號）風格下，`export class Foo { ... }`／`export function foo() { ... }`
 * 這類宣告本體完全不含分號，若僅以分號終止多行累積，會一路吸收到後面某行
 * 恰好出現的 `from '<path>'`（如另一筆 `export { a, b } from './x'`）才停止，
 * 導致中間整段宣告本體被當成同一筆 import/export 語句的文字，改寫時被覆蓋
 * 刪除。修法分兩層：
 *   1. 起點排除：`export ` 後緊接 class/function/interface/enum/namespace/
 *      module（含 default/async/abstract/declare 修飾詞）等宣告關鍵字時，
 *      這行本來就不可能是合法的 import/export-from 語句起點，直接回傳 null，
 *      讓呼叫端逐行掃描、不進入多行收集。
 *   2. 累積安全網：就算起點通過檢查，累積文字中大括號巢狀深度達到 2 層
 *      （合法 import/export 具名清單只會有單層 `{ ... }`，深度 2 代表已經
 *      吃進宣告本體內的巢狀結構，如 class 內的 method body），視為非
 *      import/export 語句、終止累積。
 */
export function collectImportExportStatement(
  lines: readonly string[],
  startLineIndex: number,
  startColumnIndex = 0
): ImportExportStatement | null {
  const remainder = lines[startLineIndex].slice(startColumnIndex);
  const leadingWhitespaceLength = remainder.length - remainder.trimStart().length;
  const contentStartColumn = startColumnIndex + leadingWhitespaceLength;
  const contentFromStart = lines[startLineIndex].slice(contentStartColumn);

  if (!contentFromStart.startsWith('import ') && !contentFromStart.startsWith('export ')) {
    return null;
  }

  // 'import ' 與 'export ' 長度相同（皆為 7），取關鍵字後的殘餘內容統一判斷
  const afterKeyword = contentFromStart.slice(7);
  if (declarationBodyStartPattern.test(afterKeyword)) {
    return null;
  }

  let text = contentFromStart;
  let endLineIndex = startLineIndex;
  const fromClausePattern = /from\s+['"`][^'"`]+['"`]/;

  while (true) {
    const fromMatch = fromClausePattern.exec(text);
    if (fromMatch) {
      const matchEnd = fromMatch.index + fromMatch[0].length;
      const hasTrailingSemicolon = text[matchEnd] === ';';
      const statementEnd = hasTrailingSemicolon ? matchEnd + 1 : matchEnd;
      const statementText = text.slice(0, statementEnd);
      const statementLines = statementText.split('\n');
      const finalLineIndex = startLineIndex + statementLines.length - 1;
      const lastStatementLine = statementLines[statementLines.length - 1];
      const endColumnIndex = statementLines.length === 1
        ? contentStartColumn + lastStatementLine.length
        : lastStatementLine.length;

      return {
        text: statementText,
        startLineIndex,
        startColumnIndex: contentStartColumn,
        endLineIndex: finalLineIndex,
        endColumnIndex
      };
    }

    // 累積文字已出現 `;` 仍未取得 from 子句 → 這是與 import/export-from 無關
    // 的完整語句（如無 from 的 `export { x };`），不得繼續吸收下一行造成跨語句融合
    if (text.includes(';')) {
      return null;
    }

    // 累積安全網：大括號巢狀深度達到 2 層，代表已經吃進宣告本體內部的巢狀
    // 結構（如 class body 內的 method body），不可能仍是合法的 import/export
    // 具名清單，終止累積避免繼續吸收到後面不相關的 from 子句
    if (computeMaxBraceDepth(text) >= 2) {
      return null;
    }

    endLineIndex++;
    if (endLineIndex >= lines.length) {
      return null;
    }
    text += `\n${lines[endLineIndex]}`;
  }
}
