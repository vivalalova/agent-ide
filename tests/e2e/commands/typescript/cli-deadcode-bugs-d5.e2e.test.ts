/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * D5：declaration-analyzer.ts 的 computeDeclaratorRemovalRange 逐宣告子
 *     計算刪除範圍時，「最後一個宣告子」規則把範圍起點錨定在「前一個宣告子
 *     的結尾」。當同一條 VariableStatement 中有多個 dead 宣告子時，各自算出
 *     的刪除範圍會互相重疊，--apply 後輸出毀損（殘留 `let ;`、孤兒逗號，或
 *     語法錯誤的宣告片段）。
 *
 * 本測試由 deadcode 修復者自報限制。
 *
 * 注意：變數命名刻意避開 sample-project fixture 既有識別符，避免撞名觸發
 * 另一個不相干的跨檔同名符號誤判問題。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（D5）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('D5：同語句中多個 dead 宣告子 --apply 後不應留下重疊刪除造成的語法毀損', async () => {
    await fixture.writeFile('src/multi-dead-decl-d5.ts', [
      'let deadOneD5, deadTwoD5;',
      'export function aliveFnD5() { return 1; }',
      ''
    ].join('\n'));

    // 先 dry-run 釘住觸發前提：deadOneD5 與 deadTwoD5 都必須真的被判為 dead code
    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunOutput: any = JSON.parse(dryRun.stdout);
    const targetFile = dryRunOutput.files?.find((f: { filePath: string }) =>
      f.filePath.includes('multi-dead-decl-d5')
    );
    expect(targetFile).toBeDefined();
    const deletedContents = (targetFile.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).toContain('deadOneD5');
    expect(deletedContents).toContain('deadTwoD5');

    // --apply 實際寫入
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.readFile('src/multi-dead-decl-d5.ts');

    // 不應殘留語法毀損的宣告片段（孤兒 let、孤兒逗號、孤兒 let 與下一敘述黏在一起等）
    expect(afterContent).not.toMatch(/\blet\s*;/);
    expect(afterContent).not.toMatch(/\blet\s*,/);
    expect(afterContent).not.toMatch(/,\s*;/);
    // Bug：重疊刪除範圍把換行與分號一併吃掉，留下孤兒 `let ` 直接黏上下一條敘述
    expect(afterContent).not.toMatch(/\blet\s+(export|function|class|interface|const)\b/);
    expect(afterContent).not.toContain('deadOneD5');
    expect(afterContent).not.toContain('deadTwoD5');

    // aliveFnD5 應完整保留，且必須是獨立一行的合法敘述（非與 `let` 黏在同一行）
    expect(afterContent).toMatch(/^export function aliveFnD5\(\) \{ return 1; \}$/m);
  });

  it('R2-3：非首/尾位單一 dead 宣告子刪除不應吃掉夾在中間的存活註解', async () => {
    await fixture.writeFile('src/single-dead-decl-comment-r23.ts', [
      'let deadR23 = 1, /* keep me */ aliveR23 = 2;',
      'export function useR23() { return aliveR23; }',
      ''
    ].join('\n'));

    // 先 dry-run 釘住觸發前提：deadR23 必須真的被判為 dead code，aliveR23 不是
    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunOutput: any = JSON.parse(dryRun.stdout);
    const targetFile = dryRunOutput.files?.find((f: { filePath: string }) =>
      f.filePath.includes('single-dead-decl-comment-r23')
    );
    expect(targetFile).toBeDefined();
    const deletedContents = (targetFile.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deletedContents).toContain('deadR23');

    // --apply 實際寫入
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.readFile('src/single-dead-decl-comment-r23.ts');

    // 正確行為：deadR23 連同其後逗號被刪除，但夾在中間的 `/* keep me */` 註解與
    // aliveR23 宣告都應完整存活；
    // 目前的壞行為是 computeDeclaratorRunRemovalRange 用 declarations[endIndex+1].getStart()
    // 當刪除終點，getStart() 跳過前導 trivia，把 `/* keep me */` 一併吃掉
    expect(afterContent).not.toContain('deadR23');
    expect(afterContent).toContain('/* keep me */');
    expect(afterContent).toMatch(/aliveR23\s*=\s*2/);
    expect(afterContent).toMatch(/^export function useR23\(\) \{ return aliveR23; \}$/m);
  });
});
