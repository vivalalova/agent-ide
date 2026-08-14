/**
 * F3-4 P3 — collectImportExportStatement 的多行終止判斷未遮罩註解（先紅後綠）
 *
 * `;` 與大括號巢狀深度這兩道終止判斷直接掃原文：具名清單裡的行註解若含 `;`
 * 或 `{`，合法的多行 import 會被誤判成「與 import 無關的完整語句」而放棄收集，
 * 呼叫端因此漏改該 import。判斷前必須套 maskNonCode（與同模組其他掃描一致）。
 */

import { describe, expect, it } from 'vitest';
import { collectImportExportStatement } from '@core/move-member/utils/import-export-statement.js';

describe('F3-4：多行 import 終止判斷需遮罩註解', () => {
  it('具名清單的行註解含 `;` 時仍完整收集語句', () => {
    const lines = [
      'import {',
      '  moved, // legacy; do not remove',
      '  kept',
      '} from \'./source.js\';',
      ''
    ];

    const statement = collectImportExportStatement(lines, 0);

    expect(statement).not.toBeNull();
    expect(statement?.endLineIndex).toBe(3);
    expect(statement?.text).toContain('from \'./source.js\';');
  });

  it('具名清單的行註解含大括號時仍完整收集語句', () => {
    const lines = [
      'import {',
      '  moved, // shape: { a: { b: 1 } }',
      '  kept',
      '} from \'./source.js\';',
      ''
    ];

    const statement = collectImportExportStatement(lines, 0);

    expect(statement).not.toBeNull();
    expect(statement?.endLineIndex).toBe(3);
  });

  it('仍拒收無 from 子句的完整具名 export 語句', () => {
    const lines = [
      'export { moved };',
      'import { other } from \'./other.js\';',
      ''
    ];

    expect(collectImportExportStatement(lines, 0)).toBeNull();
  });
});
