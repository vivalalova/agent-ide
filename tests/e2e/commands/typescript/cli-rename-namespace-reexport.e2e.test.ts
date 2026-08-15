/**
 * CLI rename regression (round 2 finding 1, reproduction — red first):
 *
 * `export * as ns from './def'` (NamespaceExport re-export) is not recognized by
 * target-exposure-resolver's parseReexportForwards (which only handles
 * `export { name } from` and `export * from`, not `export * as ns from`). A
 * consumer that imports the re-exported namespace binding and calls a member
 * through it (`ns.X()`) should have that member call renamed along with the
 * definition, the same way a direct namespace import (`import * as ns from
 * './def'`) already is (see cli-rename-bugs-f2.e2e.test.ts F2b).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（R2 finding 1：namespace re-export）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('export * as ns from barrel 底下的 ns.member() 呼叫應被同步重新命名', async () => {
    await fixture.writeFile('src/nsre-def.ts', 'export function nsReExportFn() { return 1; }\n');
    await fixture.writeFile('src/nsre-barrel.ts', 'export * as ns from \'./nsre-def\';\n');
    await fixture.writeFile('src/nsre-app.ts', [
      'import { ns } from \'./nsre-barrel\';',
      '',
      'ns.nsReExportFn();'
    ].join('\n'));

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'nsReExportFn', '--to', 'renamedNsReExportFn',
        '--at', 'src/nsre-def.ts:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const defAfter = await fixture.readFile('src/nsre-def.ts');
    const appAfter = await fixture.readFile('src/nsre-app.ts');

    expect(defAfter).toContain('renamedNsReExportFn');
    expect(appAfter).toContain('ns.renamedNsReExportFn()');
    expect(appAfter).not.toContain('nsReExportFn()');
  });
});
