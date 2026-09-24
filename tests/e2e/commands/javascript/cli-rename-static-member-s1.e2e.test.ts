/**
 * CLI rename 缺陷 E2E 測試（reproduction，先紅後綠）
 *
 * S1：JS class static 成員 rename 漏改使用點
 *
 * JS 沒有型別資訊，static getter/setter 與一般 static method 的使用點
 * （`Box.count = 5`／`Box.count`／`Box.plainStatic()`）在缺乏 binding 解析時，
 * rename 可能只改到定義端而漏改跨檔的 static 存取使用點。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('CLI rename 缺陷 S1：JS static 成員使用點漏改', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('js-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('[S1] rename static getter/setter 名稱時，定義兩邊與跨檔使用點皆須一致改名', async () => {
    await fixture.writeFile(
      'src/box-s1.js',
      [
        'export class BoxS1 {',
        '  static get count() {',
        '    return BoxS1._c ?? 0;',
        '  }',
        '  static set count(v) {',
        '    BoxS1._c = v;',
        '  }',
        '  static plainStatic() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-box-s1.js',
      [
        'import { BoxS1 } from \'./box-s1.js\';',
        'BoxS1.count = 5;',
        'console.log(BoxS1.count);',
        'console.log(BoxS1.plainStatic());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'count', '--to', 'cnt',
        '--at', 'src/box-s1.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const boxContent = await fixture.readFile('src/box-s1.js');
    const useContent = await fixture.readFile('src/use-box-s1.js');

    // 定義兩邊皆須改名
    expect(boxContent).toContain('static get cnt()');
    expect(boxContent).toContain('static set cnt(v)');
    expect(boxContent).not.toContain('get count()');
    expect(boxContent).not.toContain('set count(v)');

    // 跨檔使用點（讀與寫）皆須一致改名
    expect(useContent).toContain('BoxS1.cnt = 5;');
    expect(useContent).toContain('console.log(BoxS1.cnt);');
    expect(useContent).not.toContain('.count');
  });

  it('[S1] rename 一般 static method 名稱時，定義與跨檔使用點皆須改名', async () => {
    await fixture.writeFile(
      'src/box-s1b.js',
      [
        'export class BoxS1B {',
        '  static get count() {',
        '    return BoxS1B._c ?? 0;',
        '  }',
        '  static set count(v) {',
        '    BoxS1B._c = v;',
        '  }',
        '  static plainStatic() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-box-s1b.js',
      [
        'import { BoxS1B } from \'./box-s1b.js\';',
        'BoxS1B.count = 5;',
        'console.log(BoxS1B.count);',
        'console.log(BoxS1B.plainStatic());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'plainStatic', '--to', 'ps',
        '--at', 'src/box-s1b.js:8',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output.success).toBe(true);

    const boxContent = await fixture.readFile('src/box-s1b.js');
    const useContent = await fixture.readFile('src/use-box-s1b.js');

    expect(boxContent).toContain('static ps()');
    expect(boxContent).not.toContain('plainStatic');

    expect(useContent).toContain('console.log(BoxS1B.ps());');
    expect(useContent).not.toContain('plainStatic');
  });

  it('[S1-default] rename static method 時，透過 default export 轉發同一個 class 的使用點必須一致改名', async () => {
    await fixture.writeFile(
      'src/boxd-s1.js',
      [
        'export class BoxD {',
        '  static plainStatic() {',
        '    return 1;',
        '  }',
        '}',
        'export default BoxD;',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/used-s1.js',
      [
        'import BoxD from \'./boxd-s1.js\';',
        'console.log(BoxD.plainStatic());',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'plainStatic', '--to', 'ps',
        '--at', 'src/boxd-s1.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const usedContent = await fixture.readFile('src/used-s1.js');
    expect(usedContent).toContain('BoxD.ps()');
    expect(usedContent).not.toContain('plainStatic');
  });

  it('[S1-default 反例] rename class 的 static method 時，不應誤改另一檔透過無關 default export 物件字面量存取的同名方法', async () => {
    await fixture.writeFile(
      'src/boxo-s1.js',
      [
        'export class BoxO {',
        '  static plainStatic() {',
        '    return 1;',
        '  }',
        '}',
        'export default { plainStatic: () => 2 };',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/useo-s1.js',
      [
        'import X from \'./boxo-s1.js\';',
        'X.plainStatic();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'plainStatic', '--to', 'ps',
        '--at', 'src/boxo-s1.js:2',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const useoContent = await fixture.readFile('src/useo-s1.js');

    // X 綁定的是無關的 default export 物件字面量，不可被誤改
    expect(useoContent).toContain('X.plainStatic();');
  });
});
