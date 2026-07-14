/**
 * 多行語句收集
 * 負責偵測並收集可能跨行書寫的 import / export-from / require、動態 import()
 * 陳述式的完整範圍（起訖行），供 import-resolver 後續在遮罩後文字上定位與切出
 * 真正的模組路徑
 */

import { maskStringsAndComments } from './source-masking.js';

/**
 * Unicode 識別符字元類別（不含頭尾錨點），語意對應
 * plugins/shared/parser-helpers.ts 的 UNICODE_IDENTIFIER_PATTERN（UAX #31：
 * ID_Start / ID_Continue）。因架構限制 core 不可直接依賴 plugins（見
 * infrastructure/parser/initializer.ts 的橋接說明），故在此模組內本地定義同等
 * 字元類別，供下方 import 陳述式偵測正則辨識 Unicode 別名
 * （如 `import * as 工具 from '...'`，見 C6 regression）。
 */
export const UNICODE_IDENTIFIER_CLASS = '[\\p{ID_Start}_$][\\p{ID_Continue}$]*';

/**
 * 多行語句往後收集的最大行數上限：import / export-from / require、動態 import()
 * 三個 collector 共用同一上限，禁止各自維護不同數字——過去 export 分支誤設 10、
 * 其餘 200 的不對稱，使超過 10 行的大型具名 re-export 在湊齊完整形狀前就先 break
 * 回傳 null、路徑靜默殘留（見 P2-CAP regression）。
 */
const MAX_MULTILINE_STATEMENT_LINES = 200;

/**
 * re-export 候選起始形狀白名單：遮罩後 `export`（可選 `type`）緊接 `{`（具名）或
 * `*`（星號，含 `* as ns`）。唯有此形狀才可能是 export ... from；
 * `export const/let/var/function/class/default/interface/enum` 等宣告一律不是
 * re-export，用於 collectMultilineExportStatement 進場守門：避免像
 * `export const config = {` 這類具名匯出宣告（大括號淨深度雖 +1）被當成多行
 * export-from 起點、往後吞掉無關的 require/import 行（見 P3-A regression）。
 *
 * 帶 'g' flag：起始行可能有多筆候選（如 `export { setup }; export { y } from '...'`），
 * 須枚舉「全部」候選 offset 作為 sticky 錨定基準，不可只取第一筆——只取第一筆時，
 * 前置的無 from 本地清單（`export { setup }`）湊不齊便回 null，遮蔽了同行/同 span
 * 內緊接的真 re-export（見 P2-STICKY-SINGLE-ANCHOR regression）。僅供 matchAll 枚舉。
 */
const EXPORT_FROM_START_PATTERN = /\bexport\s+(?:type\s+)?[{*]/g;

/**
 * 完整 `export ... from '...'` 偵測用 pattern 來源字串：具名區塊以「非貪婪單層」
 * `\{[^{}]*\}` 界定（不跨越無關語句、避免貪婪 `}` 湊出假 span），星號支援
 * `* as ns`（Unicode 別名）。涵蓋 `export *` 的 from 換行形狀（from 與路徑字串
 * 分屬不同行，見 P3-C regression）。完整性判斷（sticky 'y' flag＋每次呼叫前顯式設
 * lastIndex，見 isCompleteExportFromAt）與呼叫端逐筆列舉（matchAll，須帶 g flag）
 * 共用同一來源字串，避免兩份 pattern 各自維護、語意漂移。
 */
const EXPORT_FROM_STATEMENT_SOURCE =
  '\\bexport\\s+(?:type\\s+)?(?:\\{[^{}]*\\}|\\*(?:\\s+as\\s+' + UNICODE_IDENTIFIER_CLASS + ')?)' +
    '\\s+from\\s+[\'"`][^\'"`]+[\'"`]';

/**
 * 完整性判斷用：以 sticky（'y'）flag「錨定」在指定 offset——只認「從開出此 span 的
 * 那筆 export 起，就地湊齊完整 export-from」，而非累計文字任意位置命中。呼叫端每次
 * .test() 前須設 lastIndex = 起始 export 在累計文字中的 offset（見
 * isCompleteExportFromAt）。錨定是必要的：無 from 子句的本地具名清單（如
 * `export { setup };`）通過 EXPORT_FROM_START_PATTERN 白名單開 span 後，自己永遠湊不齊，
 * 未錨定的 .test() 會在累計文字撞到後方任一筆真 re-export 時就地命中而誤收尾，把中間的
 * import/require 吞成假 span、span 內第一個 from 綁錯 statement、收尾那筆真 re-export
 * 反而沒建 statement（見 P2-LOCAL-EXPORT-SWALLOW regression）。套用 'u' flag 啟用
 * \p{} 屬性跳脫、'y' flag 錨定。
 */
const EXPORT_FROM_COMPLETE_STICKY_PATTERN = new RegExp(EXPORT_FROM_STATEMENT_SOURCE, 'uy');

/**
 * 判斷「以 offset 為起點（sticky 錨定）」是否就地湊齊完整 export-from。offset 為開出
 * 此 span 的那筆 export 在 maskedText 中的位置；同時涵蓋 `export {...} from`（具名，
 * 其 `}` 之後須緊接 from）與 `export *` 星號（無大括號）兩種形狀，錨定基準一致。
 */
function isCompleteExportFromAt(maskedText: string, offset: number): boolean {
  EXPORT_FROM_COMPLETE_STICKY_PATTERN.lastIndex = offset;
  return EXPORT_FROM_COMPLETE_STICKY_PATTERN.test(maskedText);
}

/**
 * 逐筆列舉用（global，供呼叫端 matchAll 對任意 span——單行或多行——列舉全部
 * export-from，同行多筆與跨行形狀皆逐筆解析，見 import-resolver export 分支，
 * P3-DUAL-EXPORT-LINE）。僅供 matchAll 使用，勿用於有狀態的 .test/.exec 迴圈。
 * 套用 'g'/'u' flag。
 */
export const EXPORT_FROM_STATEMENT_PATTERN = new RegExp(EXPORT_FROM_STATEMENT_SOURCE, 'gu');

/**
 * 收集完成的多行 import / require() / 動態 import() 語句 span：statement 為
 * 原始（未遮罩）文字，供呼叫端從中切出真正的路徑內容
 */
export interface MultilineStatementSpan {
  statement: string;
  endLineIndex: number;
  startLineIndex: number;
}

/**
 * 收集完成的多行 export ... from 語句 span：僅回傳起訖行索引，真正的路徑與
 * 定位由呼叫端在遮罩後、逐字元對齊的 span 上重新求得
 */
export interface ExportStatementSpan {
  endLineIndex: number;
  startLineIndex: number;
}

/**
 * 收集多行的 import 語句。
 *
 * 完整性判斷一律用遮罩後文字：多行 import 中間行若含長得像結尾的假文字（如
 * `// } from './decoy.js'` 這種形狀的行內註解，其中的 `}` 會被不知情的完整性
 * 判斷誤認為真正具名匯入區塊的收尾），對未遮罩原文判斷會誤判該行就是語句
 * 結尾，導致真正的 from 子句完全沒被解析與更新（見 P3-1 regression，同下方
 * collectMultilineCallStatement 已採用的做法）。回傳的 statement 仍是原始
 * 未遮罩文字（供呼叫端切出真正的路徑內容），且與遮罩版本一律以 '\n' 逐行
 * 拼接、不 trim，確保兩者逐字元對齊、可用同一組 index 互相切換。
 */
export function collectMultilineImportStatement(lines: string[], startIndex: number): MultilineStatementSpan | null {
  const startLine = lines[startIndex];
  // 進場檢查一律用遮罩後文字：字串字面值／行內註解中的 'import' 字樣（如
  // `const msg = 'cannot import x';` 或 `const a = 1; // import note`）遮罩後即
  // 消失，不應讓該行被誤認為多行 import 的起點、與下一行真正的 import 併成同一個
  // span——那正是 P2-B 錯誤鏈得以成立的第一環（span 起始行落在假陽性行，
  // 下游行、列定位隨之全錯）。動態 import()（`import(`）交由
  // collectMultilineCallStatement 處理，此處排除；改用遮罩後文字判斷，避免
  // 字串內的 `import(` 字樣造成誤判。
  const maskedStartLine = maskStringsAndComments(startLine);
  if (!maskedStartLine.includes('import') || /\bimport\s*\(/.test(maskedStartLine)) {
    return null;
  }

  if (isCompleteImportStatement(maskedStartLine)) {
    return { statement: startLine, endLineIndex: startIndex, startLineIndex: startIndex };
  }

  let fullStatement = startLine;
  let maskedFullStatement = maskedStartLine;
  for (let i = startIndex + 1; i < lines.length; i++) {
    fullStatement += '\n' + lines[i];
    maskedFullStatement += '\n' + maskStringsAndComments(lines[i]);
    if (isCompleteImportStatement(maskedFullStatement)) {
      return { statement: fullStatement, endLineIndex: i, startLineIndex: startIndex };
    }
    if (i - startIndex > MAX_MULTILINE_STATEMENT_LINES) {
      break;
    }
  }

  return null;
}

function isCompleteImportStatement(statement: string): boolean {
  return /import\s+(?:type\s+)?(?:(?:\{[\s\S]*\}|\w+|\*\s+as\s+\w+)(?:\s*,\s*(?:\{[\s\S]*\}|\w+|\*\s+as\s+\w+))*\s+from\s+)?['"`][^'"`]+['"`]/.test(statement);
}

/**
 * 收集多行的 export ... from 語句，僅回傳「起訖行索引」（真正的路徑與定位由
 * 呼叫端在遮罩後、逐字元對齊的 span 上重新求得，見 import-resolver 的
 * export 分支）。
 *
 * 完整性與範圍判斷一律用遮罩後文字：字串字面值／行內註解中長得像 re-export 的
 * 文字（如 "... from './x'" 或 // } from './decoy.js'）遮罩後即消失，不應被誤判
 * 成真正的 export ... from（見 C5、export 分支實驗形狀 A/B/C regression）。
 */
export function collectMultilineExportStatement(lines: string[], startIndex: number): ExportStatementSpan | null {
  const maskedStartLine = maskStringsAndComments(lines[startIndex]);

  // 進場守門「看形狀白名單」（非看大括號深度）：只有 re-export 候選形狀
  // （export 之後可選 type，緊接 `{` 或 `*`）才可能是 export ... from。
  // export const/let/var/function/class/default/interface/enum 等宣告即使開了
  // 大括號（如 `export const config = {`）也非 re-export，直接排除——否則會被當成
  // 多行 export-from 起點，往後吞掉無關的 require/import 行（見 P3-A regression）。
  //
  // 枚舉起始行「全部」候選 export offset 作為 sticky 錨定基準：起始行可能有多筆
  // export（如 `export { setup }; export { y } from '...'`），完整性須對每個候選各測
  // 一次。只取第一筆當唯一錨時，前置的無 from 本地清單（`export { setup }`）湊不齊
  // 便回 null，遮蔽同行/同 span 內緊接、語法完整的真 re-export（見
  // P2-STICKY-SINGLE-ANCHOR regression）。
  const candidateOffsets = [...maskedStartLine.matchAll(EXPORT_FROM_START_PATTERN)].map(m => m.index ?? 0);
  if (candidateOffsets.length === 0) {
    return null;
  }

  // 起始行即已是完整 export ... from '...'（任一候選就地湊齊）→ 單行 span。
  // 真正逐筆解析與定位由 import-resolver 的 export 分支對此 span 做 matchAll 完成
  // （單行 span 可能含同行多筆 export-from），此處只負責界定 span 起訖。
  if (candidateOffsets.some(offset => isCompleteExportFromAt(maskedStartLine, offset))) {
    return { endLineIndex: startIndex, startLineIndex: startIndex };
  }

  // 多行：往後累計「遮罩後、以 '\n' 拼接」的文字，每輪對「全部候選 offset」各測一次，
  // 任一候選就地湊齊完整形狀即收尾。完整性一律「錨定」在候選 export（sticky）——只認
  // 「從該筆 export 起就地湊齊」，具名區塊用非貪婪單層 `{...}` 界定、其 `}` 之後須緊接
  // from；星號形狀（`export *`）無大括號、from 與路徑字串分屬不同行時亦能累計完整
  // （見 P3-C）。無 from 的本地具名清單（`export { setup };`）在任何錨點都永遠湊不齊、
  // 不會因撞到後方真 re-export 而誤收尾（見 P2-LOCAL-EXPORT-SWALLOW）；中途無關的
  // require/import 行同樣無法湊出完整形狀（形狀 D／P3-A）。每行候選數極少，逐一測試
  // 成本可忽略。
  let maskedFull = maskedStartLine;
  for (let i = startIndex + 1; i < lines.length; i++) {
    maskedFull += '\n' + maskStringsAndComments(lines[i]);
    if (candidateOffsets.some(offset => isCompleteExportFromAt(maskedFull, offset))) {
      return { endLineIndex: i, startLineIndex: startIndex };
    }
    if (i - startIndex > MAX_MULTILINE_STATEMENT_LINES) {
      break;
    }
  }

  return null;
}

/**
 * 收集多行的 require() 或動態 import() 呼叫語句，對應 collectMultilineImportStatement
 * 之於 ES6 import：module specifier 可能跨行書寫（如 `import(\n  './x'\n)`），
 * 需先收集完整呼叫語句才能正確定位並替換路徑（見 C10 regression）。完整性
 * 判斷一律用遮罩後文字，避免字串字面值／行內註解中的文字被誤判為呼叫起點
 * （見 C9 regression）；回傳的 statement 仍是原始未遮罩文字。
 */
export function collectMultilineCallStatement(
  lines: string[],
  startIndex: number,
  keyword: 'require' | 'import'
): MultilineStatementSpan | null {
  const startLine = lines[startIndex];
  const maskedStartLine = maskStringsAndComments(startLine);
  const openPattern = new RegExp(`\\b${keyword}\\s*\\(`);
  if (!openPattern.test(maskedStartLine)) {
    return null;
  }

  if (isCompleteCallStatement(maskedStartLine, keyword)) {
    return { statement: startLine, endLineIndex: startIndex, startLineIndex: startIndex };
  }

  let fullStatement = startLine;
  let maskedFullStatement = maskedStartLine;
  for (let i = startIndex + 1; i < lines.length; i++) {
    fullStatement += '\n' + lines[i];
    maskedFullStatement += '\n' + maskStringsAndComments(lines[i]);
    if (isCompleteCallStatement(maskedFullStatement, keyword)) {
      return { statement: fullStatement, endLineIndex: i, startLineIndex: startIndex };
    }
    if (i - startIndex > MAX_MULTILINE_STATEMENT_LINES) {
      break;
    }
  }

  return null;
}

function isCompleteCallStatement(maskedText: string, keyword: 'require' | 'import'): boolean {
  return new RegExp(`\\b${keyword}\\s*\\(\\s*['"\`][^'"\`]+['"\`]\\s*\\)`).test(maskedText);
}
