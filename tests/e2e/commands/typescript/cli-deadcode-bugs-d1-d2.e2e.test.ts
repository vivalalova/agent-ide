/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * D1：多宣告子語句（如 `let aliveCounter, deadHelperVar;`）以單一宣告子粒度
 *     偵測 dead code，但 declaration-analyzer.ts 找到的節點是整條
 *     VariableStatement，--apply 時整條宣告都被刪除，存活的宣告子也被誤刪。
 * D2：只被寫入從未被讀取的變數，dead-code-detector.ts 只計 Usage 型引用，
 *     寫入歸類為 Definition 不計入 usage，導致宣告被判定為 dead 而刪除，
 *     但寫入語句本身不在刪除範圍內，--apply 後留下孤兒賦值。
 *
 * D3（partial named import 遺失 per-specifier type 修飾符）改寫在
 * tests/unit/core/deadcode/import-cleaner.test.ts：CLI 端到端無法重現，
 * 詳見該檔案新增測試旁的說明與本次任務回報。
 *
 * 注意：變數命名刻意避開 sample-project fixture 既有識別符（如 i、j、x），
 * 避免撞名觸發另一個不相干的跨檔同名符號誤判問題（dead-code-detector 的
 * 跨檔引用計數是純名稱比對，非真正的 scope 綁定解析），干擾本次要驗證的缺陷。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（D1-D2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('D1：--apply 不應把多宣告子語句中存活的宣告子一併刪除', async () => {
    await fixture.writeFile('src/multi-decl.ts', `let aliveCounter, deadHelperVar;
export function loopUnique() {
  for (aliveCounter = 0; aliveCounter < 3; aliveCounter++) {
    // noop
  }
}
`);

    // 先跑 dry-run 釘住觸發前提：deadHelperVar 必須真的被判為 dead code
    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunOutput = JSON.parse(dryRun.stdout);
    const multiDeclFile = dryRunOutput.files?.find((f: { filePath: string }) =>
      f.filePath.includes('multi-decl')
    );
    expect(multiDeclFile).toBeDefined();
    const deletedLines = (multiDeclFile.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedLines).toContain('deadHelperVar');

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.memfs.readFile(
      `${fixture.rootPath}/src/multi-decl.ts`,
      'utf-8'
    ) as string;

    // aliveCounter 仍存活（被 loop 使用），--apply 後其宣告必須還在（形式不拘）
    expect(afterContent).toMatch(/\blet\b[^;]*\baliveCounter\b/);
    // loopUnique 函式應完整保留
    expect(afterContent).toContain('export function loopUnique');
    expect(afterContent).toContain('for (aliveCounter = 0; aliveCounter < 3; aliveCounter++)');
  });

  it('D2：--apply 不應留下「宣告被刪但賦值殘留」的孤兒狀態', async () => {
    await fixture.writeFile('src/write-only.ts', `let writeOnlyDeadVar = 1;
writeOnlyDeadVar = 2;

export function noopUnique() {
  return null;
}
`);

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.memfs.readFile(
      `${fixture.rootPath}/src/write-only.ts`,
      'utf-8'
    ) as string;

    const hasDeclaration = /\blet\s+writeOnlyDeadVar\b/.test(afterContent);
    const hasAssignment = /(?<!let\s)\bwriteOnlyDeadVar\s*=\s*2\s*;/.test(afterContent);

    // 宣告被刪 ⇒ 賦值也必須被刪（兩者同刪或都保留皆可接受，唯獨不能宣告刪了賦值卻留下孤兒）
    if (!hasDeclaration) {
      expect(hasAssignment).toBe(false);
    }
  });
});
