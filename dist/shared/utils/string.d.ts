/**
 * 將字串的首字母大寫
 * @param str 待轉換的字串
 * @returns 首字母大寫的字串
 */
export declare function capitalize(str: string): string;
/**
 * 將字串轉換為駝峰命名
 * @param str 待轉換的字串
 * @returns 駝峰命名格式的字串
 */
export declare function camelCase(str: string): string;
/**
 * 將字串轉換為蛇形命名
 * @param str 待轉換的字串
 * @returns 蛇形命名格式的字串
 */
export declare function snakeCase(str: string): string;
/**
 * 將字串轉換為短橫線命名
 * @param str 待轉換的字串
 * @returns 短橫線命名格式的字串
 */
export declare function kebabCase(str: string): string;
/**
 * 截斷字串並添加省略符
 * @param str 待截斷的字串
 * @param length 最大長度
 * @param ellipsis 省略符，預設為 '...'
 * @returns 截斷後的字串
 */
export declare function truncate(str: string, length: number, ellipsis?: string): string;
/**
 * 在字串開頭填充字元
 * @param str 待填充的字串
 * @param targetLength 目標長度
 * @param padString 填充字元，預設為空格
 * @returns 填充後的字串
 */
export declare function padStart(str: string, targetLength: number, padString?: string): string;
/**
 * 在字串結尾填充字元
 * @param str 待填充的字串
 * @param targetLength 目標長度
 * @param padString 填充字元，預設為空格
 * @returns 填充後的字串
 */
export declare function padEnd(str: string, targetLength: number, padString?: string): string;
/**
 * 移除字串的共同縮排
 * @param str 待處理的字串
 * @returns 移除縮排後的字串
 */
export declare function stripIndent(str: string): string;
/**
 * 跳脫正則表達式特殊字元
 * @param str 待跳脫的字串
 * @returns 跳脫後的字串
 */
export declare function escapeRegExp(str: string): string;
/**
 * 模板字串替換
 * @param template 模板字串，使用 {{key}} 格式
 * @param variables 變數物件
 * @returns 替換後的字串
 */
export declare function template(template: string, variables: Record<string, any>): string;
/**
 * 轉換為 URL 友好的字串
 * @param str 待轉換的字串
 * @returns URL 友好的字串
 */
export declare function slugify(str: string): string;
//# sourceMappingURL=string.d.ts.map