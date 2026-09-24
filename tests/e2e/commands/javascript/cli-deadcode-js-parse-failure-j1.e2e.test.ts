/**
 * CLI deadcode 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * J1：含 decorator 語法的 JS 檔，deadcode 把整份活碼判 dead
 *
 * 含 class member decorator（如 `@LogMethod()`）的 JS 檔，deadcode 對該檔的
 * reference-finder／declaration-analyzer 解析會失敗（WARN），導致該檔內部
 * 實際使用中的符號（`LogMethod`、`Controller`）被誤判為 dead code；
 * `--apply` 後會刪除仍在使用中的活碼，破壞執行期行為。
 *
 * 另外，deadcode 面對真正的語法錯誤檔（非 decorator）時，寧可漏報也不可
 * 誤刪：仍在使用中的符號不得被判為 dead code。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

interface DeadcodeLine {
  type: string;
  content: string;
}
interface DeadcodeHunk {
  lines: DeadcodeLine[];
}
interface DeadcodeFileEntry {
  filePath: string;
  hunks?: DeadcodeHunk[];
}

function extractDeletedContent(file: DeadcodeFileEntry | undefined): string {
  return (file?.hunks ?? [])
    .flatMap((h) => h.lines.filter((l) => l.type === 'delete').map((l) => l.content))
    .join('\n');
}

describe('CLI deadcode 缺陷 J1：JS decorator 檔解析失敗誤判整份活碼為 dead', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[J1] deadcode 預設模式不應把含 decorator 的 JS 檔中被使用的 LogMethod／Controller 判為 dead code', async () => {
    await fixture.writeFile(
      'src/deco-j1.js',
      [
        'function LogMethod() {',
        '  return () => {};',
        '}',
        '',
        'class Controller {',
        '  @LogMethod()',
        '  unusedDecoratedHandler() { return 1; }',
        '',
        '  unusedPlainHandler() { return 2; }',
        '}',
        '',
        'new Controller();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const decoFile = (output.files ?? []).find(
      (f: DeadcodeFileEntry) => f.filePath.includes('deco-j1.js')
    );
    const deletedContent = extractDeletedContent(decoFile);

    expect(deletedContent).not.toContain('function LogMethod');
    expect(deletedContent).not.toContain('class Controller');
  });

  it('[J1] deadcode --include-public-members 時，LogMethod／Controller／unusedDecoratedHandler 不應被判為 dead code（unusedPlainHandler 無呼叫點應被判為 dead）', async () => {
    await fixture.writeFile(
      'src/deco-j1b.js',
      [
        'function LogMethod() {',
        '  return () => {};',
        '}',
        '',
        'class Controller {',
        '  @LogMethod()',
        '  unusedDecoratedHandler() { return 1; }',
        '',
        '  unusedPlainHandler() { return 2; }',
        '}',
        '',
        'new Controller();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json', '--include-public-members'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const decoFile = (output.files ?? []).find(
      (f: DeadcodeFileEntry) => f.filePath.includes('deco-j1b.js')
    );
    const deletedContent = extractDeletedContent(decoFile);

    expect(deletedContent).not.toContain('function LogMethod');
    expect(deletedContent).not.toContain('class Controller');
    expect(deletedContent).not.toContain('unusedDecoratedHandler');

    // 未修飾且無呼叫點的成員，仍應正確判為 dead code
    expect(deletedContent).toContain('unusedPlainHandler');
  });

  it('[J1] deadcode --apply 後，含 decorator 的 JS 檔仍應保留使用中的 LogMethod 與 Controller', async () => {
    await fixture.writeFile(
      'src/deco-j1c.js',
      [
        'function LogMethod() {',
        '  return () => {};',
        '}',
        '',
        'class Controller {',
        '  @LogMethod()',
        '  unusedDecoratedHandler() { return 1; }',
        '',
        '  unusedPlainHandler() { return 2; }',
        '}',
        '',
        'new Controller();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);

    const content = await fixture.readFile('src/deco-j1c.js');
    expect(content).toContain('function LogMethod');
    expect(content).toContain('class Controller');
    expect(content).toContain('new Controller();');
  });

  it('[J1] deadcode 面對真正語法錯誤（非 decorator）的 JS 檔時，寧可漏報也不可把使用中的 ok 判為 dead code', async () => {
    await fixture.writeFile(
      'src/syntax-error-j1.js',
      [
        'function ok() { return 1; }',
        'const x = ;',
        'ok();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);

    const errorFile = (output.files ?? []).find(
      (f: DeadcodeFileEntry) => f.filePath.includes('syntax-error-j1.js')
    );
    const deletedContent = extractDeletedContent(errorFile);

    expect(deletedContent).not.toContain('function ok');
  });
});
