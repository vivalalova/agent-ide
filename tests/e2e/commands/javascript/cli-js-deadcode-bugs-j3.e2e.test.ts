/**
 * CLI deadcode 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * J3：JS 側宣告子群組刪除無子粒度（等同 TS 修 D1/D5 前的狀態）
 *     src/plugins/javascript/declaration-analyzer.ts 的 getFullDeclarationRange
 *     恆回傳整條 VariableDeclaration 的範圍，不分宣告子；且 JS parser 未實作
 *     computeDeclaratorGroupRemovalRanges（僅 TS 側 declaration-analyzer.ts 有），
 *     導致 core/deadcode/range-expander.ts 的 expandDeclaratorGroupRanges 對 JS
 *     檔案恆回傳 null，remover 落回舊的逐宣告子各自 expandRangeToFullDeclaration
 *     路徑 —— 每個宣告子都拿到「整條語句」的範圍：
 *       a. 部分 dead：整條語句（含存活的宣告子）被誤刪
 *       b. 全部 dead：兩個宣告子各自算出相同的整句範圍，經 ChangeApplicator
 *          套用同一範圍的重複編輯（見 CA-1），可能造成輸出毀損
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（J3，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function findDeletedContents(
    output: { files?: Array<{ filePath: string; hunks?: Array<{ lines: Array<{ type: string; content: string }> }> }> },
    fileNameIncludes: string
  ): string {
    const file = output.files?.find((f) => f.filePath.includes(fileNameIncludes));
    if (!file) {
      return '';
    }
    return (file.hunks ?? [])
      .flatMap((h) => h.lines.filter((l) => l.type === 'delete').map((l) => l.content))
      .join('\n');
  }

  it('J3a：部分 dead（一存活一 dead）--apply 後存活宣告子不應被誤刪', async () => {
    await fixture.writeFile('src/j3a-partial-dead.js', [
      'let aliveJ3 = 0, deadJ3 = 1;',
      'export function useJ3() { return aliveJ3; }',
      ''
    ].join('\n'));

    // 先 dry-run 釘住觸發前提：deadJ3 必須真的被判為 dead code，aliveJ3 不是
    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunOutput = JSON.parse(dryRun.stdout);
    const deletedContents = findDeletedContents(dryRunOutput, 'j3a-partial-dead');
    expect(deletedContents).toContain('deadJ3');
    // 同行部分刪除在預覽以「整行刪＋整行加」呈現，刪除側含 aliveJ3 屬合法；
    // 手術粒度以「新增側保留存活宣告」釘住
    const j3aFile = dryRunOutput.files?.find((f: { filePath: string }) => f.filePath.includes('j3a-partial-dead'));
    const addedContents = (j3aFile?.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'add').map((l: { content: string }) => l.content))
      .join('\n');
    expect(addedContents).toMatch(/aliveJ3\s*=\s*0/);
    expect(addedContents).not.toContain('deadJ3');

    // --apply 實際寫入
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.readFile('src/j3a-partial-dead.js');

    expect(afterContent).not.toContain('deadJ3');
    // Bug：目前整條 `let aliveJ3 = 0, deadJ3 = 1;` 被當成一個宣告子的「完整宣告範圍」整句刪除
    expect(afterContent).toMatch(/aliveJ3\s*=\s*0/);
    expect(afterContent).toMatch(/^export function useJ3\(\) \{ return aliveJ3; \}$/m);
  });

  it('J3b：全部 dead（兩者皆 dead）--apply 後輸出應是合法語法且整句消失', async () => {
    await fixture.writeFile('src/j3b-all-dead.js', [
      'let deadOneJ3, deadTwoJ3;',
      'export function useJ3b() { return 1; }',
      ''
    ].join('\n'));

    // 先 dry-run 釘住觸發前提：deadOneJ3 與 deadTwoJ3 都必須真的被判為 dead code
    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryRunOutput = JSON.parse(dryRun.stdout);
    const deletedContents = findDeletedContents(dryRunOutput, 'j3b-all-dead');
    expect(deletedContents).toContain('deadOneJ3');
    expect(deletedContents).toContain('deadTwoJ3');

    // --apply 實際寫入
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(result.exitCode).toBe(0);

    const afterContent = await fixture.readFile('src/j3b-all-dead.js');

    // 不應殘留語法毀損的宣告片段（孤兒 let、孤兒逗號、行融合毀損）
    expect(afterContent).not.toMatch(/\blet\s*;/);
    expect(afterContent).not.toMatch(/\blet\s*,/);
    expect(afterContent).not.toMatch(/,\s*;/);
    expect(afterContent).not.toMatch(/\blet\s+(export|function|class|interface|const)\b/);
    expect(afterContent).not.toContain('deadOneJ3');
    expect(afterContent).not.toContain('deadTwoJ3');
    expect(afterContent).toMatch(/^export function useJ3b\(\) \{ return 1; \}$/m);
  });
});
