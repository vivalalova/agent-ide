/**
 * CLI rename E2E 測試：TS 二段式轉發（import 後單獨 export）跨三檔改名
 *
 * a.ts 定義 x，b.ts 以 `import { x } from './a'` 後單獨 `export { x }`
 * 轉發（非 `export { x } from './a'` 一段式 re-export），c.ts 再 `import { x }
 * from './b'` 並呼叫。rename a.ts 的 x 須同步改到 b.ts 的 import／export
 * 與 c.ts 的 import／呼叫點。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename：TS 二段式轉發跨三檔改名', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[AL-reexport2-ts] 二段式轉發（import 後單獨 export）的第三檔 import 須同步改名', async () => {
    await fixture.writeFile(
      'src/a-reexport2.ts',
      [
        'export function x(): number {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/b-reexport2.ts',
      [
        'import { x } from \'./a-reexport2\';',
        'export { x };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/c-reexport2.ts',
      [
        'import { x } from \'./b-reexport2\';',
        'x();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'x', '--to', 'y',
        '--at', 'src/a-reexport2.ts:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const bContent = await fixture.readFile('src/b-reexport2.ts');
    const cContent = await fixture.readFile('src/c-reexport2.ts');

    expect(bContent).toContain('import { y }');
    expect(bContent).toContain('export { y }');

    expect(cContent).toContain('import { y } from \'./b-reexport2\'');
    expect(cContent).toContain('y();');
  });
});
