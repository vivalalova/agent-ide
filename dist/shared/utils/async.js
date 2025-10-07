/**
 * 延遲執行指定毫秒數
 * @param ms 延遲時間（毫秒）
 * @returns Promise
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * 重試執行異步函式
 * @param fn 要重試的函式
 * @param options 重試選項
 * @returns 函式執行結果
 */
export async function retry(fn, options) {
    const { maxAttempts, delay = 1000, exponentialBackoff = false, shouldRetry } = options;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            // 檢查是否應該重試
            if (shouldRetry && !shouldRetry(error)) {
                throw error;
            }
            // 如果是最後一次嘗試，拋出錯誤
            if (attempt === maxAttempts) {
                throw error;
            }
            // 計算延遲時間
            const currentDelay = exponentialBackoff ? delay * Math.pow(2, attempt - 1) : delay;
            await sleep(currentDelay);
        }
    }
    throw lastError;
}
/**
 * 為 Promise 添加超時控制
 * @param promise 要控制的 Promise
 * @param ms 超時時間（毫秒）
 * @param errorMessage 超時錯誤訊息
 * @returns 帶超時控制的 Promise
 */
export function timeout(promise, ms, errorMessage) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(errorMessage || `Operation timed out after ${ms}ms`));
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]);
}
/**
 * 防抖函式
 * @param fn 要防抖的函式
 * @param delay 延遲時間（毫秒）
 * @param immediate 是否立即執行
 * @returns 防抖後的函式
 */
export function debounce(fn, delay, immediate = false) {
    let timeoutId = null;
    let hasExecuted = false;
    return (...args) => {
        const executeNow = immediate && !timeoutId;
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            timeoutId = null;
            hasExecuted = false;
            if (!immediate) {
                fn(...args);
            }
        }, delay);
        if (executeNow && !hasExecuted) {
            hasExecuted = true;
            fn(...args);
        }
    };
}
/**
 * 節流函式
 * @param fn 要節流的函式
 * @param delay 節流間隔（毫秒）
 * @returns 節流後的函式
 */
export function throttle(fn, delay) {
    let lastExecutionTime = 0;
    return (...args) => {
        const currentTime = Date.now();
        if (currentTime - lastExecutionTime >= delay) {
            lastExecutionTime = currentTime;
            fn(...args);
        }
    };
}
/**
 * 並行執行多個異步任務
 * @param tasks 任務陣列
 * @returns 所有任務的結果
 */
export async function parallel(tasks) {
    if (!tasks.length) {
        return [];
    }
    const promises = tasks.map(task => task());
    return Promise.all(promises);
}
/**
 * 順序執行多個異步任務
 * @param tasks 任務陣列
 * @returns 所有任務的結果
 */
export async function sequential(tasks) {
    const results = [];
    for (const task of tasks) {
        const result = await task();
        results.push(result);
    }
    return results;
}
/**
 * 競速執行多個異步任務，返回最先完成的結果
 * @param tasks 任務陣列
 * @returns 最先完成的任務結果
 */
export async function race(tasks) {
    if (!tasks.length) {
        return undefined;
    }
    const promises = tasks.map(task => task());
    return Promise.race(promises);
}
/**
 * 限制並行數量的佇列執行
 * @param tasks 任務陣列
 * @param concurrency 最大並行數量
 * @returns 所有任務的結果
 */
export async function queue(tasks, concurrency = 1) {
    if (!tasks.length) {
        return [];
    }
    const results = new Array(tasks.length);
    let currentIndex = 0;
    const executeTask = async (taskIndex) => {
        const task = tasks[taskIndex];
        results[taskIndex] = await task();
    };
    const worker = async () => {
        while (currentIndex < tasks.length) {
            const taskIndex = currentIndex++;
            await executeTask(taskIndex);
        }
    };
    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
    await Promise.all(workers);
    return results;
}
/**
 * 分批處理陣列項目
 * @param items 要處理的項目陣列
 * @param processor 批次處理函式
 * @param options 批次處理選項
 * @returns 處理後的結果陣列
 */
export async function batch(items, processor, options) {
    if (!items.length) {
        return [];
    }
    const { batchSize, concurrency = 1 } = options;
    const batches = [];
    // 將項目分成批次
    for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
    }
    // 建立批次處理任務
    const batchTasks = batches.map(batch => () => processor(batch));
    // 執行批次處理
    const batchResults = await queue(batchTasks, concurrency);
    // 扁平化結果
    return batchResults.flat();
}
//# sourceMappingURL=async.js.map