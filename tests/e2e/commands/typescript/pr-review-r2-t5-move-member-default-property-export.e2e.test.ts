/**
 * PR #61 第二輪 review 缺陷 T5（reproduction，先紅後綠）
 *
 * dangling-export.ts:40 把 `export default Foo.bar;` 當成單純的識別符
 * default export，改寫時只替換掉 `export default Foo` 的部分、把後綴
 * `.bar` 原樣留下，產出 `export { Foo as default } from './t5-target.js';.bar;`
 * 這種語法破碎的輸出。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（T5：export default Foo.bar 殘留）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[錯誤重現點] 搬移 Foo 後來源檔不得產出語法破碎的 export', async () => {
    await fixture.writeFile('src/t5-source.ts', `const Foo = {
  bar: function member(): number {
    return 1;
  }
};

export default Foo.bar;
`);
    await fixture.writeFile('src/t5-target.ts', `export const placeholder = true;
`);

    // Foo 宣告在第 1 行
    const result = await executeCLI(
      [
        'move',
        `${fixture.getFilePath('src/t5-source.ts')}:1`,
        fixture.getFilePath('src/t5-target.ts'),
        '-p',
        fixture.rootPath,
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const source = await fixture.readFile('src/t5-source.ts');

    // 錯誤重現點：re-export 語句後面殘留孤兒 `.bar;` 片段
    expect(source).not.toContain(';.bar');
    // 任何 `.bar` 若還在，必須附著在合法的運算式上（前面不是分號/行首）
    expect(source).not.toMatch(/^\s*\.bar\b/m);
  });
});
