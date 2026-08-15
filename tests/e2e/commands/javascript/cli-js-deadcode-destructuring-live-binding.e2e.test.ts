/**
 * [audit-fix] F6-1：CLI deadcode 缺陷 E2E 測試（JS 專案，reproduction，先紅後綠）
 *
 * src/plugins/javascript/declaration-analyzer.ts:116-134 的 VariableDeclaration
 * visitor 只認 `babel.isIdentifier(decl.id)`，解構綁定（`const { dead, live } = obj`）
 * 的 decl.id 是 ObjectPattern，match 不到，getFullDeclarationRange 回傳 null，
 * 呼叫端 fallback 到整行字串匹配刪除 —— 把整條 `const { dead, live } = obj;`
 * 連同仍在使用的 live 綁定一起刪掉，毀掉 `console.log(live)` 這行活碼的來源。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('[audit-fix] CLI deadcode 解構綁定 regression（F6-1，JS 專案）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('解構綁定中未使用的成員被刪除時，仍在使用的成員與其消費行不應被一併刪除', async () => {
    await fixture.writeFile('src/f6-1-destructure.js', [
      'const obj = { dead: 1, live: 2 };',
      'const { dead, live } = obj;',
      'console.log(live);',
      ''
    ].join('\n'));

    const result = await executeCLI(
      ['deadcode', '--path', fixture.rootPath, '--apply', '--format', 'json'],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const content = await fixture.readFile('src/f6-1-destructure.js');

    // 硬斷言：live 的解構綁定宣告本身應仍存在 —— 現行整條解構宣告被
    // fallback 整行刪除，`const { dead, live } = obj;` 這行會消失，
    // 只留下 `console.log(live);`（single toContain('live') 不足以當紅因，
    // 因為 console.log(live) 本身在刪除後仍原樣殘留，會誤判成綠）
    expect(content).toContain('{ dead, live } = obj;');
    expect(content).toContain('console.log(live);');

    // 次要斷言：dead 綁定理想上應被移除；若修法選擇保守跳過整組解構（不誤刪即合格），
    // 這條可能不成立，不作為本測試的硬性回歸判準。
    // expect(content).not.toContain('dead');
  });
});
