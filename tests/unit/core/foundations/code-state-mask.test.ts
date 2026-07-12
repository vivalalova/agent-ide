/**
 * computeCodeStateMask Unit 測試（回歸缺陷 R2-4、R2-5）
 *
 * R2-4：巢狀樣板字面值 `${}` 內出現的巢狀反引號，會被誤判為外層樣板字串的
 *       結尾（mask 未追蹤 `${}` 巢狀深度），導致樣板內的大括號被誤標為 code。
 * R2-5：regex 字面值（如 `/\d{2,4}/`）完全未被辨識，量詞大括號被當成 code。
 */

import { describe, it, expect } from 'vitest';
import { computeCodeStateMask } from '@core/foundations/index.js';

describe('computeCodeStateMask - 回歸缺陷', () => {
  it('R2-4：巢狀樣板字面值的內層反引號不應提前結束外層字串狀態', () => {
    // 文字組成（index 對照）：
    // 0:` 1:$ 2:{ 3:(space) 4:` 5:$ 6:{ 7:a 8:} 9:` 10:(space) 11:} 12:(space)
    // 13-16: t a i l  17:` 18:(space) 19:{ 20:z 21:}
    const text = '`${ `${a}` } tail` {z}';

    expect(text[6]).toBe('{');
    expect(text[8]).toBe('}');
    expect(text[11]).toBe('}');
    expect(text[19]).toBe('{');
    expect(text[21]).toBe('}');

    const mask = computeCodeStateMask(text);

    // 整個樣板字面值（含巢狀替換 `${a}`）都應視為非 code：巢狀替換內的大括號
    // 不應被誤判為 code。目前的壞行為：內層反引號（index 4、9）被當成外層樣板
    // 的收尾/開頭，導致 `${a}` 這段（index 5-8）被誤標為 code。
    expect(mask[6]).toBe(false);
    expect(mask[8]).toBe(false);
    expect(mask[11]).toBe(false);

    // 樣板結束後的真實程式碼大括號應為 code
    expect(mask[19]).toBe(true);
    expect(mask[21]).toBe(true);
  });

  it('R2-5：regex 字面值的量詞大括號應標記為非 code', () => {
    const text = 'const re = /\\d{2,4}/;';
    const openIdx = text.indexOf('{');
    const closeIdx = text.indexOf('}');
    expect(openIdx).toBeGreaterThan(-1);
    expect(closeIdx).toBeGreaterThan(openIdx);

    const mask = computeCodeStateMask(text);

    // 正確行為：regex 字面值 /\d{2,4}/ 整體都不是 code，量詞大括號應為非 code；
    // 目前的壞行為：computeCodeStateMask 完全未辨識 regex 字面值的開始/結束，
    // `{`/`}` 被當成一般程式碼字元（true）
    expect(mask[openIdx]).toBe(false);
    expect(mask[closeIdx]).toBe(false);
  });
});
