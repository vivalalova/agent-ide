/**
 * 獨立語句 export 的解析、偵測與改寫
 * 從 file-change-preparer.ts 抽出（該檔逼近 800 行上限）：本模組不依賴
 * FileChangePreparer 實例狀態，純函式化的語句掃描/改寫邏輯獨立成檔更易維護。
 *
 * DANGLING-SOURCE-EXPORT 修復：成員宣告本體若無 inline export modifier，
 * 而是由檔內其他位置的獨立語句（`export default NAME;` 或 `export { NAME };`）
 * 對外匯出，該語句不在成員本身的移除行範圍內，成員被搬走後會變成指向
 * 已不存在符號的孤兒 export（tsc TS2304），但 CLI 仍回報 success。
 *
 * 修法：把該語句改寫成指向目標檔的 re-export（`export { NAME as ALIAS }
 * from '<target>'`），語意與既有 keepReexport 選項的橋接手法一致——都是
 * 「這個名字對外仍可從原路徑取得，只是實際定義搬到別處」。
 */

import { MemberType, type MemberDefinition } from '../types.js';
import { createIdentifierBoundaryRegex, maskNonCode } from '@core/foundations/index.js';

/**
 * 解析 `export { A, B as C }` 的符號列表，保留 local 名稱與實際 export 名稱的映射
 * （處理 as 別名）："A, B as C" → [["A", "A"], ["B", "C"]]
 * 無別名時 local 與 export 名稱相同；有別名時該符號實際對外可見的名稱是 as 之後的別名，
 * 非 as 之前的 local 名稱。
 */
export function parseExportSymbolPairs(symbolListStr: string): Array<[localName: string, exportedName: string]> {
  return symbolListStr
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map((trimmed): [string, string] => {
      const asIndex = trimmed.indexOf(' as ');
      if (asIndex === -1) { return [trimmed, trimmed]; }
      return [trimmed.slice(0, asIndex).trim(), trimmed.slice(asIndex + 4).trim()];
    });
}

function findDanglingDefaultExportMatch(content: string, memberName: string): RegExpExecArray | null {
  const maskedContent = maskNonCode(content);
  // 負向前瞻排除「識別符後仍接續運算式」的 default export（`export default Foo.bar;`、
  // `Foo()`、`Foo[k]`、標籤模板）：這類 default 匯出的是運算式求值結果、不是成員本身，
  // 改寫成 `export { Foo as default } from '<target>'` 既語意不符，也會把後綴（`.bar;`）
  // 留在 match 外形成破碎語法。此處保守跳過，維持原運算式不動（Foo 的來源由 import
  // 更新機制處理）。續行情形（`export default Foo\n  .bar;`）亦被涵蓋。
  const pattern = new RegExp(
    `export\\s+default\\s+${createIdentifierBoundaryRegex(memberName).source}(?!\\s*[.([\`])\\s*;?`,
    'u'
  );
  return pattern.exec(maskedContent);
}

/**
 * 找出檔內含有 memberName 作為 local 名稱的獨立具名 export 語句
 * （`export { A, B }`，不含 `from` 子句——帶 `from` 的是既有 re-export，
 * 非本次要處理的孤兒匯出）。
 */
function findDanglingNamedExportPairs(
  content: string,
  memberName: string
): { match: RegExpExecArray; pairs: Array<[string, string]> } | null {
  const maskedContent = maskNonCode(content);
  const pattern = /export\s*\{([^}]*)\}(?!\s*from)\s*;?/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(maskedContent)) !== null) {
    const pairs = parseExportSymbolPairs(match[1]);
    if (pairs.some(([local]) => local === memberName)) {
      return { match, pairs };
    }
  }
  return null;
}

/**
 * 來源檔是否以獨立語句（非 inline export modifier）匯出此成員名稱；
 * 供 prepareTargetFileChange 判斷目標檔是否需要補上 export，否則改寫後的
 * re-export 會指向目標檔一個並不存在的匯出，只是把孤兒引用從來源檔搬到目標檔。
 */
export function hasDanglingExportReference(content: string, memberName: string): boolean {
  return findDanglingDefaultExportMatch(content, memberName) !== null ||
    findDanglingNamedExportPairs(content, memberName) !== null;
}

/**
 * 改寫獨立語句形式的 `export default NAME;`（非 `export default function/class NAME`
 * 這種宣告即匯出的 inline 形式，那種形式的 export 隨宣告本體一併被移除）。
 */
function rewriteDanglingDefaultExport(content: string, memberName: string, relativePath: string): string {
  const match = findDanglingDefaultExportMatch(content, memberName);
  if (!match) { return content; }

  const replacement = `export { ${memberName} as default } from '${relativePath}';`;
  return content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
}

/**
 * 改寫 `export { A, B }` 這種獨立具名匯出語句中，恰好含被搬移成員名稱的那一個：
 * 其餘名稱維持原地匯出，只有被搬移的名稱重寫成指向目標檔的 re-export，
 * 保留原本的 export 別名（若有）。
 */
function rewriteDanglingNamedExport(content: string, memberName: string, relativePath: string): string {
  const found = findDanglingNamedExportPairs(content, memberName);
  if (!found) { return content; }

  const { match, pairs } = found;
  const targetPairs = pairs.filter(([local]) => local === memberName);
  if (targetPairs.length === 0) { return content; }

  // 同一 local 名稱可能以多個別名出現在同一句 export（`export { x as a, x as b }`），
  // 每個別名都各自對外可見、都要各自產生一條 re-export 子句，一個都不能少。
  //
  // 只在真的有別名（exportedAlias 與 memberName 不同）時才寫 `as alias`：
  // 別名相同時輸出自然的 `export { NAME } from '<path>'`，不遷就任何斷言
  // 硬塞冗餘的 `as NAME`——bare re-export 帶 `from` 子句已足以與「未改寫」
  // 的孤兒 export（不帶 from）在語法上明確區分。
  const movedClause = targetPairs
    .map(([, exportedAlias]) => exportedAlias === memberName
      ? `export { ${memberName} } from '${relativePath}';`
      : `export { ${memberName} as ${exportedAlias} } from '${relativePath}';`)
    .join('\n');

  const remainingPairs = pairs.filter(([local]) => local !== memberName);
  const remainingClause = remainingPairs.length > 0
    ? `export { ${remainingPairs.map(([local, alias]) => local === alias ? local : `${local} as ${alias}`).join(', ')} };`
    : '';

  const replacement = remainingClause ? `${remainingClause}\n${movedClause}` : movedClause;
  return content.slice(0, match.index) + replacement + content.slice(match.index + match[0].length);
}

/**
 * 改寫來源檔內殘留的獨立語句 export（見檔案頂端 DANGLING-SOURCE-EXPORT 說明）。
 * 呼叫端須自行排除同檔案內移動（sourceFile === target.filePath）：成員只是
 * 搬到同一檔案的另一位置，並未真的消失，獨立 export 陳述式仍指向合法存在的
 * 宣告，不是孤兒引用，也不該對自己產生無意義的 relative re-export path
 * （比照 reference-updater.ts buildSourceSelfReferenceImport 的 same-file 判斷）。
 */
export function rewriteDanglingExportStatements(
  content: string,
  member: Pick<MemberDefinition, 'name' | 'modifiers' | 'type'>,
  relativePathToTarget: string
): string {
  if (member.modifiers.includes('export')) {
    // inline export：export 關鍵字與宣告同行，已隨成員一併被移除，
    // 不會留下獨立語句
    return content;
  }
  if (member.type === MemberType.Method || member.type === MemberType.Property) {
    // class 成員無法被模組層級獨立 export 陳述式匯出，不會有這種殘留
    return content;
  }

  const afterDefault = rewriteDanglingDefaultExport(content, member.name, relativePathToTarget);
  return rewriteDanglingNamedExport(afterDefault, member.name, relativePathToTarget);
}
