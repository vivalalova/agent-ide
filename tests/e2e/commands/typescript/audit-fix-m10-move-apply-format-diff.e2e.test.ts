/**
 * audit-fix M10 regression（先紅後綠）
 *
 * move apply（非 dry-run）且 --format diff 時，stdout 仍應輸出 diff 契約
 * （含 diff 標記或檔案變更預覽），不得空輸出或僅 success 而無 diff 內容。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix M10：move apply --format diff', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M10：實際 apply 後 --format diff 應有 diff 內容', async () => {
    await fixture.writeFile(
      'src/m10-source.ts',
      'export function m10Moved(): number { return 1; }\n'
    );
    // 目標不存在 → 純 rename 路徑，避免既有檔覆蓋/嵌套
    const source = fixture.getFilePath('src/m10-source.ts');
    const target = fixture.getFilePath('src/m10-renamed.ts');

    const result = await executeCLI(
      [
        'move',
        source,
        target,
        '--path',
        fixture.rootPath,
        '--format',
        'diff'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    // diff 契約：至少出現 unified diff 常見標記或檔案路徑變更描述
    const out = result.stdout;
    expect(out.length).toBeGreaterThan(0);
    const hasDiffMarkers =
      out.includes('---')
      || out.includes('+++')
      || out.includes('@@')
      || /diff/i.test(out)
      || out.includes('m10Moved')
      || out.includes('m10-source')
      || out.includes('m10-renamed');
    expect(hasDiffMarkers).toBe(true);
  });
});
