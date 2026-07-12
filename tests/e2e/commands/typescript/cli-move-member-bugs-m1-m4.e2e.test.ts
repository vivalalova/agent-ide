/**
 * CLI move-member 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * M1：首行含自我封閉 `{...}` 的多行成員（如 `(opts = { a: 1 }) => {`）被
 *     range-finder.ts 的 findBlockEnd 誤判為區塊已在首行結束，導致成員被截斷。
 * M2：成員緊鄰的 `//` 行註解會被 extractDocumentation 剝除 `//` 前綴，
 *     file-change-preparer.ts 又原樣拼回目標檔，變成裸文字而非合法註解。
 * M3：class 前的 `@decorator` 不在 typescript-extractor.ts 的宣告範圍內，
 *     移動時 decorator 會遺失（目標檔沒有、來源檔留下孤兒 decorator 行）。
 * M4：reference-updater.ts 對 sourceFile/targetFile 一律 continue 跳過，
 *     同檔案內原本呼叫被移動成員的程式碼，移動後不會補上 import。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI move-member 缺陷 regression（M1-M4）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M1：首行自我封閉 {} 的箭頭函式成員應完整搬移，不被截斷', async () => {
    await fixture.writeFile('src/self-closing-source.ts', `export const fn = (opts = { a: 1 }) => {
  return opts;
};

export function stay(): string {
  return 'stay';
}
`);
    await fixture.writeFile('src/self-closing-target.ts', '');

    // fn 在第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/self-closing-source.ts')}:1`, fixture.getFilePath('src/self-closing-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/self-closing-target.ts'), 'utf-8') as string;
    // 完整三行宣告都應搬到目標檔
    expect(targetContent).toContain('opts = { a: 1 }');
    expect(targetContent).toContain('return opts;');
    expect(targetContent).toContain('};');

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/self-closing-source.ts'), 'utf-8') as string;
    // 來源檔不應殘留孤兒的 return / 收尾大括號
    expect(sourceContent).not.toContain('return opts;');
    expect(sourceContent).toContain('stay');
  });

  it('M2：成員緊鄰的 // 行註解搬移後仍須是合法註解，不得變裸文字', async () => {
    await fixture.writeFile('src/comment-source.ts', `// helper function
export function foo() {
  return 1;
}

export function stay(): string {
  return 'stay';
}
`);
    await fixture.writeFile('src/comment-target.ts', '');

    // foo 在第 2 行（第 1 行是註解）
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/comment-source.ts')}:2`, fixture.getFilePath('src/comment-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/comment-target.ts'), 'utf-8') as string;
    expect(targetContent).toContain('foo');
    // 註解行必須仍帶 // 前綴，不能是裸露文字
    expect(targetContent).toContain('// helper function');
    expect(targetContent).not.toMatch(/^helper function$/m);
  });

  it('M3：class 前的 decorator 應隨成員一起搬移，來源檔不留孤兒 decorator', async () => {
    await fixture.writeFile('src/decorator-source.ts', `function Injectable(): ClassDecorator {
  return () => {
    /* noop */
  };
}

@Injectable()
export class Service {
  run() {
    return 1;
  }
}
`);
    await fixture.writeFile('src/decorator-target.ts', '');

    // Service 在第 7 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/decorator-source.ts')}:7`, fixture.getFilePath('src/decorator-target.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const targetContent = await fixture.memfs.readFile(fixture.getFilePath('src/decorator-target.ts'), 'utf-8') as string;
    expect(targetContent).toContain('class Service');
    expect(targetContent).toContain('@Injectable()');

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/decorator-source.ts'), 'utf-8') as string;
    // 來源檔不應殘留孤兒的 @Injectable() 裝飾器行
    expect(sourceContent).not.toContain('@Injectable()');
  });

  it('M4：同檔案內殘留引用被移動成員時，來源檔需補上對目標檔的 import', async () => {
    await fixture.writeFile('src/a.ts', `export function foo() {
  return 1;
}

export function bar() {
  return foo() + 1;
}
`);
    await fixture.writeFile('src/b.ts', '');

    // foo 在第 1 行
    const result = await executeCLI(
      ['move', `${fixture.getFilePath('src/a.ts')}:1`, fixture.getFilePath('src/b.ts'),
        '-p', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const sourceContent = await fixture.memfs.readFile(fixture.getFilePath('src/a.ts'), 'utf-8') as string;
    // bar 仍呼叫 foo，來源檔應有從 b 匯入 foo 的 import，讓 bar 能解析 foo
    expect(sourceContent).toContain('bar');
    expect(sourceContent).toMatch(/import\s*\{[^}]*foo[^}]*\}\s*from\s*['"].*b['"]/);
  });
});
