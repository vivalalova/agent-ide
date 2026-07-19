/**
 * CLI move 命令 E2E 測試 - 目錄移動時顯式副檔名的內部相對引用（P1 regression）
 *
 * Bug: 目錄整體搬移時，目錄內部檔案彼此的相對 import 若帶顯式副檔名（如 './sub/deep.js'），
 * 現況實作會誤把它當成「需要重新計算路徑」的引用，改寫成搬移前的舊絕對相對路徑
 * （如 '../../src/feature/sub/deep.js'）；該路徑在新位置下已不存在，import 會直接壞掉。
 * 省略副檔名的版本（'./sub/deep'）現況是正確的（co-move 後維持不變），作為控制組對照。
 *
 * 正確行為：目錄內部檔案間的相對引用，其相對位置在搬移後未改變，不論是否帶顯式副檔名都應該
 * 維持原樣（co-move），不得被重寫成失效的舊路徑。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - 目錄移動＋顯式副檔名的內部引用應 co-move 保持不變', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('顯式 .js 副檔名的內部相對引用，搬移後應仍是 "./sub/deep.js"', async () => {
    // Given: src/feature/index.ts 用顯式副檔名匯入同目錄下的 sub/deep
    await fixture.writeFile('src/feature/sub/deep.ts', `
export const deep = 'deep-value';
`);
    await fixture.writeFile('src/feature/index.ts', `
import { deep } from './sub/deep.js';

export function useDeep(): string {
  return deep;
}
`);

    // When: 整個 src/feature 目錄搬到 target-dir
    const result = await executeCLI(
      [
        'move',
        'src/feature',
        'target-dir',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正確：內部相對引用的相對位置沒變，應維持原樣
    const indexContent = await fixture.readFile('target-dir/index.ts');
    expect(indexContent).toContain('from \'./sub/deep.js\'');
    // 現況缺陷：被錯誤改寫成搬移前已不存在的舊路徑
    expect(indexContent).not.toContain('src/feature');
  });

  it('控制組：省略副檔名的內部相對引用，搬移後現況已正確保持不變', async () => {
    // Given: 同樣結構，但 import 省略副檔名
    await fixture.writeFile('src/feature/sub/deep.ts', `
export const deep = 'deep-value';
`);
    await fixture.writeFile('src/feature/index.ts', `
import { deep } from './sub/deep';

export function useDeep(): string {
  return deep;
}
`);

    // When: 整個 src/feature 目錄搬到 target-dir
    const result = await executeCLI(
      [
        'move',
        'src/feature',
        'target-dir',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 控制組現況即正確：省略副檔名版本 co-move 後維持不變
    const indexContent = await fixture.readFile('target-dir/index.ts');
    expect(indexContent).toContain('from \'./sub/deep\'');
    expect(indexContent).not.toContain('src/feature');
  });
});
