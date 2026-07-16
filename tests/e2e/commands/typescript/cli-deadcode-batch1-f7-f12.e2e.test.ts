/**
 * deadcode Batch1 缺陷 E2E（reproduction，先紅後綠）
 *
 * F7：`--exclude artifacts`（裸目錄名）應排除 artifacts/ 路徑，
 *     不是只排除符號名 artifacts。
 *     不用 build/：CLI_INDEX_DEFAULTS 已排除 build/**，測不到 --exclude 分類缺陷。
 * F12：跨行 multi-declarator `const a = 1,\n  b = 2;` 兩者 dead + --apply
 *      後語法須完好（刪整句或正確逗號手術）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI deadcode Batch1 defects (F7/F12)', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('F7：--exclude 裸目錄名應排除該路徑目錄，而非只排除同名符號', async () => {
    // 目錄名刻意不用 build/dist（預設索引已排除）；用 artifacts 測 --exclude 分類
    await fixture.writeFile(
      'artifacts/unused-artifact-f7.ts',
      'export function unusedInArtifactsDirF7() { return 1; }\n'
    );
    // 對照：符號名剛好叫 artifacts 的 dead 項目（不在 artifacts/ 下）
    await fixture.writeFile(
      'src/symbol-named-artifacts-f7.ts',
      'const artifacts = 1;\nexport function keepF7() { return 0; }\n'
    );

    const without = await executeCLI(
      [
        'deadcode',
        '--path', fixture.rootPath,
        '--dry-run',
        '--format', 'json',
        '--include-exports'
      ],
      { memfs: fixture.memfs }
    );
    expect(without.exitCode).toBe(0);
    const withoutOut = JSON.parse(without.stdout);
    const artifactsDirHitWithout = (withoutOut.files ?? []).some((f: { filePath: string }) =>
      /[/\\]artifacts[/\\]/.test(f.filePath)
    );
    // 前提：不排除時 artifacts/ 下的 dead 應被掃到
    expect(artifactsDirHitWithout).toBe(true);

    const withExclude = await executeCLI(
      [
        'deadcode',
        '--path', fixture.rootPath,
        '--dry-run',
        '--format', 'json',
        '--include-exports',
        '--exclude', 'artifacts'
      ],
      { memfs: fixture.memfs }
    );
    expect(withExclude.exitCode).toBe(0);
    const withOut = JSON.parse(withExclude.stdout);

    const artifactsDirHitWith = (withOut.files ?? []).some((f: { filePath: string }) =>
      /[/\\]artifacts[/\\]/.test(f.filePath)
    );
    // 正確：artifacts/ 目錄應被排除（裸名視為 path segment / 目錄）
    // 目前壞行為：裸名 artifacts 被當 excludeSymbols，只跳過符號名 artifacts，目錄仍出現
    expect(artifactsDirHitWith).toBe(false);
  });

  it('F12：跨行 multi-declarator 兩者皆 dead 時 --apply 後語法完好', async () => {
    // 用 let 而非 const：parser 會把 const 標成 Constant，DEFAULT_DEAD_CODE_OPTIONS 不含 Constant
    await fixture.writeFile(
      'src/multi-line-decl-f12.ts',
      [
        'let deadAlphaF12 = 1,',
        '  deadBetaF12 = 2;',
        'export function aliveF12() { return 1; }',
        ''
      ].join('\n')
    );

    const dryRun = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--dry-run', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(dryRun.exitCode).toBe(0);
    const dryOut = JSON.parse(dryRun.stdout);
    const target = (dryOut.files ?? []).find((f: { filePath: string }) =>
      f.filePath.includes('multi-line-decl-f12')
    );
    expect(target).toBeDefined();
    const deleted = (target.hunks ?? [])
      .flatMap((h: { lines: Array<{ type: string; content: string }> }) =>
        h.lines.filter((l: { type: string }) => l.type === 'delete').map((l: { content: string }) => l.content)
      )
      .join('\n');
    expect(deleted).toContain('deadAlphaF12');
    expect(deleted).toContain('deadBetaF12');

    const apply = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );
    expect(apply.exitCode).toBe(0);

    const after = await fixture.readFile('src/multi-line-decl-f12.ts');
    // 不得留下跨行分組失敗造成的語法毀損
    expect(after).not.toContain('deadAlphaF12');
    expect(after).not.toContain('deadBetaF12');
    expect(after).not.toMatch(/\b(const|let|var)\s*;/);
    expect(after).not.toMatch(/\b(const|let|var)\s*,/);
    expect(after).not.toMatch(/,\s*;/);
    expect(after).not.toMatch(/\b(const|let|var)\s+(export|function)\b/);
    // 殘留的 `= 2;` / 孤兒逗號延續行
    expect(after).not.toMatch(/^\s*,?\s*deadBetaF12/m);
    expect(after).not.toMatch(/^\s*=\s*2\s*;/m);
    expect(after).toMatch(/^export function aliveF12\(\) \{ return 1; \}$/m);
  });
});
