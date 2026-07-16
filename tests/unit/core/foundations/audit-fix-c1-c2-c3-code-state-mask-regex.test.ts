/**
 * audit-fix C1 / C2 / C3 regression（先紅後綠）
 *
 * C1：`await /pattern/` — await 後的 `/` 應開 regex，body 不得標為 code
 * C2：`/foo/g` flags（g/i/m…）應為非 code
 * C3：`/[]]/` character class 邊界——class 內內容與分隔符應為非 code，後續真實 code 仍為 code
 */
import { describe, expect, it } from 'vitest';
import { computeCodeCharKinds, computeCodeStateMask } from '@core/foundations/index.js';

describe('audit-fix C1：await /pattern/ 不得把 regex body 當 code', () => {
  it('await 後的 regex 字面值 body 應為非 code，後續大括號仍為 code', () => {
    const text = 'const x = await /pat{2}/; function f() { return 1; }';
    const bodyOpen = text.indexOf('{');
    const bodyClose = text.indexOf('}');
    const fnOpen = text.lastIndexOf('{');
    const fnClose = text.lastIndexOf('}');

    expect(text[bodyOpen]).toBe('{');
    expect(text[bodyClose]).toBe('}');
    expect(fnOpen).toBeGreaterThan(bodyClose);
    expect(text[fnOpen]).toBe('{');

    const mask = computeCodeStateMask(text);
    const kinds = computeCodeCharKinds(text);

    // regex 量詞大括號不得當 code（C1 核心）
    expect(mask[bodyOpen]).toBe(false);
    expect(mask[bodyClose]).toBe(false);
    expect(kinds[bodyOpen]).toBe('regex');
    expect(kinds[bodyClose]).toBe('regex');

    // function f 的真實程式碼大括號仍為 code
    expect(mask[fnOpen]).toBe(true);
    expect(mask[fnClose]).toBe(true);
  });
});

describe('audit-fix C2：regex flags 不得標為 code', () => {
  it('/foo/g 的 flag g 應為 regex（非 code）', () => {
    const text = 'const re = /foo/g; const z = 1;';
    const slashEnd = text.indexOf('/g');
    expect(text[slashEnd]).toBe('/');
    const flagG = slashEnd + 1;
    expect(text[flagG]).toBe('g');

    const kinds = computeCodeCharKinds(text);
    const mask = computeCodeStateMask(text);

    expect(kinds[slashEnd]).toBe('regex');
    expect(kinds[flagG]).toBe('regex');
    expect(mask[flagG]).toBe(false);

    // flags 之後的真實程式碼
    const zIdx = text.indexOf('z');
    expect(mask[zIdx]).toBe(true);
  });

  it('/foo/gim 多 flag 皆應為非 code', () => {
    const text = 'const re = /foo/gim;';
    const flagsStart = text.indexOf('/gim') + 1;
    const kinds = computeCodeCharKinds(text);

    for (let i = 0; i < 3; i++) {
      expect(text[flagsStart + i]).toMatch(/[gim]/);
      expect(kinds[flagsStart + i]).toBe('regex');
    }
  });
});

/**
 * 定位 regex 字面值開/收 slash（open 指向 opening `/`）。
 * 從 open+1 起掃，處理 class 與 escape，避免 indexOf('/;') / indexOf(']/')
 * 誤中 class 內內容或 ] 本體。
 */
function findRegexLiteralBounds(text: string, openSlash: number): { open: number; close: number } {
  expect(text[openSlash]).toBe('/');
  let i = openSlash + 1;
  let inClass = false;
  let classJustOpened = false;

  while (i < text.length) {
    const c = text[i]!;
    if (c === '\\') {
      i += 2;
      classJustOpened = false;
      continue;
    }
    if (inClass) {
      // ECMAScript：class 開頭的 ] 可為 literal（/[]]/）
      if (c === ']' && !classJustOpened) {
        inClass = false;
      }
      classJustOpened = false;
      i++;
      continue;
    }
    if (c === '[') {
      inClass = true;
      classJustOpened = true;
      i++;
      continue;
    }
    if (c === '/') {
      return { open: openSlash, close: i };
    }
    i++;
  }
  throw new Error(`no closing / for regex starting at ${openSlash}: ${text.slice(openSlash)}`);
}

describe('audit-fix C3：regex character class 邊界', () => {
  it('/[]]/ 整段字面值（含 class 內 ]）應為 regex，後續 {z} 為 code', () => {
    // ECMAScript：class 開頭的 ] 可為 literal；整段 /[]]/ 是一個 regex
    const text = 'const re = /[]]/; {z}';
    const openSlash = text.indexOf('/[');
    expect(openSlash).toBeGreaterThan(-1);
    const { close: closeSlash } = findRegexLiteralBounds(text, openSlash);
    expect(closeSlash).toBeGreaterThan(openSlash);
    expect(text[closeSlash]).toBe('/');

    const kinds = computeCodeCharKinds(text);
    const mask = computeCodeStateMask(text);

    for (let i = openSlash; i <= closeSlash; i++) {
      expect(kinds[i]).toBe('regex');
      expect(mask[i]).toBe(false);
    }

    const braceOpen = text.lastIndexOf('{');
    const braceClose = text.lastIndexOf('}');
    expect(mask[braceOpen]).toBe(true);
    expect(mask[braceClose]).toBe(true);
  });

  it('class 內的 / 不得提前結束 regex：/[a/b]/ 整段為 regex', () => {
    // 用拼接建出 '/' + '[a/b]' + '/'，避免字面字串漏寫收尾 slash
    const regexLit = '/' + '[a/b]' + '/';
    const text = 'const re = ' + regexLit + '; function f() { return 1; }';
    expect(regexLit.length).toBe(7); // / [ a / b ] /
    expect(regexLit[0]).toBe('/');
    expect(regexLit[6]).toBe('/');

    const openSlash = text.indexOf(regexLit);
    expect(openSlash).toBeGreaterThan(-1);
    const closeSlash = openSlash + regexLit.length - 1;
    expect(text[openSlash]).toBe('/');
    expect(text[closeSlash]).toBe('/');
    // scanner 與字面長度一致
    expect(findRegexLiteralBounds(text, openSlash).close).toBe(closeSlash);

    const kinds = computeCodeCharKinds(text);
    const mask = computeCodeStateMask(text);

    for (let i = openSlash; i <= closeSlash; i++) {
      expect(kinds[i]).toBe('regex');
    }

    const innerSlash = text.indexOf('a/b') + 1;
    expect(text[innerSlash]).toBe('/');
    expect(kinds[innerSlash]).toBe('regex');

    const fnOpen = text.lastIndexOf('{');
    expect(mask[fnOpen]).toBe(true);
  });

  it('unescaped ] 非 class 首字元時應結束 class，使後續 / 可正確收尾', () => {
    // /[a]]/ 在 ECMAScript 是 class [a] + literal ] + 收尾 /
    // 若 class 狀態機錯亂，可能把後面的程式碼捲進 regex
    const text = 'const re = /[a]]/; function f() { return 1; }';
    const kinds = computeCodeCharKinds(text);
    const openSlash = text.indexOf('/[');
    expect(openSlash).toBeGreaterThan(-1);
    const { close: closeSlash } = findRegexLiteralBounds(text, openSlash);
    expect(text[closeSlash]).toBe('/');
    // 收尾 / 必須是 ] 之後的 slash（indexOf(']/') 指向 ]，+1 才是 /）
    expect(closeSlash).toBe(text.indexOf(']/', openSlash) + 1);

    expect(kinds[openSlash]).toBe('regex');
    expect(kinds[closeSlash]).toBe('regex');

    const fnOpen = text.lastIndexOf('{');
    const mask = computeCodeStateMask(text);
    expect(mask[fnOpen]).toBe(true);
  });
});
