/**
 * 字串字面值與註解遮罩
 * 供 import/export/require 語句偵測在判斷「這裡是不是一個陳述式」時，
 * 排除字串內容與註解中長得像陳述式的文字干擾。
 *
 * SSOT：狀態機一律委派 foundations/code-state-mask（computeCodeCharKinds），
 * 本模組只負責「import 掃描用的遮罩政策」與逐行切分——刪除舊的逐行弱狀態機。
 *
 * 遮罩政策：
 * - code：保留
 * - 引號／反引號分隔符：保留（供路徑正則 `['"\`]...['"\`]` 定位）
 * - module specifier 字串內容（緊接在 `require(` / `import(` / `from` 之後）：
 *   保留路徑本體，讓 template substitution 內的 require('./old') 可被掃描（F9）
 * - 其餘 string / comment / template / regex：置換為等長空白（保留換行）
 *
 * 樣板 `${...}` substitution 在 code-state-mask 內重新進入 code，因此
 * `` `x${require('./old')}` `` 的 require 關鍵字本身不會被抹掉。
 */

import { computeCodeCharKinds, type CodeCharKind } from '@core/foundations/code-state-mask.js';

/**
 * 對完整檔案內容套用 code-state-mask SSOT，產出與 content.split('\n') 一一對應、
 * 逐行遮罩後的文字陣列。跨行樣板／區塊註解由 SSOT 狀態機處理。
 *
 * @returns 與 content.split('\n') 一一對應、逐行遮罩後的文字陣列
 */
export function computeMaskedLines(content: string): string[] {
  const kinds = computeCodeCharKinds(content);
  let masked = '';
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const kind = kinds[i];

    if (kind === 'code' || ch === '\n') {
      masked += ch;
      continue;
    }

    // 引號／反引號分隔符一律保留，供路徑偵測正則命中
    if (ch === '\'' || ch === '"' || ch === '`') {
      masked += ch;
      continue;
    }

    // module specifier 路徑本體保留（require/import()/from 後的字串內容）
    if (kind === 'string' && isModuleSpecifierStringContent(content, kinds, i)) {
      masked += ch;
      continue;
    }

    masked += ' ';
  }
  return masked.split('\n');
}

/**
 * 判斷 index 所在字串是否為 module specifier
 * （opening quote 前為 `require(` / `import(` / `from`，中間可有空白）。
 * 用於保留路徑本體，同時仍遮罩文件字串裡的假 import 文字（C5/C9）。
 */
function isModuleSpecifierStringContent(
  content: string,
  kinds: readonly CodeCharKind[],
  index: number
): boolean {
  let start = index;
  while (start > 0 && kinds[start - 1] === 'string') {
    start--;
  }
  // start 指向 opening quote；看其前方是否為 specifier 引入語境
  return /(?:\brequire\s*\(|\bimport\s*\(|\bfrom)\s*$/.test(content.slice(0, start));
}
