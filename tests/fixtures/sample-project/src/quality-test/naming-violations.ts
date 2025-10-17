/**
 * 命名規範違反測試檔案
 * 用於測試 NamingChecker 的檢測能力
 */

// 測試項目 1：底線開頭變數（應檢測到 5 個）
const _secret = 'password123';
const _internalState = { count: 0 };
const _tempValue = null;
const _config = { debug: true };
const _cache: Record<string, unknown> = {};

// 測試項目 2：底線開頭在類別中（應檢測到 3 個）
class BadNamingClass {
  _privateField = 'private';
  _internalCounter = 0;

  constructor() {
    const _localVar = 'local';
  }

  method() {
    const _result = 'result';
    return _result;
  }
}

// 測試項目 3：函式內的底線變數（應檢測到 2 個）
function processData(data: unknown) {
  const _processedData = transformData(data);
  const _intermediate = 'temp';
  return _processedData;
}

function transformData(data: unknown) {
  const _transformed = JSON.stringify(data);
  return _transformed;
}

// 正常的命名（不應被檢測為問題）
const normalVariable = 'normal';
const camelCaseVar = 'value';
const properName = 123;

class GoodNamingClass {
  publicField = 'public';
  normalMethod() {
    const localVar = 'local';
    return localVar;
  }
}

// MongoDB 風格的欄位（_id 是例外，但我們的規範不允許）
interface MongoDocument {
  _id: string; // 這也會被檢測到
}

export { BadNamingClass, GoodNamingClass, processData };
