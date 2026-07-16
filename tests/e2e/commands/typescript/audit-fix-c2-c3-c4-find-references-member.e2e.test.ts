/**
 * audit-fix C2 / C3 / C4 regression（先紅後綠）
 *
 * C2：find-references --at 鎖 class 方法時，`function f(d: Dog){ d.bark() }`
 *     參數型別註記的 receiver 必須抓到 d.bark()。
 * C3：default import 作 receiver（`import Dog from './dog'; Dog.staticMethod()`
 *     或 default import binding 路徑）在 --at 下應保留。
 * C4：`super.method()` 在子類應視為父方法引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix C2/C3/C4：find-references --at 成員引用', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('C2：參數型別註記 Dog 的 d.bark() 必須被 --at 鎖定的 bark 找到', async () => {
    await fixture.writeFile(
      'src/c2-dog.ts',
      [
        'export class C2Dog {',
        '  bark(): string { return \'woof\'; }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/c2-use.ts',
      [
        'import { C2Dog } from \'./c2-dog.js\';',
        '',
        'export function c2Call(d: C2Dog): string {',
        '  return d.bark();',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'bark',
        '--path',
        fixture.rootPath,
        '--at',
        'src/c2-dog.ts:2:3',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const useRefs = (output.references as any[]).filter((r) => r.file.endsWith('c2-use.ts'));
    // Bug：參數 d: C2Dog 被 receiver 分類成 other，d.bark() 漏報
    expect(useRefs.some((r) => r.context?.includes('d.bark()') || r.line === 4)).toBe(true);
  });

  it('C3：default import 作 receiver 的 static 呼叫在 --at 下應保留', async () => {
    await fixture.writeFile(
      'src/c3-dog.ts',
      [
        'export default class C3Dog {',
        '  static createTag(): string { return \'c3\'; }',
        '  bark(): string { return \'woof\'; }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/c3-use.ts',
      [
        'import C3Pet from \'./c3-dog.js\';',
        '',
        'export const c3Tag = C3Pet.createTag();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'createTag',
        '--path',
        fixture.rootPath,
        '--at',
        'src/c3-dog.ts:2:10',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const useRefs = (output.references as any[]).filter((r) => r.file.endsWith('c3-use.ts'));
    // Bug：default import binding 未當 owner，C3Pet.createTag() 被過濾
    expect(
      useRefs.some(
        (r) => r.context?.includes('C3Pet.createTag()') || r.context?.includes('createTag')
      )
    ).toBe(true);
  });

  it('C4：子類 super.method() 應視為父方法引用', async () => {
    await fixture.writeFile(
      'src/c4-base.ts',
      [
        'export class C4Base {',
        '  greet(): string { return \'hi\'; }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/c4-child.ts',
      [
        'import { C4Base } from \'./c4-base.js\';',
        '',
        'export class C4Child extends C4Base {',
        '  greet(): string {',
        '    return super.greet() + \'!\';',
        '  }',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'find-references',
        'greet',
        '--path',
        fixture.rootPath,
        '--at',
        'src/c4-base.ts:2:3',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const childRefs = (output.references as any[]).filter((r) => r.file.endsWith('c4-child.ts'));
    // Bug：super.greet() 無 SuperKeyword 處理，被 classify 成 other 漏報
    expect(
      childRefs.some((r) => r.context?.includes('super.greet()') || (r.line === 5 && r.context?.includes('super')))
    ).toBe(true);
  });
});
