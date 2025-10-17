/* eslint-disable no-undef */
/**
 * 型別安全問題測試檔案
 * 用於測試 TypeSafetyChecker 的檢測能力
 */

// 測試項目 1：any 型別使用（應檢測到 5 個）
const foo: any = 123;
const bar: any = 'hello';
function processData(data: any): any {
  return data;
}
const config: any = { timeout: 5000 };

// 測試項目 2：@ts-ignore 註解（應檢測到 3 個）
// @ts-ignore
const undefinedVar = undefined;

// @ts-ignore
function brokenFunction() {
  return null.toString();
}

// @ts-ignore
const incorrectType: string = 123;

// 測試項目 3：as any 斷言（應檢測到 4 個）
const value1 = null as any;
const value2 = (undefined as any).property;
const result = ({ foo: 'bar' } as any).nonExistentMethod();
const casted = <any>{ x: 1, y: 2 };

// 測試項目 4：混合使用
interface User {
  id: number;
  name: string;
  metadata: any; // any 型別
}

function getUserData(id: any): any { // 參數和回傳都是 any
  // @ts-ignore
  return fetchUser(id);
}

// 正常的程式碼（不應被檢測為問題）
const normalVar: number = 42;
const normalString: string = 'test';
function normalFunction(x: number): number {
  return x * 2;
}

export { foo, bar, processData, config, User, getUserData };
