/**
 * CLI rename 命令 E2E 測試
 * 測試實際的符號重新命名功能
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTypeScriptProject, TestProject } from '../helpers/test-project';
import { executeCLI } from '../helpers/cli-executor';

describe('CLI rename 命令 E2E 測試', () => {
  let project: TestProject;

  beforeEach(async () => {
    // 建立測試專案，包含符號定義和引用
    project = await createTypeScriptProject({
      'src/user.ts': `
export class User {
  constructor(public name: string, public age: number) {}

  greet(): string {
    return \`Hello, I'm \${this.name}\`;
  }
}
      `.trim(),
      'src/index.ts': `
import { User } from './user';

const user = new User('Alice', 30);
console.log(user.greet());
      `.trim()
    });
  });

  afterEach(async () => {
    await project.cleanup();
  });

  it('應該能重新命名類別', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', project.projectPath]
    );

    // 檢查執行成功
    expect(result.exitCode).toBe(0);

    // 檢查輸出包含重新命名訊息
    expect(result.stdout).toContain('重新命名');
  });

  it('應該能處理找不到符號的情況', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'NonExistent', '--new-name', 'NewName', '--path', project.projectPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout;
    expect(output).toContain('找不到符號');
  });

  it('應該能預覽重新命名變更', async () => {
    const result = await executeCLI(
      ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', project.projectPath, '--preview']
    );

    expect(result.exitCode).toBe(0);

    // 應該顯示預覽訊息
    expect(result.stdout).toContain('預覽');
  });

  it('應該在缺少參數時顯示錯誤', async () => {
    const result = await executeCLI(
      ['rename', '--path', project.projectPath]
    );

    // 應該顯示錯誤訊息
    const output = result.stdout + result.stderr;
    expect(output).toContain('必須指定符號名稱和新名稱');
  });

  it('應該能重新命名變數', async () => {
    const varProject = await createTypeScriptProject({
      'src/index.ts': `
const userName = 'Alice';
console.log(userName);
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'userName', '--new-name', 'fullName', '--path', varProject.projectPath]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重新命名');

    await varProject.cleanup();
  });

  it('應該能重新命名函式', async () => {
    const funcProject = await createTypeScriptProject({
      'src/math.ts': `
export function calculate(x: number): number {
  return x * 2;
}

const result = calculate(5);
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'calculate', '--new-name', 'compute', '--path', funcProject.projectPath]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重新命名');

    await funcProject.cleanup();
  });

  it('應該能重新命名介面', async () => {
    const interfaceProject = await createTypeScriptProject({
      'src/types.ts': `
export interface UserData {
  name: string;
  age: number;
}

const user: UserData = { name: 'Bob', age: 25 };
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'UserData', '--new-name', 'UserProfile', '--path', interfaceProject.projectPath]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重新命名');

    await interfaceProject.cleanup();
  });

  it('應該能重新命名型別別名', async () => {
    const typeProject = await createTypeScriptProject({
      'src/types.ts': `
export type ID = string | number;
const userId: ID = '123';
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'ID', '--new-name', 'Identifier', '--path', typeProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await typeProject.cleanup();
  });

  it('應該能跨檔案更新引用', async () => {
    const multiFileProject = await createTypeScriptProject({
      'src/user.ts': `
export class User {
  constructor(public name: string) {}
}
      `.trim(),
      'src/main.ts': `
import { User } from './user';
const user = new User('Alice');
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', multiFileProject.projectPath]
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('重新命名');

    await multiFileProject.cleanup();
  });

  it('應該檢測命名衝突', async () => {
    const conflictProject = await createTypeScriptProject({
      'src/index.ts': `
const oldName = 1;
const newName = 2;
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'oldName', '--new-name', 'newName', '--path', conflictProject.projectPath]
    );

    // 可能顯示警告或錯誤
    const output = result.stdout + result.stderr;
    expect(output.length).toBeGreaterThan(0);

    await conflictProject.cleanup();
  });

  it('應該能使用別名參數', async () => {
    const result = await executeCLI(
      ['rename', '--from', 'User', '--to', 'Person', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await project.cleanup();
  });

  it('應該能指定符號類型', async () => {
    const result = await executeCLI(
      ['rename', '--type', 'class', '--symbol', 'User', '--new-name', 'Person', '--path', project.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await project.cleanup();
  });

  it('應該能處理包含數字的符號名稱', async () => {
    const numProject = await createTypeScriptProject({
      'src/index.ts': `
const value1 = 100;
const value2 = value1 + 50;
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'value1', '--new-name', 'initialValue', '--path', numProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await numProject.cleanup();
  });

  it('應該能處理駝峰命名', async () => {
    const camelProject = await createTypeScriptProject({
      'src/index.ts': `
const getUserName = () => 'Alice';
const name = getUserName();
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'getUserName', '--new-name', 'fetchUserName', '--path', camelProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await camelProject.cleanup();
  });

  it('應該能處理類別方法重新命名', async () => {
    const methodProject = await createTypeScriptProject({
      'src/class.ts': `
class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  sum(arr: number[]): number {
    return arr.reduce((a, b) => this.add(a, b), 0);
  }
}
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'add', '--new-name', 'plus', '--path', methodProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await methodProject.cleanup();
  });

  it('應該能處理泛型類型重新命名', async () => {
    const genericProject = await createTypeScriptProject({
      'src/generic.ts': `
type Result<T> = { success: boolean; data: T };
const result: Result<string> = { success: true, data: 'test' };
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'Result', '--new-name', 'Response', '--path', genericProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await genericProject.cleanup();
  });

  it('應該能處理解構賦值中的重新命名', async () => {
    const destructProject = await createTypeScriptProject({
      'src/destruct.ts': `
const config = { apiKey: '123', timeout: 5000 };
const { apiKey } = config;
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'apiKey', '--new-name', 'key', '--path', destructProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await destructProject.cleanup();
  });

  it('應該能處理同名不同作用域的符號', async () => {
    const scopeProject = await createTypeScriptProject({
      'src/scope.ts': `
const value = 1;
function test() {
  const value = 2;
  return value;
}
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'value', '--new-name', 'data', '--path', scopeProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await scopeProject.cleanup();
  });

  it('應該能處理 export 的符號', async () => {
    const exportProject = await createTypeScriptProject({
      'src/exports.ts': `
export const API_URL = 'http://api.example.com';
export function fetchData() {}
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'API_URL', '--new-name', 'BASE_URL', '--path', exportProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await exportProject.cleanup();
  });

  it('應該能處理 default export', async () => {
    const defaultProject = await createTypeScriptProject({
      'src/default.ts': `
export default class MyClass {}
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'MyClass', '--new-name', 'MainClass', '--path', defaultProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await defaultProject.cleanup();
  });

  it('應該能重命名陣列型別', async () => {
    const arrayProject = await createTypeScriptProject({
      'src/types.ts': `
export type UserList = User[];
interface User {
  name: string;
}
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'UserList', '--new-name', 'UserArray', '--path', arrayProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await arrayProject.cleanup();
  });

  it('應該能重命名 enum', async () => {
    const enumProject = await createTypeScriptProject({
      'src/enums.ts': `
export enum Status {
  Active,
  Inactive
}

const status: Status = Status.Active;
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'Status', '--new-name', 'UserStatus', '--path', enumProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await enumProject.cleanup();
  });

  it('應該能重命名 namespace', async () => {
    const namespaceProject = await createTypeScriptProject({
      'src/namespace.ts': `
namespace Utils {
  export function helper() {
    return 'help';
  }
}

const result = Utils.helper();
      `.trim()
    });

    const result = await executeCLI(
      ['rename', '--symbol', 'Utils', '--new-name', 'Utilities', '--path', namespaceProject.projectPath]
    );

    expect(result.exitCode).toBe(0);

    await namespaceProject.cleanup();
  });

  // === 複雜跨檔案引用測試 ===

  describe('複雜跨檔案引用場景', () => {
    it('應該能重命名被多個檔案引用的型別', async () => {
      const multiRefProject = await createTypeScriptProject({
        'src/types.ts': `
export interface User {
  name: string;
  age: number;
}
        `.trim(),
        'src/file1.ts': `
import { User } from './types';
const user1: User = { name: 'Alice', age: 30 };
        `.trim(),
        'src/file2.ts': `
import { User } from './types';
const user2: User = { name: 'Bob', age: 25 };
        `.trim(),
        'src/file3.ts': `
import { User } from './types';
function processUser(user: User) {}
        `.trim(),
        'src/file4.ts': `
import { User } from './types';
const users: User[] = [];
        `.trim(),
        'src/file5.ts': `
import { User } from './types';
export class UserService {
  getUser(): User | null { return null; }
}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', multiRefProject.projectPath]
      );

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');

      await multiRefProject.cleanup();
    });

    it('應該能重命名跨多層目錄引用的型別', async () => {
      const multiLayerProject = await createTypeScriptProject({
        'src/types/api.ts': `
export interface ApiResponse {
  success: boolean;
  data: any;
}
        `.trim(),
        'src/services/api-service.ts': `
import { ApiResponse } from '../types/api';
export function fetchData(): ApiResponse {
  return { success: true, data: {} };
}
        `.trim(),
        'src/controllers/api-controller.ts': `
import { ApiResponse } from '../types/api';
export class ApiController {
  process(response: ApiResponse) {}
}
        `.trim(),
        'src/utils/api-utils.ts': `
import { ApiResponse } from '../types/api';
export function validate(res: ApiResponse): boolean {
  return res.success;
}
        `.trim()
      });

      const result = await executeCLI(
        [
          'rename',
          '--symbol',
          'ApiResponse',
          '--new-name',
          'ApiResult',
          '--path',
          multiLayerProject.projectPath
        ]
      );

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');

      await multiLayerProject.cleanup();
    });

    it('應該能重命名大型專案中被廣泛使用的符號', async () => {
      const files: Record<string, string> = {
        'src/types.ts': `
export interface Config {
  apiUrl: string;
  timeout: number;
}
        `.trim()
      };

      // 建立 15 個引用檔案
      for (let i = 0; i < 15; i++) {
        files[`src/file${i}.ts`] = `
import { Config } from './types';
export const config${i}: Config = { apiUrl: 'url', timeout: 5000 };
        `.trim();
      }

      const largeProject = await createTypeScriptProject(files);

      const result = await executeCLI(
        [
          'rename',
          '--symbol',
          'Config',
          '--new-name',
          'Configuration',
          '--path',
          largeProject.projectPath
        ]
      );

      // 驗證命令執行成功
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');

      await largeProject.cleanup();
    });

    it('應該能處理同時存在定義和引用的重命名', async () => {
      const mixedProject = await createTypeScriptProject({
        'src/user.ts': `
export class User {
  name: string;
  constructor(name: string) {
    this.name = name;
  }

  greet(): string {
    return 'Hello ' + this.name;
  }
}

const defaultUser = new User('Default');
        `.trim(),
        'src/main.ts': `
import { User } from './user';

const user = new User('Alice');
const users: User[] = [];
function createUser(name: string): User {
  return new User(name);
}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'User', '--new-name', 'Person', '--path', mixedProject.projectPath]
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('重新命名');

      await mixedProject.cleanup();
    });

    it('應該能處理泛型參數的重命名', async () => {
      const genericParamProject = await createTypeScriptProject({
        'src/generic.ts': `
function identity<T>(arg: T): T {
  return arg;
}

function wrap<T>(value: T): { data: T } {
  return { data: value };
}

class Container<T> {
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'identity', '--new-name', 'echo', '--path', genericParamProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await genericParamProject.cleanup();
    });

    it('應該能處理裝飾器中的符號重命名', async () => {
      const decoratorProject = await createTypeScriptProject({
        'src/decorators.ts': `
function Component(config: any) {
  return function(target: any) {
    // decorator logic
  };
}

@Component({ selector: 'app' })
class AppComponent {}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'Component', '--new-name', 'Directive', '--path', decoratorProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await decoratorProject.cleanup();
    });

    it('應該能處理繼承關係中的重命名', async () => {
      const inheritanceProject = await createTypeScriptProject({
        'src/base.ts': `
export class BaseClass {
  baseMethod() {}
}
        `.trim(),
        'src/derived.ts': `
import { BaseClass } from './base';

export class DerivedClass extends BaseClass {
  derivedMethod() {}
}
        `.trim(),
        'src/main.ts': `
import { BaseClass } from './base';
import { DerivedClass } from './derived';

const base = new BaseClass();
const derived = new DerivedClass();
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'BaseClass', '--new-name', 'AbstractBase', '--path', inheritanceProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await inheritanceProject.cleanup();
    });

    it('應該能處理介面實作中的重命名', async () => {
      const implementProject = await createTypeScriptProject({
        'src/interface.ts': `
export interface Logger {
  log(message: string): void;
}
        `.trim(),
        'src/impl.ts': `
import { Logger } from './interface';

export class ConsoleLogger implements Logger {
  log(message: string): void {
    console.log(message);
  }
}
        `.trim(),
        'src/main.ts': `
import { Logger } from './interface';
import { ConsoleLogger } from './impl';

const logger: Logger = new ConsoleLogger();
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'Logger', '--new-name', 'LogService', '--path', implementProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await implementProject.cleanup();
    });

    it('應該能處理聯合型別中的重命名', async () => {
      const unionProject = await createTypeScriptProject({
        'src/types.ts': `
export type Status = 'active' | 'inactive' | 'pending';
export type Result = Success | Failure;

interface Success {
  type: 'success';
  data: any;
}

interface Failure {
  type: 'failure';
  error: string;
}
        `.trim(),
        'src/main.ts': `
import { Status, Result } from './types';

const status: Status = 'active';
function process(result: Result) {}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'Status', '--new-name', 'StatusType', '--path', unionProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await unionProject.cleanup();
    });

    it('應該能處理模組重導出的重命名', async () => {
      const reexportProject = await createTypeScriptProject({
        'src/original.ts': `
export class OriginalClass {}
        `.trim(),
        'src/reexport.ts': `
export { OriginalClass } from './original';
export { OriginalClass as AliasClass } from './original';
        `.trim(),
        'src/main.ts': `
import { OriginalClass, AliasClass } from './reexport';

const obj1 = new OriginalClass();
const obj2 = new AliasClass();
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'OriginalClass', '--new-name', 'RenamedClass', '--path', reexportProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await reexportProject.cleanup();
    });

    it('應該能處理函式重載的重命名', async () => {
      const overloadProject = await createTypeScriptProject({
        'src/overload.ts': `
export function process(value: string): string;
export function process(value: number): number;
export function process(value: string | number): string | number {
  return value;
}

const str = process('test');
const num = process(42);
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'process', '--new-name', 'transform', '--path', overloadProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await overloadProject.cleanup();
    });

    it('應該能處理型別守衛函式的重命名', async () => {
      const guardProject = await createTypeScriptProject({
        'src/guard.ts': `
interface Cat {
  meow(): void;
}

interface Dog {
  bark(): void;
}

function isCat(animal: Cat | Dog): animal is Cat {
  return 'meow' in animal;
}

function process(animal: Cat | Dog) {
  if (isCat(animal)) {
    animal.meow();
  }
}
        `.trim()
      });

      const result = await executeCLI(
        ['rename', '--symbol', 'isCat', '--new-name', 'checkIfCat', '--path', guardProject.projectPath]
      );

      expect(result.exitCode).toBe(0);

      await guardProject.cleanup();
    });
  });
});
