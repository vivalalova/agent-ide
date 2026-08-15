/**
 * CLI rename 命令 E2E 測試 - 已確認缺陷（手動重現）
 *
 * 缺陷根因：src/shared/exclude-dirs.ts 的 COMMON_EXCLUDE_DIR_NAMES 含
 * build/out/dist/coverage 等常見建置輸出目錄名稱；rename 的引用掃描沿用
 * 這份通用排除清單，導致原始碼中恰好命名為 build/ 的目錄（非建置產物、
 * 是真實原始碼）被靜默跳過 —— CLI 回報 success:true，但該目錄內引用
 * 目標符號的 import/呼叫點完全沒被同步改名。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename - 已確認缺陷（手動重現）：同名為 build 的真實原始碼目錄被排除', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('src/build/ 內引用目標符號的 import 與呼叫點應同步改名', async () => {
    // Given: src/index.ts 定義 targetFn，src/build/consumer.ts（真實原始碼，
    // 非建置產物）import 並呼叫它
    await fixture.writeFile(
      'src/index.ts',
      [
        'export function targetFn(): number {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/build/consumer.ts',
      [
        'import { targetFn } from \'../index.js\';',
        '',
        'targetFn();',
        ''
      ].join('\n')
    );

    // When: 重命名 targetFn -> renamedFn
    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'targetFn', '--to', 'renamedFn',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // Then: 應該成功，且 src/build/consumer.ts 的 import 與呼叫都同步改名
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerContent = await fixture.readFile('src/build/consumer.ts');
    // 正確行為：import 與呼叫點都應改為 renamedFn；
    // 目前的壞行為是 src/build/ 被通用排除目錄清單擋下，
    // consumer.ts 完全沒被掃到、內容維持原樣（仍是 targetFn）
    expect(consumerContent).toContain('renamedFn');
    expect(consumerContent).not.toContain('targetFn');
  });
});
