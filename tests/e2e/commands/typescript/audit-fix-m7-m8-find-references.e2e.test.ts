/**
 * audit-fix M7 / M8 regression（先紅後綠）
 *
 * M7：find-references 無 --at 時，仍應抓到 default import 別名
 *     （export default function greet；import hello from ...；hello()）。
 * M8：多同名符號 + path alias import 時，別名引用仍應能補搜到正確定義側。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix M7/M8：find-references default import / path alias', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M7：無 --at 時 default import 別名呼叫仍應出現在 references', async () => {
    await fixture.writeFile(
      'src/m7-lib.ts',
      [
        'export default function m7Greet(): number {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/m7-use.ts',
      [
        'import m7Hello from \'./m7-lib.js\';',
        '',
        'export const m7R = m7Hello();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'm7Greet',
        '--path',
        fixture.rootPath,
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const useRefs = (output.references as any[]).filter((r) => r.file.endsWith('m7-use.ts'));
    // Bug：default import 別名補搜僅掛在 --at 路徑，無 --at 時 import/呼叫皆漏
    expect(useRefs.some((r) => r.line === 1 || r.context?.includes('m7Hello'))).toBe(true);
    expect(useRefs.some((r) => r.line === 3 || r.context?.includes('m7Hello()'))).toBe(true);
  });

  it('M8：多同名 + path alias import 別名使用應綁到 --at 鎖定的定義', async () => {
    await fixture.writeFile(
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2020',
          module: 'ESNext',
          moduleResolution: 'bundler',
          baseUrl: '.',
          paths: {
            '@lib/*': ['src/lib/*']
          }
        },
        include: ['src/**/*']
      })
    );
    await fixture.writeFile(
      'src/lib/m8-left.ts',
      'export function m8Pipeline() { return \'left\'; }\n'
    );
    await fixture.writeFile(
      'src/lib/m8-right.ts',
      'export function m8Pipeline() { return \'right\'; }\n'
    );
    await fixture.writeFile(
      'src/m8-use-left.ts',
      [
        'import { m8Pipeline as runLeft } from \'@lib/m8-left\';',
        'export const m8L = runLeft();',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/m8-use-right.ts',
      [
        'import { m8Pipeline as runRight } from \'./lib/m8-right.js\';',
        'export const m8R = runRight();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'm8Pipeline',
        '--path',
        fixture.rootPath,
        '--at',
        'src/lib/m8-left.ts:1',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const refs = output.references as any[];
    // path alias + local alias runLeft 必須抓到
    expect(
      refs.some(
        (r) =>
          r.file.endsWith('m8-use-left.ts')
          && (r.context?.includes('runLeft') || r.line === 1 || r.line === 2)
      )
    ).toBe(true);
    // 不得誤抓 right 側
    expect(refs.some((r) => r.file.endsWith('m8-use-right.ts'))).toBe(false);
  });
});
