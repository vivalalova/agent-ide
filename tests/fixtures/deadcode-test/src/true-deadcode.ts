/**
 * 這個文件包含真正的 deadcode（未使用的符號）
 */

// ✅ DEADCODE: 未使用的函式
function unusedFunction() {
  return 'This function is never called';
}

// ✅ DEADCODE: 未使用的變數
const unusedVariable = 'This variable is never referenced';

// ✅ DEADCODE: 未使用的類別
class UnusedClass {
  private data: string;

  constructor(data: string) {
    this.data = data;
  }

  getData() {
    return this.data;
  }
}

// ✅ DEADCODE: 未使用的常數
const UNUSED_CONSTANT = 42;

// ✅ DEADCODE: 未使用的箭頭函式
const unusedArrowFunction = () => {
  return 'arrow function';
};

// ✅ DEADCODE: 未使用的 async 函式
async function unusedAsyncFunction() {
  return Promise.resolve('async result');
}

// ✅ DEADCODE: 未使用的泛型函式
function unusedGenericFunction<T>(value: T): T {
  return value;
}

// ❌ 非 DEADCODE: 已使用的函式
export function usedFunction() {
  return 'This function is exported and used';
}

// ❌ 非 DEADCODE: 內部使用的函式
function internalHelper() {
  return 'helper';
}

export function publicFunction() {
  return internalHelper(); // 使用了 internalHelper
}

// ✅ DEADCODE（--include-exports 時）: 有 export 但無使用的函式
export function unusedExportedFunction() {
  return 'This is exported but never imported or called';
}

// ✅ DEADCODE（--include-exports 時）: 有 export 但無使用的介面
export interface UnusedExportedInterface {
  id: number;
  name: string;
}

// ✅ DEADCODE（--include-exports 時）: 有 export 但無使用的型別
export type UnusedExportedType = string | number;
