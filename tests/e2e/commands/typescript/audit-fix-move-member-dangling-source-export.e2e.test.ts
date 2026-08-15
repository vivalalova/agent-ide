/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * DANGLING-SOURCE-EXPORT：來源檔以獨立語句匯出被搬移成員時
 * （`function foo() {...}` 加上分開的 `export default foo;` 或
 * `export { foo };`，而非成員宣告本體帶 inline `export` modifier），
 * move-member 只移除成員宣告本體所在的行範圍
 * （file-change-preparer.ts prepareSourceFileChange 的
 * getMemberRemovalLineRange），完全不知道有這行獨立的 export 語句、
 * 也不會清理或改寫它。reference-updater.ts:323
 * buildSourceSelfReferenceImport 原意是替殘留引用補 import，但它判斷
 * 「member.modifiers 是否含 inline export」來決定目標檔有沒有 export
 * 該 binding；此處 member 本身宣告時沒有 inline export（export 是另一
 * 條獨立語句掛的），modifiers 不含 'export'，函式在 :323 提前
 * `return null`，完全不處理這個殘留的 export 語句。
 *
 * 結果：來源檔殘留 `export default foo;`（或 `export { foo };`）指向
 * 已被搬走、不存在的符號，來源檔編譯失敗（`Cannot find name 'foo'`），
 * 但 CLI 回報 success。正確行為應是移除該行，或改寫成指向目標檔的
 * re-export（如 `export { default } from './target.js';`）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（DANGLING-SOURCE-EXPORT）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[export default 形狀][錯誤重現點] 搬移函式後，來源檔不得殘留指向已不存在符號的 export default', async () => {
    await fixture.writeFile('src/dfoo-source.ts', `function dFoo(): number {
  return 1;
}

export default dFoo;
`);
    await fixture.writeFile('src/dfoo-target.ts', `export const placeholder = true;
`);

    // dFoo 函式宣告在第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/dfoo-source.ts')}:1`, fixture.getFilePath('src/dfoo-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    // 命令回報成功，但來源檔實際上已編譯失敗（見下方斷言）——
    // 這正是本缺陷的核心：success 是假訊號
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/dfoo-source.ts');

    // 錯誤重現點：dFoo 函式宣告本體被搬走，獨立的 `export default dFoo;`
    // 語句完全沒被清理或改寫，殘留指向已不存在符號的孤兒 export
    expect(content).not.toMatch(/export default dFoo;/);

    // 若仍殘留 dFoo 識別符，必須是合法可解析的形式（如改寫成
    // `export { default } from './dfoo-target.js';` 這種 re-export），
    // 不得是無所依歸的裸識別符
    if (/\bdFoo\b/.test(content)) {
      expect(content).toMatch(/from\s+['"`][^'"`]+['"`]/);
    }
  });

  it('[export {} 形狀][錯誤重現點] 搬移函式後，來源檔不得殘留指向已不存在符號的 export { }', async () => {
    await fixture.writeFile('src/efoo-source.ts', `function eFoo(): number {
  return 1;
}

export { eFoo };
`);
    await fixture.writeFile('src/efoo-target.ts', `export const placeholder = true;
`);

    // eFoo 函式宣告在第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/efoo-source.ts')}:1`, fixture.getFilePath('src/efoo-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    // 命令回報成功，但來源檔實際上已編譯失敗（見下方斷言）——
    // 這正是本缺陷的核心：success 是假訊號
    expect(output.success).toBe(true);

    const content = await fixture.readFile('src/efoo-source.ts');

    // 錯誤重現點：eFoo 函式宣告本體被搬走，獨立的 `export { eFoo };`
    // 語句完全沒被清理或改寫，殘留指向已不存在符號的孤兒 export。
    // 只禁「無 from 子句的懸空 export」（該行以選擇性分號收尾，後面沒有
    // 其他內容）——不得誤傷改寫後帶 `from` 子句的正確 bare re-export
    // （如 `export { eFoo } from './efoo-target.js';`，這種形式合法且是
    // 預期的修復結果，不該被要求硬加冗餘的 `as eFoo`）。
    expect(content).not.toMatch(/export\s*\{\s*eFoo\s*\}\s*;?\s*$/m);

    // 若仍殘留 eFoo 識別符，必須是合法可解析的形式（如改寫成
    // `export { eFoo } from './efoo-target.js';` 這種 re-export），
    // 不得是無所依歸的裸識別符
    if (/\beFoo\b/.test(content)) {
      expect(content).toMatch(/from\s+['"`][^'"`]+['"`]/);
    }
  });
});
