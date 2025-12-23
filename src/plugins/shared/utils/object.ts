/**
 * 深度複製物件
 * @param obj 待複製的物件
 * @param visited 已訪問的物件（用於處理循環引用）
 * @returns 深度複製後的物件
 */
export function deepClone<T>(obj: T, visited = new WeakMap<object, unknown>()): T {
  // 處理基本型別
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // 處理循環引用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WeakMap 需要 object 型別，泛型 T 可能不滿足
  if (visited.has(obj as any)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 同上
    return visited.get(obj as any) as T;
  }

  // 處理日期
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  // 處理正則表達式
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags) as T;
  }

  // 處理陣列
  if (Array.isArray(obj)) {
    const clonedArray: unknown[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WeakMap 需要 object 型別
    visited.set(obj as any, clonedArray);

    for (let i = 0; i < obj.length; i++) {
      clonedArray[i] = deepClone(obj[i], visited);
    }

    return clonedArray as T;
  }

  // 處理物件
  const clonedObj = {} as T;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- WeakMap 需要 object 型別
  visited.set(obj as any, clonedObj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態物件屬性賦值
      (clonedObj as any)[key] = deepClone(obj[key], visited);
    }
  }

  return clonedObj;
}

/**
 * 深度合併多個物件
 * @param target 目標物件
 * @param sources 來源物件
 * @returns 合併後的物件
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型約束需要 any 以接受任意物件結構
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  if (!sources.length) {return target;}

  const result = deepClone(target);

  for (const source of sources) {
    mergeObjects(result, source);
  }

  return result;
}

/**
 * 輔助函式：合併兩個物件
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態物件合併需要 any
function mergeObjects(target: Record<string, any>, source: Record<string, any>): void {
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
        mergeObjects(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
      } else {
        target[key] = deepClone(sourceValue);
      }
    }
  }
}

/**
 * 檢查是否為純物件
 */
function isPlainObject(obj: unknown): obj is Record<string, unknown> {
  return obj !== null &&
         typeof obj === 'object' &&
         !Array.isArray(obj) &&
         !(obj instanceof Date) &&
         !(obj instanceof RegExp);
}

/**
 * 選取物件的指定屬性
 * @param obj 來源物件
 * @param keys 要選取的屬性鍵值
 * @returns 包含指定屬性的新物件
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型約束需要 any 以接受任意物件結構
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;

  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }

  return result;
}

/**
 * 排除物件的指定屬性
 * @param obj 來源物件
 * @param keys 要排除的屬性鍵值
 * @returns 排除指定屬性後的新物件
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型約束需要 any 以接受任意物件結構
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  const keySet = new Set(keys);

  for (const key in result) {
    if (keySet.has(key as unknown as K)) {
      delete result[key];
    }
  }

  return result;
}

/**
 * 檢查值是否為空
 * @param value 待檢查的值
 * @returns 是否為空
 */
export function isEmpty(value: unknown): boolean {
  if (value == null) {return true;}

  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }

  if (value instanceof Map || value instanceof Set) {
    return value.size === 0;
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0;
  }

  return false;
}

/**
 * 深度比較兩個值是否相等
 * @param a 第一個值
 * @param b 第二個值
 * @returns 是否相等
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) {return true;}

  if (a == null || b == null) {return a === b;}

  if (typeof a !== typeof b) {return false;}

  // 處理日期
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  // 處理正則表達式
  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  // 處理陣列
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {return false;}

    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) {return false;}
    }

    return true;
  }

  // 處理物件
  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) {return false;}

    for (const key of keysA) {
      if (!keysB.includes(key)) {return false;}
      if (!isEqual(objA[key], objB[key])) {return false;}
    }

    return true;
  }

  return false;
}

/**
 * 設定物件的深層屬性
 * @param obj 目標物件
 * @param path 屬性路徑（支援點記法和陣列索引）
 * @param value 要設定的值
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑存取需要 any
export function set(obj: Record<string, any>, path: string, value: unknown): void {
  if (!path) {return;}

  const keys = parsePath(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑遍歷需要 any
  let current: any = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const nextKey = keys[i + 1];

    if (!(key in current) || current[key] == null) {
      // 如果下一個鍵是數字，建立陣列，否則建立物件
      current[key] = /^\d+$/.test(nextKey) ? [] : {};
    }

    current = current[key];
  }

  if (keys.length > 0) {
    current[keys[keys.length - 1]] = value;
  }
}

/**
 * 取得物件的深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @param defaultValue 預設值
 * @returns 屬性值或預設值
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑存取需要 any
export function get(obj: Record<string, any>, path: string, defaultValue?: unknown): unknown {
  if (!path) {return obj;}

  const keys = parsePath(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑遍歷需要 any
  let current: any = obj;

  for (const key of keys) {
    if (current == null || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
}

/**
 * 檢查物件是否有深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @returns 是否存在該屬性
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑存取需要 any
export function has(obj: Record<string, any>, path: string): boolean {
  if (!path) {return false;}

  const keys = parsePath(path);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 動態路徑遍歷需要 any
  let current: any = obj;

  for (const key of keys) {
    if (current == null || !(key in current)) {
      return false;
    }
    current = current[key];
  }

  return true;
}

/**
 * 解析屬性路徑
 * @param path 路徑字串
 * @returns 路徑陣列
 */
function parsePath(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1') // 將 [0] 轉換為 .0
    .split('.')
    .filter(key => key !== '');
}

/**
 * 映射物件的值
 * @param obj 來源物件
 * @param mapper 映射函式
 * @returns 映射後的新物件
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 泛型約束需要 any 以接受任意物件結構
export function mapValues<T extends Record<string, any>, R>(
  obj: T,
  mapper: (value: T[keyof T], key: keyof T) => R
): Record<keyof T, R> {
  const result = {} as Record<keyof T, R>;

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = mapper(obj[key], key);
    }
  }

  return result;
}
