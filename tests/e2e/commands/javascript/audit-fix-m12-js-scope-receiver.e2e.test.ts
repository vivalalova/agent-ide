/**
 * audit-fix M12 regression（先紅後綠）
 *
 * JS 不同 scope 同名變數作 receiver：外層 dog 是 Dog 實例、內層 dog 是無關物件時，
 * find-references --at 鎖 Dog.bark 只能抓外層 dog.bark()，不得把內層同名 receiver 當引用。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('audit-fix M12：JS 不同 scope 同名 receiver', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('M12：內層同名變數的 .bark() 不應算作外層 Dog 方法引用', async () => {
    await fixture.writeFile(
      'src/m12-dog.js',
      [
        'export class M12Dog {',
        '  bark() { return \'woof\'; }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/m12-use.js',
      [
        'import { M12Dog } from \'./m12-dog.js\';',
        '',
        'export function m12Outer() {',
        '  const dog = new M12Dog();',
        '  const outer = dog.bark();',
        '  function inner() {',
        '    const dog = { bark: () => \'not-dog\' };',
        '    return dog.bark();',
        '  }',
        '  return outer + inner();',
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
        'src/m12-dog.js:2:3',
        '--format',
        'json',
        '--no-cache'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output: any = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const useRefs = (output.references as any[]).filter((r) => r.file.endsWith('m12-use.js'));

    // 外層 dog.bark()（約 L5）必須保留
    expect(useRefs.some((r) => r.line === 5)).toBe(true);

    // 內層 shadow dog.bark()（約 L8）不得當成 M12Dog.bark 引用
    // Bug：JS 未做 scope 感知 receiver 綁定，內層同名會誤報或外層漏報
    expect(useRefs.some((r) => r.line === 8)).toBe(false);
  });
});
