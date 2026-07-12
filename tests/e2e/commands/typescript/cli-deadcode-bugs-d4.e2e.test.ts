/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * D4：dead-code-detector.ts 透過 symbolFinder.findReferencesMultiple() 收集
 *     跨檔引用時，fallback 路徑（symbol-finder.ts 的
 *     `ref.type === 'definition' ? Definition : Usage`）把非 'definition'
 *     的引用一律歸類為 Usage，import specifier 本身（`import { orphanExport }
 *     from './a'` 這一行）因此被誤算成一次「使用」。被 import 但從未實際呼叫
 *     的 export，因為有這個假 usage，usageRefs.length > 0，永遠不會進入
 *     dead code 候選清單，`--include-exports` 對這種跨檔情境完全失效。
 *
 * 注意：變數命名刻意避開 sample-project fixture 既有識別符（如 i、j、x），
 * 避免撞名觸發另一個不相干的跨檔同名符號誤判問題（dead-code-detector 的
 * 跨檔引用計數是純名稱比對，非真正的 scope 綁定解析），干擾本次要驗證的缺陷。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（D4）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('D4：被 import 但從未使用的 export 應該被判定為 dead code（--include-exports）', async () => {
    await fixture.writeFile(
      'src/orphan-export-source.ts',
      'export function orphanExportUnique() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/orphan-export-consumer.ts',
      'import { orphanExportUnique } from \'./orphan-export-source.js\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const sourceFile = output.files?.find((f: { filePath: string }) =>
      f.filePath.includes('orphan-export-source')
    );
    expect(sourceFile).toBeDefined();

    const deletedContents = (sourceFile.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');

    // orphanExportUnique 從未被呼叫，只被 import（未使用），應被列為 dead code
    expect(deletedContents).toContain('orphanExportUnique');
  });
});
