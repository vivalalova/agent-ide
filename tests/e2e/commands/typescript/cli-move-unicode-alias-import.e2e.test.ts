/**
 * CLI move 命令 E2E 測試 - Unicode 別名 import 路徑未更新（C6）
 *
 * 由 cli-move-import-rewrite-bugs.e2e.test.ts 依主題拆分（行為不變，內容逐字搬移）。
 *
 * C6: 使用 Unicode 識別符做別名的 namespace import（import * as 工具）與 default import
 *     （import 別名 from ...）時，move 完全沒更新其路徑，殘留指向已不存在的舊路徑。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - Unicode 別名 import 路徑未更新 (C6)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，Unicode namespace import（import * as 工具）的路徑應被更新', async () => {
    await fixture.writeFile('src/old.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/uni.ts',
      `import * as 工具 from './old.js';

export const n = 工具.value;
`
    );

    const result = await executeCLI(
      ['move', 'src/old.ts', 'src/fresh.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const uniContent = await fixture.readFile('src/uni.ts');

    // 錯誤重現點：目前 uni.ts 完全沒被更新，路徑仍指向已不存在的 './old.js'
    expect(uniContent).not.toContain('from \'./old.js\'');
    expect(uniContent).toContain('from \'./fresh.js\'');
  });

  it('move 後，Unicode 別名 default import 的路徑應被更新', async () => {
    await fixture.writeFile(
      'src/old-default.ts',
      'export default function greet() {\n  return \'hi\';\n}\n'
    );
    await fixture.writeFile(
      'src/uni-default.ts',
      `import 別名 from './old-default.js';

export const greeting = 別名();
`
    );

    const result = await executeCLI(
      [
        'move',
        'src/old-default.ts',
        'src/fresh-default.ts',
        '--path', fixture.rootPath,
        '--format', 'json',
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const uniDefaultContent = await fixture.readFile('src/uni-default.ts');

    // 錯誤重現點：Unicode 別名 default import 的路徑同樣沒被更新
    expect(uniDefaultContent).not.toContain('from \'./old-default.js\'');
    expect(uniDefaultContent).toContain('from \'./fresh-default.js\'');
  });
});
