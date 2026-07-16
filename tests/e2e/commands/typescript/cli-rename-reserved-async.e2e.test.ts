/**
 * F29：rename --to async 應被擋（reserved keyword），不產生非法碼
 *
 * core RenameEngine.reservedKeywords 漏 async；CLI 走 core 驗證路徑時
 * dry-run/apply 都不得安靜產出 `const async = ...`。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 保留字 async（F29）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('--to async 應被拒絕或至少標 reserved_keyword，且不得寫入非法碼', async () => {
    await fixture.writeFile(
      'src/rename-async-f29.ts',
      'export const legacyNameF29 = 1;\nexport const use = legacyNameF29;\n'
    );
    const original = await fixture.readFile('src/rename-async-f29.ts');

    const dryRun = await executeCLI(
      [
        'rename',
        '--path', fixture.rootPath,
        '--from', 'legacyNameF29',
        '--to', 'async',
        '--dry-run',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const dryOut = dryRun.stdout ? JSON.parse(dryRun.stdout) : {};
    const hasReservedSignal =
      dryRun.exitCode !== 0
      || Boolean(
        (dryOut.warnings ?? []).some(
          (w: string) => /保留字|reserved/i.test(w)
        )
      )
      || Boolean(
        (dryOut.conflicts ?? []).some(
          (c: { type?: string }) => c.type === 'reserved_keyword'
        )
      );

    // 正確：必須偵測到 reserved keyword（拒絕或明確 conflict/warning）
    // 目前壞行為：core reservedKeywords 無 async → 無衝突、可預覽變更
    expect(hasReservedSignal).toBe(true);

    const apply = await executeCLI(
      [
        'rename',
        '--path', fixture.rootPath,
        '--from', 'legacyNameF29',
        '--to', 'async',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    const after = await fixture.readFile('src/rename-async-f29.ts');
    // 無論如何不得寫出以 async 為綁定名的非法碼
    expect(after).not.toMatch(/\bconst\s+async\b/);
    expect(after).not.toMatch(/\blet\s+async\b/);
    if (apply.exitCode !== 0) {
      expect(after).toBe(original);
    }
  });
});
