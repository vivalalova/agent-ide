/**
 * audit-fix F1-2 regression（先紅後綠）
 *
 * 同檔 `export { x as y }`（無 from，本地 re-export）別名鏈漏抓下游引用。
 *
 * src/interfaces/cli/commands/reexport-alias-references.ts:125-141 的
 * `collectNamedReExportDeclarations` 只收集 `moduleSpecifier` 存在（即帶
 * `from '...'`）的 export 宣告；同檔內 `export { Foo as PublicFoo }`（無 from，
 * 本地符號改名匯出）完全不會被列入 `aliasExports`，導致下游 import 該別名
 * 的檔案對原始符號的引用（import 該行與呼叫點）全部漏抓。
 *
 * 對比 src/core/foundations/cross-file-import-binding.ts:312-323 對「本地
 * re-export」的語意處理並不要求 moduleSpecifier，兩處對「同檔 export alias」
 * 的認定不一致，是本缺陷的根因。
 *
 * 三檔鏈（origin → barrel 用本地別名 re-export → consumer）同樣因為 barrel
 * 端的別名匯出無 from 而漏抓。
 *
 * 對照組（保護性）：`export { Foo as PublicFoo } from './origin.js'`
 * （有 from）鏈路現行已正常抓到，此測試確保修復不破壞現有行為。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix F1-2：同檔 export alias（無 from）別名鏈漏抓下游引用', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('a) 單檔別名：find-references 應找到透過本地別名匯出 import 並呼叫的下游引用', async () => {
    await fixture.writeFile('src/f12a-origin2.ts', [
      'function Foo2() { return 1; }',
      'export { Foo2 as PublicFoo2 };'
    ].join('\n'));
    await fixture.writeFile('src/f12a-consumer.ts', [
      'import { PublicFoo2 } from \'./f12a-origin2.js\';',
      'export function useFoo2() {',
      '  return PublicFoo2();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      [
        'find-references',
        'Foo2',
        '--path',
        fixture.rootPath,
        '--at',
        'src/f12a-origin2.ts:1:10',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerRefs: any[] = output.references.filter((r: any) => r.file.endsWith('f12a-consumer.ts'));

    // Bug：collectNamedReExportDeclarations 只收有 moduleSpecifier（帶 from）的
    // export 宣告，同檔本地別名匯出完全不會被列入 aliasExports，consumerRefs 現行為 []
    expect(consumerRefs.some((r) => r.context.includes('import { PublicFoo2 }'))).toBe(true);
    expect(consumerRefs.some((r) => r.context.includes('return PublicFoo2();'))).toBe(true);
  });

  it('a) 單檔別名：call-hierarchy incoming 應找到透過本地別名匯出呼叫的下游 caller', async () => {
    await fixture.writeFile('src/f12a2-origin2.ts', [
      'function Foo2b() { return 1; }',
      'export { Foo2b as PublicFoo2b };'
    ].join('\n'));
    await fixture.writeFile('src/f12a2-consumer.ts', [
      'import { PublicFoo2b } from \'./f12a2-origin2.js\';',
      'export function useFoo2b() {',
      '  return PublicFoo2b();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      [
        'call-hierarchy',
        'Foo2b',
        '--path',
        fixture.rootPath,
        '--at',
        'src/f12a2-origin2.ts:1:10',
        '--direction',
        'incoming',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const callers: string[] = output.incoming.map((c: any) => c.caller);

    // Bug：同一套 aliasExports 收集邏輯漏收本地別名匯出，incoming 現行為 []
    expect(callers).toContain('useFoo2b');
  });

  it('b) 三檔鏈：origin → barrel（本地別名 re-export）→ consumer，find-references 應找到 consumer 的引用', async () => {
    await fixture.writeFile('src/f12b-origin.ts', 'export function Foo() { return 1; }\n');
    await fixture.writeFile('src/f12b-barrel.ts', [
      'import { Foo } from \'./f12b-origin.js\';',
      'export { Foo as PublicFoo };'
    ].join('\n'));
    await fixture.writeFile('src/f12b-consumer.ts', [
      'import { PublicFoo } from \'./f12b-barrel.js\';',
      'export function useFoo() {',
      '  return PublicFoo();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      [
        'find-references',
        'Foo',
        '--path',
        fixture.rootPath,
        '--at',
        'src/f12b-origin.ts:1:17',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const consumerRefs: any[] = output.references.filter((r: any) => r.file.endsWith('f12b-consumer.ts'));

    // Bug：barrel 端的 `export { Foo as PublicFoo }`（無 from）不會被收進 aliasExports，
    // 鏈路在 barrel 這一跳就斷掉，consumer 的引用現行漏抓
    expect(consumerRefs.some((r) => r.context.includes('import { PublicFoo }'))).toBe(true);
    expect(consumerRefs.some((r) => r.context.includes('return PublicFoo();'))).toBe(true);
  });

  it('對照組：`export { Foo as PublicFoo } from \'...\'`（有 from）鏈路現行應正常抓到 consumer 引用', async () => {
    await fixture.writeFile('src/f12c-origin.ts', 'export function Foo3() { return 1; }\n');
    await fixture.writeFile('src/f12c-barrel.ts', 'export { Foo3 as PublicFoo3 } from \'./f12c-origin.js\';\n');
    await fixture.writeFile('src/f12c-consumer.ts', [
      'import { PublicFoo3 } from \'./f12c-barrel.js\';',
      'export function useFoo3() {',
      '  return PublicFoo3();',
      '}'
    ].join('\n'));

    const result = await executeCLI(
      [
        'find-references',
        'Foo3',
        '--path',
        fixture.rootPath,
        '--at',
        'src/f12c-origin.ts:1:17',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    const consumerRefs: any[] = output.references.filter((r: any) => r.file.endsWith('f12c-consumer.ts'));

    expect(consumerRefs.some((r) => r.context.includes('import { PublicFoo3 }'))).toBe(true);
    expect(consumerRefs.some((r) => r.context.includes('return PublicFoo3();'))).toBe(true);
  });
});
