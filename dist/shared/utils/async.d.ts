/**
 * 延遲執行指定毫秒數
 * @param ms 延遲時間（毫秒）
 * @returns Promise
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * 重試選項介面
 */
interface RetryOptions {
    maxAttempts: number;
    delay?: number;
    exponentialBackoff?: boolean;
    shouldRetry?: (error: any) => boolean;
}
/**
 * 重試執行異步函式
 * @param fn 要重試的函式
 * @param options 重試選項
 * @returns 函式執行結果
 */
export declare function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
/**
 * 為 Promise 添加超時控制
 * @param promise 要控制的 Promise
 * @param ms 超時時間（毫秒）
 * @param errorMessage 超時錯誤訊息
 * @returns 帶超時控制的 Promise
 */
export declare function timeout<T>(promise: Promise<T>, ms: number, errorMessage?: string): Promise<T>;
/**
 * 防抖函式
 * @param fn 要防抖的函式
 * @param delay 延遲時間（毫秒）
 * @param immediate 是否立即執行
 * @returns 防抖後的函式
 */
export declare function debounce<T extends (...args: any[]) => any>(fn: T, delay: number, immediate?: boolean): (...args: Parameters<T>) => void;
/**
 * 節流函式
 * @param fn 要節流的函式
 * @param delay 節流間隔（毫秒）
 * @returns 節流後的函式
 */
export declare function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void;
/**
 * 並行執行多個異步任務
 * @param tasks 任務陣列
 * @returns 所有任務的結果
 */
export declare function parallel<T>(tasks: (() => Promise<T>)[]): Promise<T[]>;
/**
 * 順序執行多個異步任務
 * @param tasks 任務陣列
 * @returns 所有任務的結果
 */
export declare function sequential<T>(tasks: (() => Promise<T>)[]): Promise<T[]>;
/**
 * 競速執行多個異步任務，返回最先完成的結果
 * @param tasks 任務陣列
 * @returns 最先完成的任務結果
 */
export declare function race<T>(tasks: (() => Promise<T>)[]): Promise<T | undefined>;
/**
 * 限制並行數量的佇列執行
 * @param tasks 任務陣列
 * @param concurrency 最大並行數量
 * @returns 所有任務的結果
 */
export declare function queue<T>(tasks: (() => Promise<T>)[], concurrency?: number): Promise<T[]>;
/**
 * 批次處理選項
 */
interface BatchOptions {
    batchSize: number;
    concurrency?: number;
}
/**
 * 分批處理陣列項目
 * @param items 要處理的項目陣列
 * @param processor 批次處理函式
 * @param options 批次處理選項
 * @returns 處理後的結果陣列
 */
export declare function batch<T, R>(items: T[], processor: (batch: T[]) => Promise<R[]>, options: BatchOptions): Promise<R[]>;
export {};
//# sourceMappingURL=async.d.ts.map