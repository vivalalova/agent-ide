/**
 * CLI deadcode 命令 E2E 測試 - --exclude 精確檔案路徑（含 '/'、無萬用字元）永不匹配
 *
 * P2-A: `agent-ide deadcode --exclude src/legacy/api.ts`（精確檔案路徑、含 '/'、不含
 *       '*'/'?'）在 deadcode.command.ts 會因含 '/' 被分流進 excludeFiles（非
 *       excludeSymbols）。但 DeadCodeRemover.matchesExcludePattern
 *       （src/core/deadcode/dead-code-remover.ts:424-446）對含 '/' 且不含 glob 特殊字元
 *       的樣式，一律包成 `**\/${pattern}/**` 再交給 matchesGlobPattern。`/**` 尾端要求
 *       路徑在該樣式之後至少還有一層後代，但 `src/legacy/api.ts` 本身就是葉節點（檔案），
 *       不可能有「api.ts 之下的子路徑」，導致這個樣式對任何實際檔案路徑永遠不匹配 —
 *       --exclude 精確檔案路徑因而形同虛設，被排除的檔案仍會被掃描與列入 dead code。
 *
 * 對照組：不帶 --exclude 時同一 export 應被判為 dead code（證明它確實會被掃到，
 * 而非因為其他原因（如已被使用）本來就不會出現在結果中）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode - --exclude 精確檔案路徑應排除該檔（P2-A）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
    // 未被任何檔案引用、未 export 的頂層函式：預設（不加 --include-exports）即會被判 dead code
    await fixture.writeFile(
      'src/legacy/api.ts',
      'function legacyUnusedHelper() {\n  return \'legacy\';\n}\n'
    );
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('對照組：不帶 --exclude 時 src/legacy/api.ts 應出現在 dead code 結果中', async () => {
    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const legacyFile = output.files.find((f: { filePath: string }) =>
      f.filePath.includes('src/legacy/api.ts')
    );

    // 證明 legacyUnusedHelper 確實會被掃到、判定為 dead code
    expect(legacyFile).toBeDefined();
    expect(legacyFile.hunks.length).toBeGreaterThan(0);
  });

  it('帶 --exclude src/legacy/api.ts（精確檔案路徑）應把該檔排除在 dead code 結果之外', async () => {
    const result = await executeCLI(
      [
        'deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--no-cache',
        '--exclude', 'src/legacy/api.ts',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const legacyFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('src/legacy/api.ts')
    );

    // 錯誤重現點：現況 matchesExcludePattern 把 'src/legacy/api.ts' 包成
    // '**/src/legacy/api.ts/**'，該樣式要求後面還有子路徑，對葉節點檔案永不匹配，
    // 因此該檔仍會出現在結果中（本斷言預期先紅）
    expect(legacyFile).toBeUndefined();
  });

  it('帶 --exclude src/legacy/（含尾斜線的目錄樣式）應把該目錄排除在 dead code 結果之外', async () => {
    const result = await executeCLI(
      [
        'deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--no-cache',
        '--exclude', 'src/legacy/',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const legacyFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('src/legacy/api.ts')
    );

    expect(legacyFile).toBeUndefined();
  });
});
