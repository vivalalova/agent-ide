/**
 * audit-fix CH3 regression（先紅後綠）
 *
 * incoming 的 barrel re-export 鏈跟隨（`isCallSiteAnchoredToDefinition`）在需要多跳追鏈
 * 時，把 `resolveReexportChainTargets` 的查詢名字用成了 `targetName`（我們正在找的定義本名），
 * 而非 `importedBinding.importedName`（barrel 對外曝露的名字）。當 barrel 具名轉發有改名
 * （alias）時兩者不同：
 *
 *   real.ts:   export function real() {...}
 *   barrel.ts: export { real as api } from './real.js';
 *   caller.ts: import { api as real } from './barrel.js'; real();
 *
 * barrel 轉發表是以曝露名（api）索引，用 targetName（real）查會查無配對，
 * 誤把合法 caller 判定為未錨定而排除。
 *
 * 修法：鏈路查詢一律用 importedBinding.importedName。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix CH3：barrel alias re-export 鏈用錯名字排除合法 caller', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('經改名 barrel（export { real as api } from）+ 反向別名 import 的 caller 不應消失', async () => {
    await fixture.writeFile('src/ch3-real.ts', `
export function ch3Real() {
  return 1;
}
    `.trim());
    await fixture.writeFile(
      'src/ch3-barrel.ts',
      'export { ch3Real as ch3Api } from \'./ch3-real.js\';\n'
    );
    await fixture.writeFile('src/ch3-caller.ts', `
import { ch3Api as ch3Real } from './ch3-barrel.js';

export function ch3CallerFn() {
  return ch3Real();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch3Real', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callers = output.incoming.map((c: { caller: string }) => c.caller);
    // Bug：鏈路查詢用錯名字（targetName 而非 importedName），合法 caller 被濾掉
    expect(callers).toContain('ch3CallerFn');
  });

  it('對照組：未改名的具名 barrel re-export 仍應正確找到 caller', async () => {
    await fixture.writeFile('src/ch3b-real.ts', `
export function ch3bReal() {
  return 1;
}
    `.trim());
    await fixture.writeFile(
      'src/ch3b-barrel.ts',
      'export { ch3bReal } from \'./ch3b-real.js\';\n'
    );
    await fixture.writeFile('src/ch3b-caller.ts', `
import { ch3bReal } from './ch3b-barrel.js';

export function ch3bCallerFn() {
  return ch3bReal();
}
    `.trim());

    const result = await executeCLI(
      ['call-hierarchy', 'ch3bReal', '--path', fixture.rootPath, '--direction', 'incoming', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    const callers = output.incoming.map((c: { caller: string }) => c.caller);
    expect(callers).toContain('ch3bCallerFn');
  });
});
