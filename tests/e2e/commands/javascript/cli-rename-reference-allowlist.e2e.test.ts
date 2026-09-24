/**
 * CLI rename E2E 測試：JS reference allowlist 涵蓋面
 *
 * A 組：已修復形狀，驗收綠燈（跨檔 class 繼承 this/super、instance／static
 * property、同檔物件字面量 this 存取、require().x 直接存取、
 * `export { X as default }` + `import { default as B }` 的 static 成員）。
 *
 * B 組：跨檔 receiver 解析（跨檔 import 子類實例呼叫父類方法、具名 import
 * 的物件字面量成員存取、二段式轉發 import 後單獨 export 的第三檔 import）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename allowlist 涵蓋面：A 組（應綠）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[AL] class method 跨檔子類 this.m／super.m 同步改名', async () => {
    await fixture.writeFile(
      'src/base-al1.js',
      [
        'export class Base {',
        '  m() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/sub-al1.js',
      [
        'import { Base } from \'./base-al1.js\';',
        'export class Sub extends Base {',
        '  run() {',
        '    return this.m() + super.m();',
        '  }',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'm', '--to', 'mm',
        '--at', 'src/base-al1.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const subContent = await fixture.readFile('src/sub-al1.js');
    expect(subContent).toContain('this.mm()');
    expect(subContent).toContain('super.mm()');
  });

  it('[AL] class instance property 定義及使用點同步改名、無關物件不動', async () => {
    await fixture.writeFile(
      'src/c-al2.js',
      [
        'export class C {',
        '  count = 0;',
        '  static total = 0;',
        '  inc() {',
        '    this.count++;',
        '    C.total++;',
        '  }',
        '}',
        'const c = new C();',
        'console.log(c.count);',
        'const other = { count: 1 };',
        'console.log(other.count);',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'count', '--to', 'cnt',
        '--at', 'src/c-al2.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const content = await fixture.readFile('src/c-al2.js');
    expect(content).toContain('cnt = 0;');
    expect(content).toContain('this.cnt++;');
    expect(content).toContain('console.log(c.cnt);');

    // 無關物件字面量的同名屬性不可被誤改
    expect(content).toContain('const other = { count: 1 };');
    expect(content).toContain('console.log(other.count);');
  });

  it('[AL] class static property 定義及使用點同步改名、無關物件不動', async () => {
    await fixture.writeFile(
      'src/c-al2b.js',
      [
        'export class C {',
        '  count = 0;',
        '  static total = 0;',
        '  inc() {',
        '    this.count++;',
        '    C.total++;',
        '  }',
        '}',
        'const c = new C();',
        'console.log(c.count);',
        'const other = { count: 1 };',
        'console.log(other.count);',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'total', '--to', 'tot',
        '--at', 'src/c-al2b.js:3',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const content = await fixture.readFile('src/c-al2b.js');
    expect(content).toContain('static tot = 0;');
    expect(content).toContain('C.tot++;');
  });

  it('[AL] 物件字面量屬性同檔 owner 與 this 改名、無關物件不動', async () => {
    await fixture.writeFile(
      'src/d-al3.js',
      [
        'const api = {',
        '  base: 1,',
        '  get() {',
        '    return this.base;',
        '  }',
        '};',
        'console.log(api.base);',
        'const x = { base: 2 };',
        'console.log(x.base);',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'base', '--to', 'renamedBase',
        '--at', 'src/d-al3.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const content = await fixture.readFile('src/d-al3.js');
    expect(content).toContain('renamedBase: 1,');
    expect(content).toContain('return this.renamedBase;');
    expect(content).toContain('console.log(api.renamedBase);');

    // 無關物件字面量的同名屬性不可被誤改
    expect(content).toContain('const x = { base: 2 };');
    expect(content).toContain('console.log(x.base);');
  });

  it('[AL] require().x 直接存取同步改名', async () => {
    await fixture.writeFile(
      'src/lib-al4.js',
      [
        'function helper() {',
        '  return 1;',
        '}',
        'module.exports = { helper };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-al4.js',
      [
        'console.log(require(\'./lib-al4.js\').helper());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'renamedHelper',
        '--at', 'src/lib-al4.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useContent = await fixture.readFile('src/use-al4.js');
    expect(useContent).toContain('require(\'./lib-al4.js\').renamedHelper()');
  });

  it('[AL] export { X as default } 搭配 import { default as B } 的 static 成員改名', async () => {
    await fixture.writeFile(
      'src/mod-al5.js',
      [
        'class X {',
        '  static m() {',
        '    return 1;',
        '  }',
        '}',
        'export { X as default };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-al5.js',
      [
        'import { default as B } from \'./mod-al5.js\';',
        'console.log(B.m());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'm', '--to', 'mm',
        '--at', 'src/mod-al5.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useContent = await fixture.readFile('src/use-al5.js');
    expect(useContent).toContain('B.mm()');
  });
});

describe('CLI rename allowlist 涵蓋面：B 組（跨檔 receiver 解析）', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[AL-reg] 跨檔 import 子類的實例呼叫父類方法須改名', async () => {
    await fixture.writeFile(
      'src/base-al6.js',
      [
        'export class Base {',
        '  m() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/sub-al6.js',
      [
        'import { Base } from \'./base-al6.js\';',
        'export class Sub extends Base {}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-al6.js',
      [
        'import { Sub } from \'./sub-al6.js\';',
        'new Sub().m();',
        'const s = new Sub();',
        's.m();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'm', '--to', 'mm',
        '--at', 'src/base-al6.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useContent = await fixture.readFile('src/use-al6.js');
    expect(useContent).toContain('new Sub().mm();');
    expect(useContent).toContain('s.mm();');
  });

  it('[AL-reg] 具名 import 的物件字面量成員存取須改名', async () => {
    await fixture.writeFile(
      'src/api-al7.js',
      [
        'export const api = {',
        '  base: 1',
        '};',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-al7.js',
      [
        'import { api } from \'./api-al7.js\';',
        'console.log(api.base);',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'base', '--to', 'renamedBase',
        '--at', 'src/api-al7.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useContent = await fixture.readFile('src/use-al7.js');
    expect(useContent).toContain('console.log(api.renamedBase);');
  });

  it('[AL-reg] 無 import/export 的 script 檔內全域函式呼叫須改名（同檔；跨 .cjs 檔無 require 連結不構成本工具語意下的引用，故不另立跨檔案例）', async () => {
    await fixture.writeFile(
      'src/script-al8.cjs',
      [
        'function helper() {',
        '  return 1;',
        '}',
        'function main() {',
        '  return helper();',
        '}',
        'console.log(main());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'helper', '--to', 'renamedHelper',
        '--at', 'src/script-al8.cjs:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const content = await fixture.readFile('src/script-al8.cjs');
    expect(content).toContain('function renamedHelper()');
    expect(content).toContain('return renamedHelper();');
  });

  it('[AL-reexport2] 二段式轉發（import 後單獨 export）的第三檔 import 須同步改名', async () => {
    await fixture.writeFile(
      'src/a-al9.js',
      [
        'export function x() {',
        '  return 1;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/b-al9.js',
      [
        'import { x } from \'./a-al9.js\';',
        'export { x };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/c-al9.js',
      [
        'import { x } from \'./b-al9.js\';',
        'x();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'x', '--to', 'y',
        '--at', 'src/a-al9.js:1',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const bContent = await fixture.readFile('src/b-al9.js');
    const cContent = await fixture.readFile('src/c-al9.js');

    expect(bContent).toContain('import { y }');
    expect(bContent).toContain('export { y }');

    expect(cContent).toContain('import { y } from \'./b-al9.js\'');
    expect(cContent).toContain('y();');
  });

  it('[R2] 父類方法被子類 override 時，經子類實例的呼叫點不得誤改成父類新名', async () => {
    await fixture.writeFile(
      'src/animal-r2.js',
      [
        'export class Animal {',
        '  speak() {',
        '    return \'generic sound\';',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/dog-r2.js',
      [
        'import { Animal } from \'./animal-r2.js\';',
        'export class Dog extends Animal {',
        '  speak() {',
        '    return \'woof\';',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-dog-r2.js',
      [
        'import { Dog } from \'./dog-r2.js\';',
        'export function bark() {',
        '  return new Dog().speak();',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'speak', '--to', 'makeSound',
        '--at', 'src/animal-r2.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const animalContent = await fixture.readFile('src/animal-r2.js');
    const dogContent = await fixture.readFile('src/dog-r2.js');
    const useDogContent = await fixture.readFile('src/use-dog-r2.js');

    // Animal 自己的定義必須改名
    expect(animalContent).toContain('makeSound()');
    expect(animalContent).not.toContain('speak()');

    // Dog 有自己的 override，不屬於這次 rename 的符號，維持原樣
    expect(dogContent).toContain('speak()');
    expect(dogContent).not.toContain('makeSound()');

    // new Dog().speak() 執行時期解析到 Dog 自己的 override（非 Animal.speak），不得被改名
    expect(useDogContent).toContain('new Dog().speak();');
    expect(useDogContent).not.toContain('makeSound');
  });

  it('[R2] 對照：子類無 override 時，經子類實例的呼叫點須改到父類新名', async () => {
    await fixture.writeFile(
      'src/animal-r2b.js',
      [
        'export class Animal {',
        '  speak() {',
        '    return \'generic sound\';',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/dog-r2b.js',
      [
        'import { Animal } from \'./animal-r2b.js\';',
        'export class Dog extends Animal {}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-dog-r2b.js',
      [
        'import { Dog } from \'./dog-r2b.js\';',
        'export function bark() {',
        '  return new Dog().speak();',
        '}',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'speak', '--to', 'makeSound',
        '--at', 'src/animal-r2b.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useDogContent = await fixture.readFile('src/use-dog-r2b.js');
    expect(useDogContent).toContain('new Dog().makeSound();');
    expect(useDogContent).not.toContain('.speak()');
  });
});
