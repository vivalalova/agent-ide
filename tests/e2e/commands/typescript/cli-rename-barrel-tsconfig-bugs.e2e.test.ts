/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * C3：tsconfig path alias（`paths` 映射，如 `@app/*` -> `src/*`）匯入的
 *     consumer 未被更新。定義端本身會正確改名（該部分已修好），但透過
 *     alias specifier（如 `@app/target`）匯入該符號的檔案完全不動，
 *     遺留對已改名、不存在符號的 import，呼叫端因此斷鏈。
 *
 *     根因：src/plugins/typescript/language-service.ts 的
 *     moduleSpecifierMatchesDefinition 對非相對（non-relative）specifier
 *     無條件回傳 false（見該檔第 504-511 行的實作與其上方註解，明確說明
 *     「非相對（bare / baseUrl / alias）需 ImportResolver 的專案設定
 *     （path aliases、baseUrl），language-service 錨定層無此上下文，保守
 *     回傳 false 不錨定」）；同時 rename 命令（src/interfaces/cli/commands/
 *     rename.command.ts）完全未讀取 tsconfig（對照 move.command.ts、
 *     impact.command.ts、change-signature-engine.ts 等其他命令都有讀取
 *     tsconfig 路徑設定），RenameEngine 沒有管道把 tsconfig paths 傳給
 *     負責錨定引用的 language-service。
 *
 *     tsconfig 在 memfs 下的讀取實驗結論：tsconfig-loader.ts 透過注入的
 *     IFileSystem（非直接 real fs）讀取 tsconfig.json，impact 命令已有
 *     等價 E2E（tests/e2e/commands/typescript/cli-impact-tsconfig-lookup
 *     .e2e.test.ts）證實 memfs 下 tsconfig.json 能被正確讀到、解析
 *     path alias；故本缺陷純屬 rename 流程未接上 tsconfig 管道，與
 *     memfs 是否讀得到 tsconfig 無關，可直接走 memfs E2E 重現，不需要
 *     mkdtemp 真實檔案系統。
 *
 * C4：兩層 barrel re-export 鏈（`user.ts` -> `barrel2.ts` -> `barrel1.ts`
 *     -> `deep.ts`）只更新最靠近定義的一層。rename 後 deep.ts（定義）與
 *     barrel1.ts（第一層 re-export）正確改名，但 barrel2.ts（第二層
 *     re-export）與 user.ts（最終 consumer）完全不動，形成斷鏈：
 *     barrel2.ts 仍 re-export 一個已不存在的舊符號名稱，user.ts 仍 import
 *     並呼叫該不存在的舊名稱。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 regression（C3：tsconfig path alias consumer 未更新）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('rename 透過 tsconfig path alias 匯入的符號時，alias import 的 consumer 應同步更新', async () => {
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        baseUrl: '.',
        paths: {
          '@app/*': ['src/*']
        }
      }
    }));

    await fixture.writeFile('src/target.ts', [
      'export function fetchData(): string {',
      '  return \'data\';',
      '}'
    ].join('\n') + '\n');

    await fixture.writeFile('src/use.ts', [
      'import { fetchData as fd } from \'@app/target\';',
      '',
      'export function run(): string {',
      '  return fd();',
      '}'
    ].join('\n') + '\n');

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'fetchData', '--to', 'loadData',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：定義端本身應正確重新命名
    const targetAfter = await fixture.readFile('src/target.ts');
    expect(targetAfter).toContain('export function loadData');
    expect(targetAfter).not.toContain('fetchData');

    // Bug：alias import 的 specifier 應同步改成新名稱、別名 `fd` 維持不變；
    // 呼叫端 `fd()` 維持不動。目前 use.ts 完全未被更新，遺留對已改名、
    // 不存在符號的 import。
    const useAfter = await fixture.readFile('src/use.ts');
    expect(useAfter).toContain('import { loadData as fd } from \'@app/target\';');
    expect(useAfter).toContain('return fd();');
    expect(useAfter).not.toContain('fetchData');
  });
});

describe('CLI rename 缺陷 regression（C4：兩層 barrel re-export 鏈只更新第一層）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('rename 定義符號時，兩層 barrel re-export 鏈與最終 consumer 都應被更新', async () => {
    await fixture.writeFile('src/deep.ts', [
      'export function fetchItem(): string {',
      '  return \'item\';',
      '}'
    ].join('\n') + '\n');

    await fixture.writeFile('src/barrel1.ts', 'export { fetchItem } from \'./deep.js\';\n');

    await fixture.writeFile('src/barrel2.ts', 'export { fetchItem } from \'./barrel1.js\';\n');

    await fixture.writeFile('src/user.ts', [
      'import { fetchItem } from \'./barrel2.js\';',
      '',
      'export function run(): string {',
      '  return fetchItem();',
      '}'
    ].join('\n') + '\n');

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'fetchItem', '--to', 'loadItem',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    // 正向：定義端與第一層 re-export 應正確改名（此部分已修好）
    const deepAfter = await fixture.readFile('src/deep.ts');
    expect(deepAfter).toContain('export function loadItem');
    expect(deepAfter).not.toContain('fetchItem');

    const barrel1After = await fixture.readFile('src/barrel1.ts');
    expect(barrel1After).toContain('export { loadItem } from \'./deep.js\';');
    expect(barrel1After).not.toContain('fetchItem');

    // Bug：第二層 re-export 目前完全不動，遺留對已改名、不存在符號的
    // re-export specifier。
    const barrel2After = await fixture.readFile('src/barrel2.ts');
    expect(barrel2After).toContain('export { loadItem } from \'./barrel1.js\';');
    expect(barrel2After).not.toContain('fetchItem');

    // Bug：最終 consumer 目前完全不動，import 與呼叫點都遺留舊名稱。
    const userAfter = await fixture.readFile('src/user.ts');
    expect(userAfter).toContain('import { loadItem } from \'./barrel2.js\';');
    expect(userAfter).toContain('return loadItem();');
    expect(userAfter).not.toContain('fetchItem');
  });
});
