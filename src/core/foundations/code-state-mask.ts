/**
 * Code State Mask
 * 逐字元掃描文字，標記每個字元是否處於「程式碼」狀態（非區塊/行註解、非字串內容、
 * 非樣板字面值內容、非 regex 字面值內容）
 *
 * 供括號/大括號配對時排除註解與字串內容中恰巧出現的符號干擾
 * （如 `fnc(/* ( *\/ 1, 2)` 的區塊註解、`fn<'('>(x)` 型別引數內的字串）。
 *
 * 原為 change-signature/call-site-updater.ts 的私有方法，因 move-member 的
 * range-finder 有相同需求而下沉至此作為共用基礎設施（Single Source of Truth）。
 */

import { isIdentifierContinueChar } from './symbol-finder/identifier-matcher.js';

/**
 * @param text 待掃描文字
 * @returns 與 text 等長的布林陣列，true 表示該位置字元屬於程式碼狀態
 */
export function computeCodeStateMask(text: string): boolean[] {
  type LeafMode = 'code' | 'lineComment' | 'blockComment' | 'string' | 'regex';

  // 樣板字面值（`...`）與其內部 `${...}` substitution 可任意巢狀，用堆疊表達：
  // - 'template' frame：目前在樣板字面值的文字內容中（非 code）
  // - 'substitution' frame：目前在 `${` 與其對應 `}` 之間的 code 內容中，
  //   braceDepth 追蹤此 substitution 內部（非收尾用）的巢狀 `{}` 深度，
  //   讓 substitution 內的物件字面值/區塊不會被誤判為 substitution 提前結束
  type Frame = { readonly kind: 'template' } | { kind: 'substitution'; braceDepth: number };

  const mask: boolean[] = new Array(text.length).fill(true);
  const stack: Frame[] = [];
  let mode: LeafMode = 'code';
  let quote = '';
  let regexInClass = false;

  // regex 字面值消歧義（除法 vs regex 開始）：用「前一個非空白有效字元」啟發式。
  // 前導為運算子/開括號/逗號/冒號/等號/行首/特定關鍵字（return 等）→ regex 開始；
  // 前導為識別符/數字/`)`/`]` 結尾 → 除法。此為 heuristic，非完整 parser，
  // 在 mask 的用途（括號配對、非精確 parse）下已足夠，已知侷限見函式註解。
  const isRegexContext = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(text[j])) {
      j--;
    }
    if (j < 0) {
      return true;
    }
    const prev = text[j];
    if (isIdentifierContinueChar(prev)) {
      let start = j;
      while (start >= 0 && isIdentifierContinueChar(text[start])) {
        start--;
      }
      const word = text.slice(start + 1, j + 1);
      const regexPrecedingKeywords = new Set([
        'return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void',
        'throw', 'yield', 'instanceof', 'do', 'else',
      ]);
      return regexPrecedingKeywords.has(word);
    }
    if (prev === ')' || prev === ']') {
      return false;
    }
    // 運算子、開括號、逗號、冒號、等號等 → regex 開始
    return true;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    const topFrame = stack.length > 0 ? stack[stack.length - 1] : undefined;

    if (topFrame !== undefined && topFrame.kind === 'template') {
      mask[i] = false;
      if (char === '\\' && i + 1 < text.length) {
        // 跳脫字元：連同下一個字元一併視為樣板內容
        mask[i + 1] = false;
        i++;
        continue;
      }
      if (char === '`') {
        // 收尾反引號：結束此層樣板字面值，回到外層狀態
        stack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        // 進入 substitution：`${` 本身是樣板語法分隔符（非 code），內容才是 code
        mask[i + 1] = false;
        stack.push({ kind: 'substitution', braceDepth: 0 });
        i++;
        continue;
      }
      continue;
    }

    if (mode === 'lineComment') {
      mask[i] = false;
      if (char === '\n') {
        mode = 'code';
      }
      continue;
    }

    if (mode === 'blockComment') {
      mask[i] = false;
      if (char === '*' && next === '/') {
        mask[i + 1] = false;
        mode = 'code';
        i++;
      }
      continue;
    }

    if (mode === 'string') {
      mask[i] = false;
      if (char === '\\' && i + 1 < text.length) {
        // 跳脫字元：連同下一個字元一併視為字串內容，避免跳脫的引號被誤判為結尾
        mask[i + 1] = false;
        i++;
        continue;
      }
      if (char === quote) {
        mode = 'code';
      }
      continue;
    }

    if (mode === 'regex') {
      mask[i] = false;
      if (char === '\\' && i + 1 < text.length) {
        mask[i + 1] = false;
        i++;
        continue;
      }
      if (char === '[') {
        regexInClass = true;
        continue;
      }
      if (char === ']') {
        regexInClass = false;
        continue;
      }
      if (char === '/' && !regexInClass) {
        mode = 'code';
      }
      continue;
    }

    // mode === 'code'
    if (char === '/' && next === '/') {
      mask[i] = false;
      mask[i + 1] = false;
      mode = 'lineComment';
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      mask[i] = false;
      mask[i + 1] = false;
      mode = 'blockComment';
      i++;
      continue;
    }
    if (char === '"' || char === '\'') {
      mask[i] = false;
      mode = 'string';
      quote = char;
      continue;
    }
    if (char === '`') {
      mask[i] = false;
      stack.push({ kind: 'template' });
      continue;
    }
    if (char === '/' && isRegexContext(i)) {
      mask[i] = false;
      mode = 'regex';
      regexInClass = false;
      continue;
    }
    if (topFrame !== undefined && topFrame.kind === 'substitution') {
      if (char === '{') {
        // substitution 內部的巢狀開括號（如物件字面值），非收尾括號
        topFrame.braceDepth++;
        continue;
      }
      if (char === '}') {
        if (topFrame.braceDepth > 0) {
          topFrame.braceDepth--;
          continue;
        }
        // 深度歸零：此 `}` 是 substitution 的收尾分隔符，回到外層樣板文字狀態
        mask[i] = false;
        stack.pop();
        continue;
      }
    }
    // 其餘為一般程式碼字元，維持 mask[i] = true
  }

  return mask;
}

/**
 * 將 text 中非 code 狀態（字串/樣板/註解/regex 字面值內容，含分隔符號本身，
 * 如引號、`//`、`/* *\/`）置換為空白，保留長度與換行位置不變、code 內容原樣保留。
 *
 * 供既有以正則掃描原始碼找宣告/依賴/識別符的呼叫端套用：對 maskNonCode(text) 執行
 * 原本的正則，字串/註解內容恰巧長得像宣告或識別符的干擾即消失，且比對到的 code
 * 內容（如識別符名稱）字元位置與原文完全對齊，capture group 擷取到的文字不受影響
 * （只有落在非 code 區間的內容被清空）。
 *
 * 只適用於「文字形狀判斷」用途；若需要保留原始逐字內容（如搬移成員的原始碼），
 * 一律從未遮罩的原文對應位置切出，不可用本函式的輸出當作真正內容。
 */
export function maskNonCode(text: string, mask: readonly boolean[] = computeCodeStateMask(text)): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += mask[i] || text[i] === '\n' ? text[i] : ' ';
  }
  return result;
}

/**
 * 從 startIndex（通常是 class/enum/interface 等宣告關鍵字所在位置）掃描，找到
 * 宣告本體（第一個非泛型子句內的 `{`）對應的收尾 `}` 字元位移。
 *
 * 用 computeCodeStateMask 排除字串/樣板/註解/regex 字面值內容中恰巧出現的括號
 * 干擾；同時在尚未找到本體開括號前以 angle-bracket 深度跳過泛型子句
 * （如 `class Box<T extends { value: string }>` 的 `<...>`）中的巢狀大括號，
 * 避免其被誤判為本體開括號（見 move-member 缺陷：泛型約束物件型別的 `{`/`}`
 * 提前配對歸零，導致 class 主體被截斷成只剩宣告行）。
 *
 * `>` 前一個字元為 `=`（即 `=>` 箭頭，函式型別回傳）時不計入 angle-bracket 收尾，
 * 與 move-member/extractors/typescript-extractor.ts 的 skipGenericParams 判定
 * 一致，避免泛型約束內的函式型別（如 `<T extends { fn: () => void }>`）誤讓
 * angle 深度提前歸零。
 *
 * @param text 掃描的完整文字
 * @param startIndex 開始掃描的字元位移（宣告關鍵字或更早的位置皆可）
 * @param mask 與 text 等長的程式碼狀態遮罩，預設重新計算；呼叫端已有現成 mask
 *   時可傳入避免重複計算
 * @returns 對應收尾 `}` 的字元位移；找不到（未閉合）則回傳 -1
 */
export function findMatchingBodyBraceEnd(
  text: string,
  startIndex: number,
  mask: readonly boolean[] = computeCodeStateMask(text)
): number {
  let parenDepth = 0;
  let angleDepth = 0;
  let depth = 0;
  let foundStart = false;

  for (let i = startIndex; i < text.length; i++) {
    if (!mask[i]) { continue; }
    const char = text[i];

    if (char === '(') {
      parenDepth++;
    } else if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
    } else if (!foundStart && parenDepth === 0 && char === '<') {
      angleDepth++;
    } else if (!foundStart && parenDepth === 0 && char === '>' && angleDepth > 0 && text[i - 1] !== '=') {
      angleDepth--;
    } else if (char === '{' && parenDepth === 0 && angleDepth === 0) {
      depth++;
      foundStart = true;
    } else if (char === '}' && parenDepth === 0 && angleDepth === 0) {
      depth--;
      if (foundStart && depth === 0) {
        return i;
      }
    }
  }

  return -1;
}
