/**
 * CLI deadcode 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * J1：src/plugins/javascript/reference-finder.ts:140-183 的 Identifier visitor
 *     只過濾 `parent.imported === path.node`（別名 import 的 imported 名），
 *     unaliased named import 的 local 節點、default import、namespace import
 *     三種形狀全部漏網，落回 Read → Usage → deadcode 把「被 import 但從未使用」
 *     的 JS export 當存活（D4 修復只涵蓋 TS 側，JS 側同一類缺陷仍在）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode 缺陷 regression（J1，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function findDeletedContents(
    output: { files?: Array<{ filePath: string; hunks?: Array<{ lines: Array<{ type: string; content: string }> }> }> },
    fileNameIncludes: string
  ): string {
    const file = output.files?.find((f) => f.filePath.includes(fileNameIncludes));
    if (!file) {
      return '';
    }
    return (file.hunks ?? [])
      .flatMap((h) => h.lines.filter((l) => l.type === 'delete').map((l) => l.content))
      .join('\n');
  }

  it('J1a：unaliased named import 後未使用的 export 應被判定為 dead code', async () => {
    await fixture.writeFile(
      'src/j1a-source.js',
      'export function orphanNamedJ1() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/j1a-consumer.js',
      'import { orphanNamedJ1 } from \'./j1a-source.js\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const deletedContents = findDeletedContents(output, 'j1a-source');

    expect(deletedContents).toContain('orphanNamedJ1');
  });

  it('J1b：default import 後未使用的 export 應被判定為 dead code', async () => {
    await fixture.writeFile(
      'src/j1b-source.js',
      'export default function orphanDefaultJ1() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/j1b-consumer.js',
      'import orphanDefaultJ1 from \'./j1b-source.js\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const deletedContents = findDeletedContents(output, 'j1b-source');

    expect(deletedContents).toContain('orphanDefaultJ1');
  });

  it('J1c：namespace import 後未使用的 export 應被判定為 dead code', async () => {
    await fixture.writeFile(
      'src/j1c-source.js',
      'export function orphanNsJ1() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/j1c-consumer.js',
      'import * as j1cMod from \'./j1c-source.js\';\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const deletedContents = findDeletedContents(output, 'j1c-source');

    expect(deletedContents).toContain('orphanNsJ1');
  });

  it('對照組：被實際使用的 named import 不應被判定為 dead code', async () => {
    await fixture.writeFile(
      'src/j1g-source.js',
      'export function usedJ1() { return 1; }\n'
    );
    await fixture.writeFile(
      'src/j1g-consumer.js',
      'import { usedJ1 } from \'./j1g-source.js\';\nconsole.log(usedJ1());\n'
    );

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--include-exports', '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const deletedContents = findDeletedContents(output, 'j1g-source');

    expect(deletedContents).not.toContain('usedJ1');
  });
});
