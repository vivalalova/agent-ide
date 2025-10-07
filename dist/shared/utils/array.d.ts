/**
 * 將陣列分割成指定大小的塊
 * @param array 待分割的陣列
 * @param size 每個塊的大小
 * @returns 分割後的陣列
 */
export declare function chunk<T>(array: T[], size: number): T[][];
/**
 * 扁平化陣列，支援多層巢狀
 * @param array 待扁平化的陣列
 * @returns 扁平化後的陣列
 */
export declare function flatten<T = any>(array: any[]): T[];
/**
 * 移除陣列中的重複元素
 * @param array 待去重的陣列
 * @param keyFn 可選的鍵值提取函式
 * @returns 去重後的陣列
 */
export declare function unique<T, K = T>(array: T[], keyFn?: (item: T) => K): T[];
/**
 * 計算兩個陣列的差集
 * @param array1 第一個陣列
 * @param array2 第二個陣列
 * @returns array1 中不在 array2 中的元素
 */
export declare function difference<T>(array1: T[], array2: T[]): T[];
/**
 * 計算兩個陣列的交集
 * @param array1 第一個陣列
 * @param array2 第二個陣列
 * @returns 兩個陣列共同的元素
 */
export declare function intersection<T>(array1: T[], array2: T[]): T[];
/**
 * 根據條件將陣列分為兩部分
 * @param array 待分區的陣列
 * @param predicate 判斷條件
 * @returns [符合條件的元素, 不符合條件的元素]
 */
export declare function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]];
/**
 * 根據鍵值函式對陣列進行分組
 * @param array 待分組的陣列
 * @param keyFn 鍵值提取函式
 * @returns 分組後的物件
 */
export declare function groupBy<T, K extends string | number | symbol>(array: T[], keyFn: (item: T) => K): Record<K, T[]>;
/**
 * 根據回調函式的返回值對陣列進行排序
 * @param array 待排序的陣列
 * @param keyFn 排序鍵值提取函式
 * @returns 排序後的新陣列
 */
export declare function sortBy<T, K>(array: T[], keyFn: (item: T) => K): T[];
/**
 * 洗牌陣列（Fisher-Yates shuffle）
 * @param array 待洗牌的陣列
 * @returns 洗牌後的新陣列
 */
export declare function shuffle<T>(array: T[]): T[];
/**
 * 移除陣列中的假值（false、null、0、""、undefined、NaN）
 * @param array 待處理的陣列
 * @returns 移除假值後的陣列
 */
export declare function compact<T>(array: T[]): NonNullable<T>[];
//# sourceMappingURL=array.d.ts.map