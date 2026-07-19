/**
 * maskNonCode / findMatchingBodyBraceEnd Unit 測試
 *
 * 兩者為 move-member / rename 多處regex-scanning、brace-matching 收斂用的共用
 * 基礎設施（見 code-state-mask.ts 註解）：maskNonCode 供正則掃描前先清空字串/
 * 註解內容，避免誤判宣告/依賴/識別符；findMatchingBodyBraceEnd 供「找宣告本體
 * 收尾大括號」的呼叫端排除字串/註解/泛型約束干擾。
 */

import { describe, it, expect } from 'vitest';
import { maskNonCode, findMatchingBodyBraceEnd, computeCodeCharKinds } from '@core/foundations/index.js';

describe('maskNonCode', () => {
  it('應清空區塊註解內容，保留長度與換行位置', () => {
    const text = '/* function fake() {} */\nfunction real() {}';
    const masked = maskNonCode(text);

    expect(masked).not.toContain('fake');
    expect(masked).toContain('function real() {}');
    expect(masked.length).toBe(text.length);
    expect(masked.split('\n').length).toBe(text.split('\n').length);
  });

  it('應清空字串字面值內容但不影響字串外的真實程式碼', () => {
    const text = 'const s = "export const Fake = 1"; const Real = 2;';
    const masked = maskNonCode(text);

    expect(masked).not.toContain('Fake');
    expect(masked).toContain('const Real = 2;');
  });

  it('應清空樣板字面值內容（含跨行樣板）', () => {
    const text = 'const t = `\nimport { x } from \'./old\';\n`;\nconst Real = 1;';
    const masked = maskNonCode(text);

    expect(masked).not.toContain('import');
    expect(masked).toContain('const Real = 1;');
  });

  it('成員存取 `.delete` 後的 `/` 不應被誤判為 regex 起點（關鍵字啟發式需排除 `.` 前導）', () => {
    const text = 'const rate = cache.delete / total;\nconsole.log(total + 1);';
    const kinds = computeCodeCharKinds(text);
    const slashIndex = text.indexOf('/');

    expect(kinds[slashIndex]).toBe('code');

    const masked = maskNonCode(text);
    expect(masked).toContain('console.log(total + 1)');
  });

  it('`return /abc/` 的 `/` 仍應視為 regex 起點（對照組，防修過頭）', () => {
    const text = 'return /abc/;';
    const kinds = computeCodeCharKinds(text);
    const slashIndex = text.indexOf('/');

    expect(kinds[slashIndex]).toBe('regex');
  });
});

describe('findMatchingBodyBraceEnd', () => {
  it('泛型約束物件型別的大括號不應被誤判為類別本體收尾', () => {
    const text = 'class Box<T extends { value: string }> {\n  get(): T { return this.value; }\n}';
    const declIndex = text.indexOf('class Box');

    const end = findMatchingBodyBraceEnd(text, declIndex);

    expect(end).toBe(text.length - 1);
    expect(text[end]).toBe('}');
  });

  it('泛型約束內的函式型別箭頭 `=>` 不應被誤判為泛型收尾', () => {
    const text = 'class Box<T extends { fn: () => void }> {\n  run(): void {}\n}';
    const declIndex = text.indexOf('class Box');

    const end = findMatchingBodyBraceEnd(text, declIndex);

    expect(end).toBe(text.length - 1);
  });

  it('字串/註解內容中的括號不應干擾配對', () => {
    const text = 'class Target { method(){ const text = "}"; } }';
    const declIndex = text.indexOf('class Target');

    const end = findMatchingBodyBraceEnd(text, declIndex);

    expect(end).toBe(text.length - 1);
  });

  it('找不到本體開括號時回傳 -1', () => {
    const text = 'const x = 1;';
    expect(findMatchingBodyBraceEnd(text, 0)).toBe(-1);
  });
});
