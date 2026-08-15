/**
 * audit-fix Q5 regression（先紅後綠）
 *
 * barrel `export * as api from './def'` 時：
 * - consumer `import { api } from './barrel'` 再 `api.member` 應被 find-references 找到
 * - 與直接 `import * as api from './def'` 語意對齊（見 rename namespace re-export 測試）
 *
 * 根因候選：cross-file-import-binding 的 moduleFileProvidesSelectedSymbol /
 * addImportBindings 未把 `export * as ns` 視為「提供 def 的符號」的 namespace 轉發，
 * 導致 provider 鏈斷裂、引用漏報。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { executeCLI, loadFixture, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix Q5：export * as ns barrel find-references / module provides', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('經 export * as api barrel 的 api.member 引用應被 find-references 找到', async () => {
    await fixture.writeFile('src/q5-def.ts', 'export function q5Member() { return 1; }\n');
    await fixture.writeFile('src/q5-barrel.ts', 'export * as api from \'./q5-def\';\n');
    await fixture.writeFile(
      'src/q5-app.ts',
      [
        'import { api } from \'./q5-barrel\';',
        '',
        'export const q5Use = api.q5Member();'
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'q5Member',
        '--path',
        fixture.rootPath,
        '--at',
        'src/q5-def.ts:1:17',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      success: boolean;
      references: Array<{ file: string; context?: string; line?: number }>;
    };
    expect(output.success).toBe(true);

    // 定義本身
    expect(
      output.references.some(r => r.file.endsWith('q5-def.ts') && r.line === 1)
    ).toBe(true);

    // 經 barrel namespace 的 member 存取必須成立
    expect(
      output.references.some(
        r =>
          r.file.endsWith('q5-app.ts')
          && (r.context?.includes('api.q5Member') ?? false)
      )
    ).toBe(true);
  });

  it('直接 namespace import 對照組：import * as api from def 的 api.member 仍應找到（防 regression 誤寫）', async () => {
    await fixture.writeFile('src/q5b-def.ts', 'export function q5bMember() { return 1; }\n');
    await fixture.writeFile(
      'src/q5b-app.ts',
      [
        'import * as api from \'./q5b-def\';',
        '',
        'export const q5bUse = api.q5bMember();'
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'q5bMember',
        '--path',
        fixture.rootPath,
        '--at',
        'src/q5b-def.ts:1:17',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      success: boolean;
      references: Array<{ file: string; context?: string }>;
    };
    expect(output.success).toBe(true);
    expect(
      output.references.some(
        r =>
          r.file.endsWith('q5b-app.ts')
          && (r.context?.includes('api.q5bMember') ?? false)
      )
    ).toBe(true);
  });
});
