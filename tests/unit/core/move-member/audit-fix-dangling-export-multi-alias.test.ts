/**
 * dangling-export.ts rewriteDanglingExportStatements 缺陷 regression（先紅後綠）
 *
 * DANGLING-NAMED-EXPORT-MULTI-ALIAS：同一 local 名稱以兩個別名出現在同一句
 * 獨立具名 export 陳述式中時（`export { x as a, x as b };`），
 * rewriteDanglingNamedExport 用 `pairs.find(([local]) => local === memberName)`
 * 只取第一筆比對到的 pair（[x, a]）改寫成 re-export，卻用
 * `pairs.filter(([local]) => local !== memberName)` 把兩筆都濾掉——
 * 導致第二個別名 b 直接從輸出消失，不在改寫後的 re-export 子句、
 * 也不在剩餘的原地 export 子句，靜默遺失一個對外符號。
 *
 * 正確行為：所有 local === memberName 的 pair 都要各自產生一條
 * re-export 子句，一個都不能少。
 */

import { describe, it, expect } from 'vitest';
import { rewriteDanglingExportStatements } from '@core/move-member/utils/dangling-export.js';
import { MemberType, type MemberDefinition } from '@core/move-member/types.js';

describe('rewriteDanglingExportStatements - 同 local 多別名 regression', () => {
  const member: Pick<MemberDefinition, 'name' | 'modifiers' | 'type'> = {
    name: 'x',
    modifiers: [],
    type: MemberType.Function
  };

  it('[錯誤重現點] export { x as a, x as b } 搬移 x 後，兩個別名都必須被轉發，不得有任何一個消失', () => {
    const content = 'function x() {}\n\nexport { x as a, x as b };\n';

    const result = rewriteDanglingExportStatements(content, member, './target.js');

    // 兩個別名都必須出現在改寫後的內容裡
    expect(result).toContain('a');
    expect(result).toContain('b');

    // 兩個別名都必須各自轉發成指向目標檔的 re-export，
    // 而非只有其中一個、另一個靜默消失
    expect(result).toMatch(/export\s*\{\s*x\s+as\s+a\s*\}\s*from\s*['"`]\.\/target\.js['"`]\s*;?/);
    expect(result).toMatch(/export\s*\{\s*x\s+as\s+b\s*\}\s*from\s*['"`]\.\/target\.js['"`]\s*;?/);

    // 不得殘留任何無 from 子句的裸具名 export（那代表沒被改寫、
    // 指向已搬走符號的孤兒 export）
    expect(result).not.toMatch(/export\s*\{[^}]*\}(?!\s*from)\s*;?\s*$/m);
  });
});
