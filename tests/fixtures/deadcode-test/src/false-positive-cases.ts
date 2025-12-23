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

// ============================================================================
// Bug #35 修復: ArrowFunction/FunctionExpression 參數不應被偵測為 dead code
// ============================================================================

// ❌ 非 DEADCODE: .map() 回呼參數
export function processItems(items: string[]) {
  // 所有這些參數都應該被排除：item, index, arr
  return items.map((item, index, arr) => `${index}: ${item} of ${arr.length}`);
}

// ❌ 非 DEADCODE: .filter() 回呼參數
export function filterItems(items: number[]) {
  // value, index 都應該被排除
  return items.filter((value, index) => value > index);
}

// ❌ 非 DEADCODE: .forEach() 回呼參數
export function logItems(items: string[]) {
  // item 應該被排除
  items.forEach(item => {
    console.log(item);
  });
}

// ❌ 非 DEADCODE: 巢狀 arrow function 參數
export function nestedCallbacks(data: { items: string[] }[]) {
  // parentItem, parentIndex, childItem, childIndex 都應該被排除
  return data.map((parentItem, parentIndex) => ({
    index: parentIndex,
    children: parentItem.items.map((childItem, childIndex) => `${childIndex}: ${childItem}`)
  }));
}

// ❌ 非 DEADCODE: React-like component 參數
const MyComponent = ({ name, onClick }: { name: string; onClick: () => void }) => {
  onClick();
  return name;
};
export const renderComponent = () => MyComponent({ name: 'test', onClick: () => {} });

// ============================================================================
// Bug #36 修復: 繼承方法引用不應被偵測為 dead code
// ============================================================================

// ❌ 非 DEADCODE: 父類別 protected 方法被子類別透過 this 呼叫
class BaseService {
  protected calculateData(input: number): number {
    return input * 2;
  }

  protected formatResult(value: number): string {
    return `Result: ${value}`;
  }
}

export class DerivedService extends BaseService {
  public process(input: number): string {
    // 這裡呼叫繼承的 protected 方法，不應被偵測為 dead code
    const calculated = this.calculateData(input);
    return this.formatResult(calculated);
  }
}

// ❌ 非 DEADCODE: 多層繼承
class GrandparentClass {
  protected legacyMethod(): string {
    return 'legacy';
  }
}

class ParentClass extends GrandparentClass {
  protected intermediateMethod(): string {
    return this.legacyMethod() + ' updated';
  }
}

export class ChildClass extends ParentClass {
  public execute(): string {
    return this.intermediateMethod();
  }
}
