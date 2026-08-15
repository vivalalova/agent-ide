/**
 * audit-fix M9 regression（先紅後綠）
 *
 * deadcode --apply 且零結果時，JSON 的 applied 應為 false（實際未寫入），
 * 不得因 CLI 帶了 --apply 就標 applied:true。
 *
 * 觸發路徑：detection 結果為空，或 changeset textChanges 為空；
 * createDeadCodeExecutionFields(willApply) 一律 applied: willApply。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix M9：deadcode --apply 零結果 applied', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M9：--apply 但零刪除結果時 JSON applied 應為 false', async () => {
    // 用 --exclude 把所有候選濾掉 → 走「無變更 / 零結果」分支，仍帶 --apply
    const result = await executeCLI(
      [
        'deadcode',
        '--path',
        fixture.rootPath,
        '--apply',
        '--format',
        'json',
        '--exclude',
        '**/*',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);

    // Bug：applied 跟 willApply 綁死，即使什麼都沒寫入仍為 true
    expect(output.applied).toBe(false);
  });
});
