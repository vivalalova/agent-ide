/**
 * audit-fix CH4 regression（先紅後綠）
 *
 * outgoing depth>1 的 default import 展開（`findCalleeDefinition`）在解析到 import 是
 * default import 時，直接對 import 目標檔呼叫 `findDefaultExportFunctionDefinition`，
 * 沒有跟隨 barrel re-export 鏈。當 default import 指向的是純轉發 barrel：
 *
 *   impl.ts:  function helper() {...}; export default function run() { return helper(); }
 *   index.ts: export { default } from './impl.js';
 *   caller.ts: import run from './index.js'; run();
 *
 * `findTypeScriptDefaultExportFunctionDefinition` 對 index.ts 找不到本地 default 宣告
 * （index.ts 本身沒有 `export default`，只有 `export { default } from`），depth 展開在
 * barrel 處斷掉，helper 消失。
 *
 * 修法：default import 一併走 `resolveReexportChainTargets`（name='default'）追到真正
 * 定義檔，再對葉節點呼叫 `findDefaultExportFunctionDefinition`。
 *
 * CH4 二次複審（先紅後綠）：
 *
 * 上述修法引入的 `resolveReexportChainTargets` 鏈路查詢，其 `matchingForwards` 篩選條件
 * `forward.exportedName === undefined || forward.exportedName === name` 把 bare
 * `export * from '<spec>'`（`exportedName` 省略）當成「轉發任何 name」，包含 'default'。
 * 但 ES 規格明定 `export *` 從不轉發 default export（只轉發具名匯出），bare star 對
 * `name === 'default'` 一律不該命中。
 *
 * 觸發情境：barrel 同時有 `export * from './helpers.js'`（helpers.ts 恰有自己的
 * default）與 `export { default } from './main.js'`（真正該轉發的 default 來源）—— bare
 * star 先出現在陣列中，錯誤命中 'default' 並搶先解析到 helpers.ts，導致 outgoing 展開到
 * 錯誤的 helper、main.ts 的 default 本體完全不出現。
 *
 * 修法：抽出具名判斷函式 `forwardReexportsName`（`@core/foundations/reexport-forwards.ts`，
 * 供 call-hierarchy 與其他 barrel 鏈路消費端共用），bare star 對 'default' 明確排除，
 * 其餘 name 維持「exportedName 省略代表轉發全部具名匯出」語意。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix CH4：default re-export barrel 阻斷 depth>1 outgoing 展開', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('經 export { default } from barrel 匯入的 default import，depth=2 應能穿透找到下游 helper', async () => {
    await fixture.writeFile('src/ch4-impl.ts', `
function ch4Helper() {
  return 1;
}

export default function ch4Run() {
  return ch4Helper();
}
    `.trim());
    await fixture.writeFile(
      'src/ch4-index.ts',
      'export { default } from \'./ch4-impl.js\';\n'
    );
    await fixture.writeFile('src/ch4-caller.ts', `
import ch4Run from './ch4-index.js';

export function ch4CallerFn() {
  return ch4Run();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch4CallerFn', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch4Run');
    // Bug：barrel 處展開斷鏈，ch4Helper 應出現但目前消失
    expect(callees).toContain('ch4Helper');
  });

  it('對照組：直接 default import（無 barrel）depth=2 仍應正確展開', async () => {
    await fixture.writeFile('src/ch4b-impl.ts', `
function ch4bHelper() {
  return 1;
}

export default function ch4bRun() {
  return ch4bHelper();
}
    `.trim());
    await fixture.writeFile('src/ch4b-caller.ts', `
import ch4bRun from './ch4b-impl.js';

export function ch4bCallerFn() {
  return ch4bRun();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch4bCallerFn', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch4bRun');
    expect(callees).toContain('ch4bHelper');
  });

  it('barrel 混用 export * 與 export { default } from 時，default import 不應誤解析到 export * 來源檔', async () => {
    await fixture.writeFile('src/ch4c-helpers.ts', `
function ch4cHelperInternal() {
  return 'helper-internal';
}

export default function ch4cHelper() {
  return ch4cHelperInternal();
}

export function ch4cUtil() {
  return 1;
}
    `.trim());
    await fixture.writeFile('src/ch4c-main.ts', `
function ch4cRunInternal() {
  return 'run-internal';
}

export default function ch4cRun() {
  return ch4cRunInternal();
}
    `.trim());
    // bare export * 先於具名 export { default } from：舊 filter 對 'default' 會誤命中
    // bare star，搶先解析到 ch4c-helpers.ts。
    await fixture.writeFile('src/ch4c-barrel.ts', [
      'export * from \'./ch4c-helpers.js\';',
      'export { default } from \'./ch4c-main.js\';'
    ].join('\n'));
    await fixture.writeFile('src/ch4c-caller.ts', `
import ch4cRun from './ch4c-barrel.js';

export function ch4cCallerFn() {
  return ch4cRun();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch4cCallerFn', '--path', fixture.rootPath, '--direction', 'outgoing', '--depth', '2', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callees = output.outgoing.map((c: { callee: string }) => c.callee);
    expect(callees).toContain('ch4cRun');
    // Bug：bare export * 誤判轉發 default，展開到 ch4c-helpers.ts 的 default 而非
    // ch4c-main.ts 真正被 `export { default } from` 轉發的 default
    expect(callees).toContain('ch4cRunInternal');
    expect(callees).not.toContain('ch4cHelperInternal');
  });

  it('對照組：同一混用 barrel 中，非 default 的具名匯出仍應透過 bare export * 正確解析', async () => {
    await fixture.writeFile('src/ch4d-helpers.ts', `
export default function ch4dHelper() {
  return 1;
}

export function ch4dUtil() {
  return 'util-value';
}
    `.trim());
    await fixture.writeFile('src/ch4d-main.ts', `
export default function ch4dRun() {
  return 1;
}
    `.trim());
    await fixture.writeFile('src/ch4d-barrel.ts', [
      'export * from \'./ch4d-helpers.js\';',
      'export { default } from \'./ch4d-main.js\';'
    ].join('\n'));
    await fixture.writeFile('src/ch4d-caller.ts', `
import { ch4dUtil } from './ch4d-barrel.js';

export function ch4dCallerFn() {
  return ch4dUtil();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch4dUtil', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callers = output.incoming.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('ch4dCallerFn');
  });
});
