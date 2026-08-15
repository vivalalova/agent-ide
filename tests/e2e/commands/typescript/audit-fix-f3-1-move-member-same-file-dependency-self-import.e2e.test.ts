/**
 * [audit-fix] F3-1 先紅回歸
 *
 * src/core/move-member/file-change-preparer.ts:411-430 的 generateDependencyImports
 * localExports 分支，在被移動成員依賴「同檔案內另一個 local export」時，一律用
 * calculateRelativePath(targetFile, sourceFile) 生成 import，沒有排除
 * sourceFile === target.filePath（同檔案內移動）的情況。同檔案移動時，依賴的
 * 那個 local export 本來就還在同一份檔案裡，不需要（也不能）額外補一個指向
 * 自己的 import，否則會產生自我 import 且與稍後仍存在的本地宣告衝突
 * （TS2440：Import declaration conflicts with local declaration）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix F3-1：move-member 同檔案移動時，依賴同檔本地 export 不得生成自我 import', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('target 依賴同檔 helper，同檔移動 target 後不得出現指向自身的 import', async () => {
    await fixture.writeFile('src/f3-1-foo.ts', `export const helper = () => 42;

export function target() {
  return helper() + 1;
}
`);

    const filePath = fixture.getFilePath('src/f3-1-foo.ts');
    const result = await executeCLI(
      [
        'move',
        `${filePath}:3`,
        `${filePath}:1`,
        '--path', fixture.rootPath,
        '--format', 'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const written = await fixture.readFile('src/f3-1-foo.ts');

    // 正確行為：同檔移動不需要（也不能）補 self-import，helper 仍在同檔內
    // 目前壞行為：頂部被插入 `import { helper } from './f3-1-foo.js';`，
    // 與稍後 `export const helper` 本地宣告衝突
    expect(written).not.toMatch(/import\s*\{\s*helper\s*\}\s*from\s*['"]\.\/f3-1-foo(?:\.js)?['"]/);
    expect(written).not.toContain('f3-1-foo');

    // helper 仍應以本地宣告的形式存在（唯一一份，非 import binding）
    expect(written.match(/const helper =/g)).toHaveLength(1);
    // target 仍呼叫 helper
    expect(written).toContain('helper() + 1');
    expect(written).toContain('function target()');
  });
});
