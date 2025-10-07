/**
 * 深度複製物件
 * @param obj 待複製的物件
 * @param visited 已訪問的物件（用於處理循環引用）
 * @returns 深度複製後的物件
 */
export declare function deepClone<T>(obj: T, visited?: WeakMap<object, any>): T;
/**
 * 深度合併多個物件
 * @param target 目標物件
 * @param sources 來源物件
 * @returns 合併後的物件
 */
export declare function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T;
/**
 * 選取物件的指定屬性
 * @param obj 來源物件
 * @param keys 要選取的屬性鍵值
 * @returns 包含指定屬性的新物件
 */
export declare function pick<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
/**
 * 排除物件的指定屬性
 * @param obj 來源物件
 * @param keys 要排除的屬性鍵值
 * @returns 排除指定屬性後的新物件
 */
export declare function omit<T extends Record<string, any>, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;
/**
 * 檢查值是否為空
 * @param value 待檢查的值
 * @returns 是否為空
 */
export declare function isEmpty(value: any): boolean;
/**
 * 深度比較兩個值是否相等
 * @param a 第一個值
 * @param b 第二個值
 * @returns 是否相等
 */
export declare function isEqual(a: any, b: any): boolean;
/**
 * 設定物件的深層屬性
 * @param obj 目標物件
 * @param path 屬性路徑（支援點記法和陣列索引）
 * @param value 要設定的值
 */
export declare function set(obj: any, path: string, value: any): void;
/**
 * 取得物件的深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @param defaultValue 預設值
 * @returns 屬性值或預設值
 */
export declare function get(obj: any, path: string, defaultValue?: any): any;
/**
 * 檢查物件是否有深層屬性
 * @param obj 來源物件
 * @param path 屬性路徑
 * @returns 是否存在該屬性
 */
export declare function has(obj: any, path: string): boolean;
/**
 * 映射物件的值
 * @param obj 來源物件
 * @param mapper 映射函式
 * @returns 映射後的新物件
 */
export declare function mapValues<T extends Record<string, any>, R>(obj: T, mapper: (value: T[keyof T], key: keyof T) => R): Record<keyof T, R>;
//# sourceMappingURL=object.d.ts.map