/**
 * CLI rename / find-references 缺陷 E2E 測試（scan reproduction，先紅後綠，2 筆）
 *
 * C1：rename 對 namespace import（`import * as ns from './x'`）的成員存取（`ns.target()`）
 *     以 AST 直接收集所有同名 identifier，未檢查 lexical shadowing——當同名參數
 *     （如 `function shadowed(ns: {...})`）遮蔽了 namespace import 的 `ns` binding 時，
 *     函數內被遮蔽的 `ns.target()` 仍被誤判為對 namespace member 的引用而一併改名。
 *     根因位置：src/plugins/typescript/language-service.ts（AST 收集階段未做 shadowing 檢查）。
 *     正確行為：只有真正綁定到 namespace import 的 `ns.target()` 才應被改名，被參數
 *     遮蔽的同名 `ns.target()` 與型別註解中的 `target` 都不得變動。
 * C2：find-references 誤把 interface method 簽名（如 `interface API { run(): void; }` 中的
 *     `run`）當成對函式 `run` 的引用。
 *     根因位置：src/interfaces/cli/commands/ast-node-location.ts 的
 *     isExcludedPropertyKeyIdentifier 只排除一般 property key，漏排除 MethodSignature
 *     的方法名稱，導致 interface method 簽名的識別符被當一般引用收集。
 *     正確行為：references 應包含 import 與實際呼叫，但不含 interface method 簽名。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename/find-references 缺陷 regression（C1-C2）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C1：rename 不得誤改被同名參數遮蔽的 namespace member 存取', async () => {
    await fixture.writeFile('src/source-c1.ts', `export function target() { return 1; }
`);
    await fixture.writeFile('src/consumer-c1.ts', `import * as ns from './source-c1';
export function shadowed(ns: { target: () => number }) { return ns.target(); }
export const ok = ns.target();
`);

    // target 定義於 src/source-c1.ts:1:17
    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'target', '--to', 'renamed',
        '--at', 'src/source-c1.ts:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerContent = await fixture.memfs.readFile(
      fixture.getFilePath('src/consumer-c1.ts'), 'utf-8'
    ) as string;
    const lines = consumerContent.split('\n');

    // 正確行為：module 層的 `ns.target()`（真正綁定到 namespace import 的 ns）應被改名
    expect(lines[2]).toContain('ns.renamed()');
    expect(lines[2]).not.toContain('ns.target()');

    // Bug：shadowed() 內的 `ns` 是函數參數，遮蔽了 namespace import 的 ns，
    // 其 `ns.target()` 不應被改名
    expect(lines[1]).toContain('ns.target()');
    expect(lines[1]).not.toContain('ns.renamed()');

    // 型別註解裡的 `target: () => number` 也不得被改
    expect(lines[1]).toContain('target: () => number');
  });

  it('C2：find-references 不應把 interface method 簽名當成對同名函式的引用', async () => {
    await fixture.writeFile('src/defs-c2.ts', `export function run() { return 1; }
`);
    await fixture.writeFile('src/consumer-c2.ts', `import { run } from './defs-c2';
interface API { run(): void; }
export const x = run();
`);

    // run 定義於 src/defs-c2.ts:1:17
    const result = await executeCLI(
      [
        'find-references', 'run',
        '--path', fixture.rootPath,
        '--at', 'src/defs-c2.ts:1:17',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const consumerRefs = output.references.filter(
      (r: any) => r.file.endsWith('consumer-c2.ts')
    );

    // 正確行為：import（第 1 行）與實際呼叫（第 3 行）都應被找到
    expect(consumerRefs.some((r: any) => r.line === 1)).toBe(true);
    expect(consumerRefs.some((r: any) => r.line === 3)).toBe(true);

    // Bug：interface API 內的 method 簽名 `run(): void`（第 2 行）不是對函式 run 的引用，
    // 不應出現在 references 中
    expect(consumerRefs.some((r: any) => r.line === 2)).toBe(false);
  });
});
