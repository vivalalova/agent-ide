/**
 * 這個文件包含不應該被檢測為 deadcode 的情況（false positive cases）
 */

// ❌ 非 DEADCODE: exported 符號應該被忽略
export function exportedFunction() {
  return 'exported';
}

export const exportedVariable = 'exported variable';

export class ExportedClass {
  constructor() {}
}

// ❌ 非 DEADCODE: 類別方法被外部調用
export class ServiceClass {
  // public 方法可能被外部調用
  public publicMethod() {
    return this.privateHelper();
  }

  // private 方法被內部使用，不是 deadcode
  private privateHelper() {
    return 'helper';
  }

  // protected 方法可能被子類別使用
  protected protectedMethod() {
    return 'protected';
  }
}

// ❌ 非 DEADCODE: 鏈式調用
export class ChainClass {
  private value: number = 0;

  setValue(val: number) {
    this.value = val;
    return this;
  }

  getValue() {
    return this.value;
  }
}

// ❌ 非 DEADCODE: callback 函式
export function processData(callback: (data: string) => void) {
  callback('data');
}

function dataHandler(data: string) {
  console.log(data);
}

export function setupHandler() {
  processData(dataHandler); // dataHandler 被使用
}

// ❌ 非 DEADCODE: 物件方法引用
export const handlers = {
  handle1: function handleOne() {
    return 'one';
  },
  handle2: function handleTwo() {
    return 'two';
  }
};

// ❌ 非 DEADCODE: 動態調用
function dynamicFunction() {
  return 'dynamic';
}

export function callDynamic(name: string) {
  if (name === 'dynamicFunction') {
    return dynamicFunction();
  }
}

// ❌ 非 DEADCODE: 遞迴函式
function recursiveFunction(n: number): number {
  if (n <= 1) {return 1;}
  return n * recursiveFunction(n - 1);
}

export function factorial(n: number) {
  return recursiveFunction(n);
}

// ❌ 非 DEADCODE: 互相調用的函式
function helperA() {
  return helperB();
}

function helperB() {
  return 'result';
}

export function useHelpers() {
  return helperA();
}
