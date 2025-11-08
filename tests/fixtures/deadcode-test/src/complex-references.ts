/**
 * 複雜引用關係的測試
 */

// ❌ 非 DEADCODE: 透過物件屬性引用
function helperFunction() {
  return 'helper';
}

export const config = {
  handler: helperFunction // 透過物件屬性引用
};

// ❌ 非 DEADCODE: 作為陣列元素
function arrayHelper() {
  return 'array';
}

export const handlers = [arrayHelper];

// ❌ 非 DEADCODE: 作為高階函式參數
function mapper(item: string) {
  return item.toUpperCase();
}

export function processItems(items: string[]) {
  return items.map(mapper);
}

// ❌ 非 DEADCODE: 解構賦值
function getValue() {
  return { data: 'value' };
}

export function useDestructuring() {
  const { data } = getValue();
  return data;
}

// ✅ DEADCODE: 函式定義但從未被引用
function neverReferencedFunction() {
  return 'never used';
}

// ✅ DEADCODE: 變數定義但從未被引用
const neverReferencedVariable = 'never used';

// ❌ 非 DEADCODE: 型別守衛函式
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function checkType(value: unknown) {
  if (isString(value)) {
    return value.toUpperCase();
  }
  return String(value);
}

// ❌ 非 DEADCODE: 工廠函式
function createHandler(type: string) {
  return () => `handler for ${type}`;
}

export function getHandler(type: string) {
  return createHandler(type);
}

// ✅ DEADCODE: 未完成的實作
function todoImplementation() {
  // TODO: implement this
  return null;
}

// ❌ 非 DEADCODE: 條件性使用
function conditionalHelper(flag: boolean) {
  return flag ? 'yes' : 'no';
}

export function conditional(flag: boolean) {
  if (flag) {
    return conditionalHelper(flag);
  }
  return 'default';
}
