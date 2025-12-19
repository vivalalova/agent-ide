/**
 * Bug #34 測試：結構性程式碼保護
 *
 * 這個檔案測試以下邊界情況：
 * 1. try/catch 區塊中的 dead code 不應影響結構括號
 * 2. 物件字面值中的屬性不應被標記為 dead code
 * 3. 返回物件字面值的函數
 */

// ============================================================================
// 測試案例 1：try/catch 區塊中的 dead code
// ============================================================================

/**
 * 這個函數包含 try/catch 和一個未使用的內部變數
 * 即使 unusedInTry 被標記為 dead code，try 區塊的 } 不應被刪除
 */
export function functionWithTryCatch(): string {
  try {
    const result = 'success';
    return result;
  } catch (error) {
    return 'error';
  }
}

/**
 * 更複雜的案例：try/catch/finally
 */
export function functionWithTryCatchFinally(): void {
  try {
    console.log('try block');
  } catch (error) {
    console.log('catch block');
  } finally {
    console.log('finally block');
  }
}

// ============================================================================
// 測試案例 2：物件字面值屬性
// ============================================================================

/**
 * 模擬 Vite Plugin 結構
 * `name` 是必要屬性，不應被標記為 dead code
 */
export function createVitePlugin() {
  return {
    name: 'auto-update-api',
    async buildStart() {
      console.log('Build starting...');
    },
    transform(code: string, id: string) {
      return code;
    },
  };
}

/**
 * 物件屬性賦值不應被標記為 dead code
 */
export const config = {
  // 這些屬性都是必要的，不應被刪除
  apiEndpoint: 'https://api.example.com',
  timeout: 5000,
  retryCount: 3,
};

/**
 * 巢狀物件字面值
 */
export const nestedConfig = {
  server: {
    host: 'localhost',
    port: 3000,
  },
  database: {
    connectionString: 'mongodb://localhost:27017',
    poolSize: 10,
  },
};

// ============================================================================
// 測試案例 3：箭頭函數返回物件
// ============================================================================

/**
 * 箭頭函數返回物件字面值
 */
export const createConfig = () => ({
  name: 'my-config',
  version: '1.0.0',
  enabled: true,
});

/**
 * 物件解構賦值
 */
export function processConfig() {
  const { name, version, enabled } = createConfig();
  return `${name}@${version} (${enabled ? 'enabled' : 'disabled'})`;
}

// ============================================================================
// 測試案例 4：class 方法中的 try/catch
// ============================================================================

export class ServiceWithTryCatch {
  public async fetchData(): Promise<string> {
    try {
      const response = await fetch('https://api.example.com/data');
      return await response.text();
    } catch (error) {
      return 'error';
    }
  }
}
