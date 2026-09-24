/**
 * [R1] TS rename 繼承方法須更新子類跨檔 this 呼叫
 *
 * sample-project 的 BaseController.handleError（protected method）被
 * product/user/order-controller.ts 以 `this.handleError(...)` 跨檔呼叫。
 * rename BaseController 上的 handleError 必須同步更新這些子類檔案內的呼叫點。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadFixture, executeCLI, type FixtureContext } from '../../../helpers/index.js';

describe('[R1] CLI rename - 繼承方法跨檔 this 呼叫同步改名', () => {
  let fixture: FixtureContext;

  beforeEach(async () => {
    fixture = await loadFixture('sample-project');
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('BaseController.handleError 改名後，三個子類 controller 檔內的 this.handleError 呼叫須同步改名', async () => {
    // base-controller.ts:31:13 是 `protected handleError(...)` 宣告處
    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'handleError', '--to', 'handleFailure',
        '--at', 'src/controllers/base-controller.ts:31:13',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const productContent = await fixture.readFile('src/controllers/product-controller.ts');
    const userContent = await fixture.readFile('src/controllers/user-controller.ts');
    const orderContent = await fixture.readFile('src/controllers/order-controller.ts');

    for (const content of [productContent, userContent, orderContent]) {
      expect(content).not.toContain('handleError');
      expect(content).toContain('handleFailure');
    }
  });

  it('最小形狀：Base.log 改名後，跨檔 Sub 子類的 this.log() 呼叫須同步改名為 this.trace()', async () => {
    await fixture.writeFile(
      'src/inheritance-r1/base.ts',
      [
        'export class Base {',
        '  protected log() {',
        '    return 1;',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/inheritance-r1/sub.ts',
      [
        'import { Base } from \'./base\';',
        'export class Sub extends Base {',
        '  run() {',
        '    return this.log();',
        '  }',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/inheritance-r1/use.ts',
      [
        'import { Sub } from \'./sub\';',
        'new Sub().run();',
        ''
      ].join('\n')
    );

    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'log', '--to', 'trace',
        '--at', 'src/inheritance-r1/base.ts:2:13',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const subContent = await fixture.readFile('src/inheritance-r1/sub.ts');
    expect(subContent).toContain('this.trace()');
    expect(subContent).not.toContain('this.log()');
  });

  it('[R1-alias] tsconfig path alias（@lib/*）匯入的父類方法改名，須同步更新 this/super 呼叫與跨檔使用點', async () => {
    // 覆寫成最小 tsconfig：baseUrl '.' + '@lib/*' -> 'src/lib/*'
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@lib/*': ['src/lib/*']
        }
      }
    }, null, 2));

    await fixture.writeFile(
      'src/lib/base.ts',
      'export class Base { log(){ return 1; } }\n'
    );
    await fixture.writeFile(
      'src/lib/sub.ts',
      'import { Base } from \'@lib/base\'; export class Sub extends Base { run(){ return this.log() + super.log(); } }\n'
    );
    await fixture.writeFile(
      'src/use.ts',
      'import { Sub } from \'@lib/sub\'; new Sub().log();\n'
    );

    // base.ts:1:21 是 `log(){ ... }` 宣告處（'export class Base { ' 共 20 字元）
    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'log', '--to', 'trace',
        '--at', 'src/lib/base.ts:1:21',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const subContent = await fixture.readFile('src/lib/sub.ts');
    expect(subContent).toContain('this.trace()');
    expect(subContent).toContain('super.trace()');
    expect(subContent).not.toContain('.log()');

    const useContent = await fixture.readFile('src/use.ts');
    expect(useContent).toContain('new Sub().trace();');
    expect(useContent).not.toContain('.log()');
  });

  it('[R1-alias] tsconfig path alias（@lib/*）匯入的 interface 屬性改名，須同步更新跨檔使用點', async () => {
    await fixture.writeFile('tsconfig.json', JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@lib/*': ['src/lib/*']
        }
      }
    }, null, 2));

    await fixture.writeFile(
      'src/lib/user.ts',
      [
        'export interface User {',
        '  email: string;',
        '}',
        ''
      ].join('\n')
    );
    await fixture.writeFile(
      'src/use-user.ts',
      [
        'import { User } from \'@lib/user\';',
        '',
        'export function getEmail(u: User): string {',
        '  return u.email;',
        '}',
        ''
      ].join('\n')
    );

    // user.ts:2:3 是 `email: string;` 宣告處
    const result = await executeCLI(
      [
        'rename', '--path', fixture.rootPath,
        '--from', 'email', '--to', 'emailAddress',
        '--at', 'src/lib/user.ts:2:3',
        '--format', 'json'
      ],
      { memfs: fixture.memfs }
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).success).toBe(true);

    const userContent = await fixture.readFile('src/lib/user.ts');
    expect(userContent).toContain('emailAddress: string;');

    const useContent = await fixture.readFile('src/use-user.ts');
    expect(useContent).toContain('u.emailAddress');
    expect(useContent).not.toContain('u.email;');
  });
});
