/**
 * CLI move 命令 E2E 測試 - Import 路徑改寫誤傷字串/註解、Unicode 別名 import 未更新
 *
 * C5: move 更新 import 路徑時，誤把字串字面值與行內註解中長得像 import 陳述式的文字也改掉，
 *     應該只更新真正的 import 陳述式，字串與註解內容要維持原樣。
 * C6: 使用 Unicode 識別符做別名的 namespace import（import * as 工具）與 default import
 *     （import 別名 from ...）時，move 完全沒更新其路徑，殘留指向已不存在的舊路徑。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move - import 路徑改寫誤傷字串與註解 (C5)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('move 後，字串字面值與行內註解中的 import 字樣應保持原樣，只更新真正的 import 陳述式', async () => {
    await fixture.writeFile('src/old.ts', 'export const value = 1;\n');
    await fixture.writeFile(
      'src/note.ts',
      `import { value } from './old.js';

export const docExample = "import { value } from './old.js'";
export const usage = value; // 參考 import { value } from './old.js' 的寫法
`
    );

    const result = await executeCLI(
      ['move', 'src/old.ts', 'src/fresh.ts', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const noteContent = await fixture.readFile('src/note.ts');

    // 真正的 import 陳述式應更新為新路徑
    expect(noteContent).toContain('import { value } from \'./fresh.js\';');

    // 錯誤重現點 1：字串字面值中的 import 字樣目前被誤改成 './fresh.js'，
    // 正確行為應保持原樣（字串內容不是真正的 import）
    expect(noteContent).toContain(
      'export const docExample = "import { value } from \'./old.js\'";'
    );

    // 錯誤重現點 2：行內註解中的 import 字樣目前也被誤改，
    // 正確行為應保持原樣（註解不是真正的 import）
    expect(noteContent).toContain(
      'export const usage = value; // 參考 import { value } from \'./old.js\' 的寫法'
    );
  });
});

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
