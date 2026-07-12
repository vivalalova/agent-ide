/**
 * Code State Mask
 * 逐字元掃描文字，標記每個字元是否處於「程式碼」狀態（非區塊/行註解、非字串內容）
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
  type ScanState =
    | { readonly kind: 'code' }
    | { readonly kind: 'lineComment' }
    | { readonly kind: 'blockComment' }
    | { readonly kind: 'string'; readonly quote: string };

  const mask: boolean[] = new Array(text.length).fill(true);
  let state: ScanState = { kind: 'code' };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (state.kind === 'lineComment') {
      mask[i] = false;
      if (char === '\n') {
        state = { kind: 'code' };
      }
      continue;
    }

    if (state.kind === 'blockComment') {
      mask[i] = false;
      if (char === '*' && next === '/') {
        mask[i + 1] = false;
        state = { kind: 'code' };
        i++;
      }
      continue;
    }

    if (state.kind === 'string') {
      mask[i] = false;
      if (char === '\\' && i + 1 < text.length) {
        // 跳脫字元：連同下一個字元一併視為字串內容，避免跳脫的引號被誤判為結尾
        mask[i + 1] = false;
        i++;
        continue;
      }
      if (char === state.quote) {
        state = { kind: 'code' };
      }
      continue;
    }

    // state.kind === 'code'
    if (char === '/' && next === '/') {
      mask[i] = false;
      mask[i + 1] = false;
      state = { kind: 'lineComment' };
      i++;
      continue;
    }
    if (char === '/' && next === '*') {
      mask[i] = false;
      mask[i + 1] = false;
      state = { kind: 'blockComment' };
      i++;
      continue;
    }
    if (char === '"' || char === '\'' || char === '`') {
      mask[i] = false;
      state = { kind: 'string', quote: char };
    }
    // 其餘為一般程式碼字元，維持 mask[i] = true
  }

  return mask;
}
