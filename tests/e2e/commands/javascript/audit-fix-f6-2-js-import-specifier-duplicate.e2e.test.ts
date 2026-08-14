/**
 * F6-2: 無別名具名 import（`import { helper } from ...`）在 Babel AST 中有兩個
 * 位置相同的 Identifier 節點（ImportSpecifier 的 `imported` 與 `local`），
 * JS reference-finder 的 Identifier visitor 對兩者都收集，同一個 import 位置
 * 被回報成兩筆 Import 引用。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

interface ReferenceRow {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

describe('JS find-references 無別名具名 import 去重（F6-2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('同一個 import specifier 位置只回報一筆引用', async () => {
    await fixture.writeFile('src/f6-2-def.js', 'export function f62Helper() {\n  return 1;\n}\n');
    await fixture.writeFile(
      'src/f6-2-consumer.js',
      'import { f62Helper } from \'./f6-2-def.js\';\n\nexport function useIt() {\n  return f62Helper();\n}\n'
    );

    const result = await executeCLI(
      ['find-references', 'f62Helper', '--path', fixture.rootPath, '--format', 'json', '--no-cache'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const references: ReferenceRow[] = output.references ?? output.results ?? [];

    const positions = references.map(reference => `${reference.file}:${reference.line}:${reference.column}`);
    expect(new Set(positions).size).toBe(positions.length);

    const importLineHits = references.filter(
      reference => reference.file.includes('f6-2-consumer') && reference.line === 1
    );
    expect(importLineHits).toHaveLength(1);
  });
});
