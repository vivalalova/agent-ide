/**
 * [F8] `move --format JSON`（大寫）且未提供 source/target 時，錯誤改走 stderr 文字、stdout 空
 *
 * 根因：src/interfaces/cli/commands/move.command.ts:77 用
 * `options.format === 'json'` 大小寫敏感比對來決定錯誤輸出格式，
 * 其他命令（如 rename）走 parseOutputFormat（內建 toLowerCase）維持大小寫不敏感。
 * 'JSON' !== 'json' → 誤判為非 json 格式 → outputError 改走 console.error（stderr），
 * stdout 保持空字串，JSON.parse(stdout) 必失敗。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('[F8] CLI move --format 大小寫不敏感', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('未提供 source/target 且 --format JSON（大寫）時，錯誤仍須以 JSON 格式輸出到 stdout', async () => {
    const result = await executeCLI(
      ['move', '--format', 'JSON', '--path', fixture.rootPath],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(1);

    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(false);
  });
});
