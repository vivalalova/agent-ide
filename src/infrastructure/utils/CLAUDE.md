# Utils 工具模組開發規範

## 模組職責
提供共用工具函式和輔助類別，簡化開發流程，提高程式碼重用性，確保一致的實作標準。

## 開發原則

### 1. 函式式設計
- **純函式**：無副作用，可預測
- **組合性**：小函式組合成大功能
- **不可變性**：不修改輸入資料
- **惰性求值**：必要時才計算

### 2. 錯誤處理
- 明確的錯誤訊息
- 優雅的失敗處理
- 可選的預設值
- 詳細的日誌記錄

### 3. 效能考量
- 避免重複計算
- 使用適當的資料結構
- 支援並行處理
- 記憶體效率管理

## 實作規範

### 檔案結構
```
utils/
├── index.ts                 # 工具入口
├── string/
│   ├── manipulation.ts         # 字串操作
│   ├── validation.ts           # 字串驗證
│   ├── formatting.ts           # 字串格式化
│   └── encoding.ts             # 編碼處理
├── array/
│   ├── operations.ts           # 陣列操作
│   ├── searching.ts            # 陣列搜尋
│   ├── sorting.ts              # 陣列排序
│   └── grouping.ts             # 陣列分組
├── object/
│   ├── manipulation.ts         # 物件操作
│   ├── traversal.ts            # 物件遍歷
│   ├── comparison.ts           # 物件比較
│   └── cloning.ts              # 物件克隆
├── async/
│   ├── promise-utils.ts        # Promise 工具
│   ├── retry.ts                # 重試機制
│   ├── throttle.ts             # 節流控制
│   └── queue.ts                # 非同步佇列
├── file/
│   ├── path-utils.ts           # 路徑工具
│   ├── file-operations.ts      # 檔案操作
│   ├── glob-utils.ts           # Glob 工具
│   └── mime-types.ts           # MIME 類型
├── crypto/
│   ├── hashing.ts              # 雜湊函式
│   ├── encryption.ts           # 加密解密
│   └── random.ts               # 隨機數生成
├── validation/
│   ├── validators.ts           # 驗證器
│   ├── schemas.ts              # Schema 驗證
│   └── sanitizers.ts           # 資料清理
├── logger/
│   ├── logger.ts               # 日誌記錄器
│   ├── formatters.ts           # 日誌格式化
│   └── transports.ts           # 輸出目標
└── types.ts                 # 型別定義
```

## 字串工具

### 字串操作
```typescript
// 駝峰轉換
function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(\w)/g, (_, char) => char.toUpperCase())
    .replace(/^\w/, char => char.toLowerCase());
}

// 蛇形轉換
function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/[-\s]+/g, '_');
}

// 短橫線轉換
function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[_\s]+/g, '-');
}

// Pascal Case 轉換
function toPascalCase(str: string): string {
  return toCamelCase(str).replace(/^\w/, char => char.toUpperCase());
}

// 截斷字串
function truncate(str: string, maxLength: number, suffix = '...'): string {
  if (str.length <= maxLength) {
    return str;
  }
  
  const truncateLength = maxLength - suffix.length;
  return str.slice(0, truncateLength) + suffix;
}

// 移除重複空白
function normalizeWhitespace(str: string): string {
  return str.trim().replace(/\s+/g, ' ');
}

// 字串模板替換
function template(str: string, data: Record<string, any>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data.hasOwnProperty(key) ? String(data[key]) : match;
  });
}

// 轉換為安全的檔案名
function toSafeFileName(str: string): string {
  return str
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^\.|\.$/, '')
    .slice(0, 255);
}
```

### 字串驗證
```typescript
// Email 驗證
function isEmail(str: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(str);
}

// URL 驗證
function isURL(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// UUID 驗證
function isUUID(str: string, version?: 3 | 4 | 5): boolean {
  const patterns = {
    3: /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    4: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    5: /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  };
  
  const pattern = version ? patterns[version] : 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  return pattern.test(str);
}

// JSON 驗證
function isJSON(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

// 檢查是否為空字串
function isEmpty(str: string): boolean {
  return str.trim().length === 0;
}
```

## 陣列工具

### 陣列操作
```typescript
// 分塊
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  
  return chunks;
}

// 去重
function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

// 深度去重
function uniqueBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
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

// 交集
function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0];
  
  const [first, ...rest] = arrays;
  const set = new Set(first);
  
  for (const array of rest) {
    for (const item of set) {
      if (!array.includes(item)) {
        set.delete(item);
      }
    }
  }
  
  return Array.from(set);
}

// 差集
function difference<T>(array: T[], ...others: T[][]): T[] {
  const otherSet = new Set(others.flat());
  return array.filter(item => !otherSet.has(item));
}

// 打亂
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

// 取樣
function sample<T>(array: T[], count = 1): T[] {
  const shuffled = shuffle(array);
  return shuffled.slice(0, count);
}

// 壓平
function flatten<T>(array: any[], depth = 1): T[] {
  if (depth <= 0) return array;
  
  return array.reduce((acc, val) => {
    if (Array.isArray(val)) {
      return acc.concat(flatten(val, depth - 1));
    }
    return acc.concat(val);
  }, []);
}
```

### 陣列分組
```typescript
// 按鍵分組
function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    
    if (!groups[key]) {
      groups[key] = [];
    }
    
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

// 分割為兩組
function partition<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const pass: T[] = [];
  const fail: T[] = [];
  
  for (const item of array) {
    if (predicate(item)) {
      pass.push(item);
    } else {
      fail.push(item);
    }
  }
  
  return [pass, fail];
}

// 計數
function countBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, number> {
  return array.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {} as Record<K, number>);
}
```

## 物件工具

### 物件操作
```typescript
// 深度合併
function deepMerge<T extends object>(...objects: Partial<T>[]): T {
  const result: any = {};
  
  for (const obj of objects) {
    for (const key in obj) {
      const value = obj[key];
      
      if (value === undefined) continue;
      
      if (isPlainObject(value) && isPlainObject(result[key])) {
        result[key] = deepMerge(result[key], value);
      } else if (Array.isArray(value)) {
        result[key] = [...value];
      } else {
        result[key] = value;
      }
    }
  }
  
  return result;
}

// 深度克隆
function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as any;
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as any;
  }
  
  if (obj instanceof Map) {
    const map = new Map();
    obj.forEach((value, key) => {
      map.set(deepClone(key), deepClone(value));
    });
    return map as any;
  }
  
  if (obj instanceof Set) {
    const set = new Set();
    obj.forEach(value => {
      set.add(deepClone(value));
    });
    return set as any;
  }
  
  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

// 選擇屬性
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  
  return result;
}

// 排除屬性
function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const result = { ...obj };
  
  for (const key of keys) {
    delete result[key];
  }
  
  return result;
}

// 取得巢狀值
function get(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    result = result?.[key];
    
    if (result === undefined) {
      return defaultValue;
    }
  }
  
  return result;
}

// 設定巢狀值
function set(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  
  let target = obj;
  for (const key of keys) {
    if (!target[key] || typeof target[key] !== 'object') {
      target[key] = {};
    }
    target = target[key];
  }
  
  target[lastKey] = value;
}
```

### 物件比較
```typescript
// 深度比較
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a !== 'object') return a === b;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    
    return true;
  }
  
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  
  return true;
}

// 找出差異
function diff(oldObj: any, newObj: any): any {
  const changes: any = {};
  
  // 檢查修改和刪除
  for (const key in oldObj) {
    if (!(key in newObj)) {
      changes[key] = { type: 'deleted', oldValue: oldObj[key] };
    } else if (!deepEqual(oldObj[key], newObj[key])) {
      changes[key] = {
        type: 'modified',
        oldValue: oldObj[key],
        newValue: newObj[key]
      };
    }
  }
  
  // 檢查新增
  for (const key in newObj) {
    if (!(key in oldObj)) {
      changes[key] = { type: 'added', newValue: newObj[key] };
    }
  }
  
  return changes;
}
```

## 非同步工具

### Promise 工具
```typescript
// 延遲
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 超時控制
function timeout<T>(promise: Promise<T>, ms: number, error?: Error): Promise<T> {
  return Promise.race([
    promise,
    delay(ms).then(() => {
      throw error || new Error(`Timeout after ${ms}ms`);
    })
  ]);
}

// 並行限制
async function parallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(
        executing.findIndex(p => p === promise),
        1
      );
    }
  }
  
  await Promise.all(executing);
  return results;
}

// 串行執行
async function series<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  
  for (const item of items) {
    results.push(await fn(item));
  }
  
  return results;
}

// Promise 緩存
function memoizeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): T {
  const cache = new Map<string, Promise<any>>();
  
  return ((...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const promise = fn(...args);
    cache.set(key, promise);
    
    promise.catch(() => {
      cache.delete(key);
    });
    
    return promise;
  }) as T;
}
```

### 重試機制
```typescript
interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    delay: initialDelay = 1000,
    backoff = 2,
    onRetry
  } = options;
  
  let lastError: Error;
  let currentDelay = initialDelay;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt === retries) {
        throw lastError;
      }
      
      if (onRetry) {
        onRetry(lastError, attempt);
      }
      
      await delay(currentDelay);
      currentDelay *= backoff;
    }
  }
  
  throw lastError!;
}
```

### 節流和防抖
```typescript
// 節流
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  wait: number
): T {
  let lastTime = 0;
  let timeout: NodeJS.Timeout | null = null;
  
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    
    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      
      lastTime = now;
      return fn(...args);
    }
    
    if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  }) as T;
}

// 防抖
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  wait: number,
  immediate = false
): T {
  let timeout: NodeJS.Timeout | null = null;
  
  return ((...args: Parameters<T>) => {
    const later = () => {
      timeout = null;
      if (!immediate) {
        fn(...args);
      }
    };
    
    const callNow = immediate && !timeout;
    
    if (timeout) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
    
    if (callNow) {
      fn(...args);
    }
  }) as T;
}
```

## 檔案工具

### 路徑工具
```typescript
// 正規化路徑
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

// 判斷是否為絕對路徑
function isAbsolutePath(path: string): boolean {
  return /^(\/|[A-Za-z]:[/\\])/.test(path);
}

// 取得相對路徑
function relativePath(from: string, to: string): string {
  const fromParts = normalizePath(from).split('/');
  const toParts = normalizePath(to).split('/');
  
  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }
  
  const upCount = fromParts.length - commonLength - 1;
  const upPath = '../'.repeat(upCount);
  const downPath = toParts.slice(commonLength).join('/');
  
  return upPath + downPath;
}

// 取得副檔名
function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  
  if (lastDot > lastSlash && lastDot > 0) {
    return path.slice(lastDot);
  }
  
  return '';
}

// 更改副檔名
function changeExtension(path: string, newExt: string): string {
  const ext = getExtension(path);
  
  if (ext) {
    return path.slice(0, -ext.length) + newExt;
  }
  
  return path + newExt;
}
```

### Glob 工具
```typescript
// 將 glob 模式轉換為正則表達式
function globToRegex(glob: string): RegExp {
  let regex = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 轉義特殊字符
    .replace(/\*/g, '[^/]*') // * 匹配任意字符（不包括 /）
    .replace(/\?/g, '[^/]') // ? 匹配單個字符
    .replace(/\*\*/g, '.*'); // ** 匹配任意路徑
  
  return new RegExp(`^${regex}$`);
}

// 檢查路徑是否匹配 glob 模式
function matchGlob(path: string, pattern: string): boolean {
  const regex = globToRegex(pattern);
  return regex.test(normalizePath(path));
}

// 過濾符合 glob 模式的路徑
function filterByGlob(paths: string[], patterns: string[]): string[] {
  const regexes = patterns.map(globToRegex);
  
  return paths.filter(path => {
    const normalized = normalizePath(path);
    return regexes.some(regex => regex.test(normalized));
  });
}
```

## 加密工具

### 雜湊函式
```typescript
import * as crypto from 'crypto';

// MD5 雜湊
function md5(data: string | Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

// SHA256 雜湊
function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// HMAC 簽名
function hmac(
  data: string | Buffer,
  secret: string,
  algorithm: 'sha256' | 'sha512' = 'sha256'
): string {
  return crypto.createHmac(algorithm, secret).update(data).digest('hex');
}

// 雜湊比對（防時序攻擊）
function compareHash(hash1: string, hash2: string): boolean {
  const buffer1 = Buffer.from(hash1);
  const buffer2 = Buffer.from(hash2);
  
  if (buffer1.length !== buffer2.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(buffer1, buffer2);
}
```

### 隨機數生成
```typescript
// 生成隨機字串
function randomString(length: number, charset?: string): string {
  const chars = charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return result;
}

// 生成 UUID v4
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// 生成安全隨機數
function secureRandom(min: number, max: number): number {
  const range = max - min;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValue = 256 ** bytesNeeded;
  const threshold = maxValue - (maxValue % range);
  
  let randomValue: number;
  
  do {
    const randomBytes = crypto.randomBytes(bytesNeeded);
    randomValue = randomBytes.readUIntBE(0, bytesNeeded);
  } while (randomValue >= threshold);
  
  return min + (randomValue % range);
}
```

## 日誌工具

### 日誌記錄器
```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

class Logger {
  private level: LogLevel;
  private transports: LogTransport[] = [];
  
  constructor(options: LoggerOptions = {}) {
    this.level = options.level || LogLevel.INFO;
    
    if (options.console !== false) {
      this.transports.push(new ConsoleTransport());
    }
    
    if (options.file) {
      this.transports.push(new FileTransport(options.file));
    }
  }
  
  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, ...args);
  }
  
  info(...args: any[]): void {
    this.log(LogLevel.INFO, ...args);
  }
  
  warn(...args: any[]): void {
    this.log(LogLevel.WARN, ...args);
  }
  
  error(...args: any[]): void {
    this.log(LogLevel.ERROR, ...args);
  }
  
  fatal(...args: any[]): void {
    this.log(LogLevel.FATAL, ...args);
  }
  
  private log(level: LogLevel, ...args: any[]): void {
    if (level < this.level) return;
    
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message: this.formatMessage(args),
      metadata: this.extractMetadata(args)
    };
    
    for (const transport of this.transports) {
      transport.write(entry);
    }
  }
  
  private formatMessage(args: any[]): string {
    return args
      .map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      })
      .join(' ');
  }
}
```

## 驗證工具

### Schema 驗證
```typescript
interface Schema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
}

function validate(value: any, schema: Schema): ValidationResult {
  const errors: ValidationError[] = [];
  
  // 檢查必填
  if (schema.required && (value === null || value === undefined)) {
    errors.push({ path: '', message: 'Value is required' });
    return { valid: false, errors };
  }
  
  // 檢查類型
  if (!checkType(value, schema.type)) {
    errors.push({ 
      path: '', 
      message: `Expected ${schema.type}, got ${typeof value}` 
    });
    return { valid: false, errors };
  }
  
  // 檢查其他約束
  if (schema.type === 'string') {
    if (schema.min && value.length < schema.min) {
      errors.push({ 
        path: '', 
        message: `String length must be at least ${schema.min}` 
      });
    }
    
    if (schema.max && value.length > schema.max) {
      errors.push({ 
        path: '', 
        message: `String length must be at most ${schema.max}` 
      });
    }
    
    if (schema.pattern && !schema.pattern.test(value)) {
      errors.push({ 
        path: '', 
        message: `String does not match pattern ${schema.pattern}` 
      });
    }
  }
  
  // 檢查物件屬性
  if (schema.type === 'object' && schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propResult = validate(value[key], propSchema);
      
      if (!propResult.valid) {
        propResult.errors.forEach(error => {
          errors.push({
            path: key + (error.path ? `.${error.path}` : ''),
            message: error.message
          });
        });
      }
    }
  }
  
  // 檢查陣列項目
  if (schema.type === 'array' && schema.items) {
    value.forEach((item: any, index: number) => {
      const itemResult = validate(item, schema.items!);
      
      if (!itemResult.valid) {
        itemResult.errors.forEach(error => {
          errors.push({
            path: `[${index}]` + (error.path ? `.${error.path}` : ''),
            message: error.message
          });
        });
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
}
```

## 開發檢查清單

### 功能完整性
- [ ] 字串處理工具
- [ ] 陣列操作工具
- [ ] 物件處理工具
- [ ] 非同步工具
- [ ] 檔案路徑工具
- [ ] 加密雜湊工具
- [ ] 日誌記錄工具
- [ ] 驗證工具

### 程式碼品質
- [ ] 單元測試覆蓋
- [ ] 型別定義完整
- [ ] 錯誤處理完善
- [ ] 文檔註釋充分

### 效能考量
- [ ] 記憶體使用優化
- [ ] 計算複雜度合理
- [ ] 支援並行處理
- [ ] 避免不必要的重複計算

## 疑難排解

### 常見問題

1. **函式執行錯誤**
   - 檢查輸入參數類型
   - 驗證邊界條件
   - 確認返回值格式

2. **效能問題**
   - 使用緩存機制
   - 優化資料結構
   - 避免重複計算

3. **記憶體洩漏**
   - 清理不使用的資源
   - 使用 WeakMap/WeakSet
   - 注意闉包引用

## 未來改進
1. 支援更多工具函式
2. 效能最佳化
3. 增加機器學習輔助工具
4. WebAssembly 加速