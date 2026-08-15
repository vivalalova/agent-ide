/**
 * CLI move 命令 E2E 測試 - 已確認缺陷（手動重現）
 *
 * 缺陷根因：src/shared/exclude-dirs.ts 的 COMMON_EXCLUDE_DIR_NAMES 含
 * build/out/dist/coverage 等常見建置輸出目錄名稱；move 的引用掃描沿用
 * 這份通用排除清單，導致原始碼中恰好命名為 out/ 的目錄（非建置產物、
 * 是真實原始碼）被靜默跳過 —— 移動來源檔案後，該目錄內的 import 路徑
 * 完全沒被更新。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 已確認缺陷（手動重現）：同名為 out 的真實原始碼目錄被排除', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('src/out/ 內引用被移動檔案的 import 路徑應同步更新', async () => {
    // Given: src/target.ts 匯出 targetFn，src/out/consumer.ts（真實原始碼，
    // 非建置產物）import 它
    await fixture.writeFile(
      'src/target.ts',
      [
        'export function targetFn(): number {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/out/consumer.ts',
      [
        'import { targetFn } from \'../target.js\';',
        '',
        'targetFn();',
        ''
      ].join('\n')
    );

    // When: 移動 src/target.ts -> src/renamed.ts
    const result = await executeCLI(
      [
        'move', 'src/target.ts', 'src/renamed.ts',
        '--path', fixture.rootPath,
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    // Then: 應該成功，且 src/out/consumer.ts 的 import 路徑應更新為 '../renamed.js'
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerContent = await fixture.readFile('src/out/consumer.ts');
    // 正確行為：import 路徑應指向新位置 '../renamed.js'；
    // 目前的壞行為是 src/out/ 被通用排除目錄清單擋下，
    // consumer.ts 完全沒被掃到、import 路徑仍指向已不存在的 '../target.js'
    expect(consumerContent).toContain('../renamed.js');
    expect(consumerContent).not.toContain('../target.js');
  });
});
