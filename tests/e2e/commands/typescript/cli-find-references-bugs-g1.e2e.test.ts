/**
 * CLI find-references 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * G1：findScopedReferences 的 className 過濾邏輯
 *     （src/plugins/typescript/reference-finder.ts:87-95）在 method 呼叫點
 *     的 receiver 型別推不出來時（例如 factory function 回傳的實例，沒有
 *     顯式型別標註可供語法層推斷），會把該呼叫誤判成「跨類別同名符號」而
 *     過濾丟棄，導致漏報真實引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI find-references 缺陷 regression（G1）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('G1：factory 回傳實例的 dog.bark() 呼叫點應被找到（不應被 className 過濾丟棄）', async () => {
    await fixture.writeFile('src/g1-dog.ts', [
      'export class G1Dog {',
      '  bark(): string { return \'woof\'; }',
      '}',
      'export function createG1Dog(): G1Dog {',
      '  return new G1Dog();',
      '}'
    ].join('\n') + '\n');
    await fixture.writeFile('src/g1-main.ts', [
      'import { createG1Dog } from \'./g1-dog.js\';',
      'export function g1Run(): string {',
      '  const dog = createG1Dog();',
      '  return dog.bark();',
      '}'
    ].join('\n') + '\n');

    const result = await executeCLI(
      [
        'find-references',
        'bark',
        '--path',
        fixture.rootPath,
        '--at',
        'src/g1-dog.ts:2:3',
        '--format',
        'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const mainReferences = output.references.filter((r: any) => r.file.endsWith('g1-main.ts'));

    // Bug：dog 的型別靠 createG1Dog() 回傳值語法推不出來（無顯式型別標註），
    // dog.bark() 呼叫點的 receiverType 解析不出 'G1Dog'，被 className 過濾器
    // 誤判成無關符號丟棄 —— 目前 mainReferences 會是空陣列
    expect(mainReferences.some((r: any) => r.line === 4)).toBe(true);
    expect(output.summary.totalReferences).toBeGreaterThanOrEqual(2);
  });
});
