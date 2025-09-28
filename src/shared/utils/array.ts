/**
 * 將陣列分割成指定大小的塊
 * @param array 待分割的陣列
 * @param size 每個塊的大小
 * @returns 分割後的陣列
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (!array.length || size <= 0) {return [];}

  const result: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

/**
 * 扁平化陣列，支援多層巢狀
 * @param array 待扁平化的陣列
 * @returns 扁平化後的陣列
 */
export function flatten<T = any>(array: any[]): T[] {
  const result: T[] = [];

  for (const item of array) {
    if (Array.isArray(item)) {
      result.push(...flatten<T>(item));
    } else {
      result.push(item);
    }
  }

  return result;
}

/**
 * 移除陣列中的重複元素
 * @param array 待去重的陣列
 * @param keyFn 可選的鍵值提取函式
 * @returns 去重後的陣列
 */
export function unique<T, K = T>(array: T[], keyFn?: (item: T) => K): T[] {
  if (!array.length) {return [];}

  if (!keyFn) {
    return Array.from(new Set(array));
  }

  const seen = new Set<K>();
  const result: T[] = [];

  for (const item of array) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

/**
 * 計算兩個陣列的差集
 * @param array1 第一個陣列
 * @param array2 第二個陣列
 * @returns array1 中不在 array2 中的元素
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  if (!array1.length) {return [];}
  if (!array2.length) {return [...array1];}

  const set2 = new Set(array2);
  return array1.filter(item => !set2.has(item));
}

/**
 * 計算兩個陣列的交集
 * @param array1 第一個陣列
 * @param array2 第二個陣列
 * @returns 兩個陣列共同的元素
 */
export function intersection<T>(array1: T[], array2: T[]): T[] {
  if (!array1.length || !array2.length) {return [];}

  const set2 = new Set(array2);
  return array1.filter(item => set2.has(item));
}

/**
 * 根據條件將陣列分為兩部分
 * @param array 待分區的陣列
 * @param predicate 判斷條件
 * @returns [符合條件的元素, 不符合條件的元素]
 */
export function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];

  for (const item of array) {
    if (predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  }

  return [truthy, falsy];
}

/**
 * 根據鍵值函式對陣列進行分組
 * @param array 待分組的陣列
 * @param keyFn 鍵值提取函式
 * @returns 分組後的物件
 */
export function groupBy<T, K extends string | number | symbol>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  const result = {} as Record<K, T[]>;

  for (const item of array) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }

  return result;
}

/**
 * 根據回調函式的返回值對陣列進行排序
 * @param array 待排序的陣列
 * @param keyFn 排序鍵值提取函式
 * @returns 排序後的新陣列
 */
export function sortBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
  return [...array].sort((a, b) => {
    const keyA = keyFn(a);
    const keyB = keyFn(b);

    if (keyA < keyB) {return -1;}
    if (keyA > keyB) {return 1;}
    return 0;
  });
}

/**
 * 洗牌陣列（Fisher-Yates shuffle）
 * @param array 待洗牌的陣列
 * @returns 洗牌後的新陣列
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/**
 * 移除陣列中的假值（false、null、0、""、undefined、NaN）
 * @param array 待處理的陣列
 * @returns 移除假值後的陣列
 */
export function compact<T>(array: T[]): NonNullable<T>[] {
  return array.filter((item): item is NonNullable<T> => {
    return Boolean(item) && !Number.isNaN(item);
  });
}