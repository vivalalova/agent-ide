/**
 * CLI search 缺陷 E2E 測試（scan reproduction，先紅後綠，1 筆）
 *
 * C3：JS 具名 alias import 的符號索引位置錨在 exported name 而非 local binding。
 *     src/plugins/javascript/parser.ts 的 extractImportSymbol 呼叫
 *     createSymbolFromNode 時沒有傳入 identifierNode 參數，導致其預設用整個
 *     ImportSpecifier 節點的範圍（起點落在 imported name，如 `foo as bar` 中的
 *     `foo`）當作符號位置，而非實際綁定於程式碼中的 local name（`bar`）。
 *     rename 功能本身正常（--at 1:17 可成功定位 bar），此處只釘 search 位置錯誤。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI search 缺陷 regression（C3）- JavaScript 專案', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C3：具名 alias import 的符號位置應錨在 local binding（bar），非 exported name（foo）', async () => {
    await fixture.writeFile('src/defs-c3.js', 'export function foo() { return 1; }\n');
    await fixture.writeFile(
      'src/consumer-c3.js',
      `import { foo as bar } from './defs-c3.js';
export const y = bar();
`
    );

    const result = await executeCLI(
      ['search', 'bar', '--path', fixture.rootPath, '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const match = output.results.find((r: { filePath: string }) => r.filePath.includes('consumer-c3.js'));
    expect(match).toBeDefined();
    // 正確行為：`import { foo as bar } from './defs-c3.js';` 中 bar 識別符實際位於
    // column 17；目前的壞行為回報 column 10（那是 foo 的位置，即整個
    // ImportSpecifier 節點的起點，而非 local binding bar）
    expect(match.line).toBe(1);
    expect(match.column).toBe(17);
  });
});
