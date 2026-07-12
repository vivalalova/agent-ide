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
    if (/[A-Za-z0-9_$]/.test(prev)) {
      let start = j;
      while (start >= 0 && /[A-Za-z0-9_$]/.test(text[start])) {
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
