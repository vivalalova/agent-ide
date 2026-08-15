/**
 * Regex 字面值起點啟發式（單一權威來源）
 *
 * JS/TS 的 `/` 同時是除法運算子與 regex 字面值的分隔符，只靠字元掃描無法完全消歧義；
 * 各個「逐字元狀態機」（code-state-mask 的 computeCodeCharKinds、symbol-finder 的
 * TextMatcher.scanSource）都需要同一份判定，故此處收斂為唯一實作，禁在各掃描器內
 * 各留一份啟發式（歷史上兩份各自演化，導致成員存取排除只修在其中一份 — 缺陷 F5-1）。
 *
 * 判定方式：看 `/` 之前最近一個非空白字元
 * - 掃描起點（前面沒有有效字元）→ regex 起點
 * - 運算子／開括號／逗號／冒號／等號／分號／大括號等「不可能是除法左運算元結尾」→ regex 起點
 * - `)`：只有 `if (...) /re/` 這類控制流程括號收尾才是 regex 起點，函式呼叫 `f() / 2` 是除法
 * - 識別符結尾：僅 `return` / `typeof` / `await` 等關鍵字之後是 regex 起點；且該識別符前一個
 *   字元為 `.`（含 optional chaining `?.`）時它是屬性名稱而非關鍵字，如
 *   `cache.delete / total` 的 `delete` 是方法名、`/` 是除法（F5-1）
 * - 其餘（識別符、數字、`]` 等值結尾）→ 除法
 *
 * 這是 heuristic 而非完整 parser；在遮罩／文字比對用途下已足夠。
 */

import { isIdentifierContinueChar } from './symbol-finder/identifier-matcher.js';

/** regex 字面值可能出現在其前的字元（「不可能是除法」的情境） */
const REGEX_PRECEDING_CHARS: ReadonlySet<string> = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '^', '~', '<', '>'
]);

/** 其後可直接接 regex 字面值的關鍵字 */
const REGEX_PRECEDING_KEYWORDS: ReadonlySet<string> = new Set([
  'return', 'typeof', 'in', 'of', 'case', 'do', 'else', 'void', 'delete',
  'instanceof', 'new', 'throw', 'yield', 'await'
]);

/** `(...)` 收尾後仍可接 regex 字面值的控制流程關鍵字 */
const REGEX_CONTROL_KEYWORDS: ReadonlySet<string> = new Set(['if', 'for', 'while']);

/** 由 position 往前找最近一個非空白字元的索引；找不到回傳 -1 */
function findPrecedingMeaningfulIndex(text: string, position: number): number {
  let i = position - 1;
  while (i >= 0 && /\s/.test(text[i])) {
    i--;
  }
  return i;
}

/**
 * 由 closePosition（`)` 的索引）往前配對，判斷這個括號是否屬於 `if` / `for` / `while`
 */
function isControlFlowParenClose(text: string, closePosition: number): boolean {
  let depth = 1;
  for (let i = closePosition - 1; i >= 0; i--) {
    if (text[i] === ')') {
      depth++;
      continue;
    }
    if (text[i] !== '(') {
      continue;
    }
    depth--;
    if (depth !== 0) {
      continue;
    }
    let end = i - 1;
    while (end >= 0 && /\s/.test(text[end])) { end--; }
    let start = end;
    while (start >= 0 && isIdentifierContinueChar(text[start])) { start--; }
    return REGEX_CONTROL_KEYWORDS.has(text.slice(start + 1, end + 1));
  }
  return false;
}

/**
 * 判斷 text[position]（必為 `/`）是否為 regex 字面值的起點（而非除法運算子）
 *
 * @param text 掃描中的完整文字
 * @param position `/` 字元的索引
 */
export function isRegexLiteralStart(text: string, position: number): boolean {
  // `//` 是行註解起點，不可能是 regex 字面值
  if (text[position + 1] === '/') {
    return false;
  }

  const previousIndex = findPrecedingMeaningfulIndex(text, position);
  if (previousIndex < 0) {
    return true;
  }

  const previous = text[previousIndex];
  if (REGEX_PRECEDING_CHARS.has(previous)) {
    return true;
  }
  if (previous === ')') {
    return isControlFlowParenClose(text, previousIndex);
  }
  if (isIdentifierContinueChar(previous)) {
    let start = previousIndex;
    while (start >= 0 && isIdentifierContinueChar(text[start])) {
      start--;
    }
    // 成員存取（`.delete` / `?.delete`）：識別符是屬性名稱而非關鍵字
    if (text[start] === '.') {
      return false;
    }
    return REGEX_PRECEDING_KEYWORDS.has(text.slice(start + 1, previousIndex + 1));
  }
  return false;
}
