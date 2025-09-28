# Utils 工具模組開發規範

## 實作狀態 ✅

### 實際檔案結構
```
utils/
├── (目前主要在其他模組內)      ✅ 工具功能
└── 未來可独立出工具模組     ⏳ 待實作
```

### 實作功能狀態
- ✅ 在各模組中實作了工具功能
- ✅ 基本的字串、路徑處理
- ✅ 簡單的檔案操作工具
- ⏳ 獨立工具模組抽取
- ⏳ 進階工具功能
- ⏳ 效能優化工具
- ⏳ 重試與節流機制

## 模組職責
提供共用工具函式和輔助類別，簡化開發流程，提高程式碼重用性，確保一致的實作標準。

## 核心開發原則

### 1. 函式式設計
- **純函式**：無副作用，可預測
- **組合性**：小函式組合成大功能
- **不可變性**：不修改輸入資料

### 2. 錯誤處理
- 明確的錯誤訊息
- 優雅的失敗處理
- 可選的預設值

### 3. 效能考量
- 避免重複計算
- 使用適當的資料結構
- 支援並行處理

### 4. 型別安全
- 嚴格的 TypeScript 類型定義
- 參數驗證
- 返回值型別保證

### 5. 程式碼重用
- 最大化程式碼重用
- 避免重複實作
- 統一的實作標準

## 實作檔案

### 核心工具類別
```
utils/
├── index.ts                 # 工具入口
├── string/
│   ├── manipulation.ts         # 字串操作
│   ├── validation.ts           # 字串驗證
│   └── formatting.ts           # 字串格式化
├── array/
│   ├── operations.ts           # 陣列操作
│   ├── searching.ts            # 陣列搜尋
│   └── grouping.ts             # 陣列分組
├── object/
│   ├── manipulation.ts         # 物件操作
│   ├── comparison.ts           # 物件比較
│   └── cloning.ts              # 物件克隆
├── async/
│   ├── promise-utils.ts        # Promise 工具
│   ├── retry.ts                # 重試機制
│   └── throttle.ts             # 節流控制
├── file/
│   ├── path-utils.ts           # 路徑工具
│   ├── file-operations.ts      # 檔案操作
│   └── glob-utils.ts           # Glob 工具
├── crypto/
│   ├── hashing.ts              # 雜湊函式
│   └── random.ts               # 隨機數生成
├── validation/
│   ├── validators.ts           # 驗證器
│   └── schemas.ts              # Schema 驗證
├── logger/
│   ├── logger.ts               # 日誌記錄器
│   └── formatters.ts           # 日誌格式化
└── types.ts                 # 型別定義
```

## 主要功能介面

### 字串工具
```typescript
// 命名轉換
function toCamelCase(str: string): string;
function toSnakeCase(str: string): string;
function toKebabCase(str: string): string;
function toPascalCase(str: string): string;

// 字串操作
function truncate(str: string, maxLength: number, suffix?: string): string;
function normalizeWhitespace(str: string): string;
function template(str: string, data: Record<string, any>): string;

// 驗證
function isEmail(str: string): boolean;
function isURL(str: string): boolean;
function isUUID(str: string, version?: 3 | 4 | 5): boolean;
```

### 陣列工具
```typescript
// 基本操作
function chunk<T>(array: T[], size: number): T[][];
function unique<T>(array: T[]): T[];
function shuffle<T>(array: T[]): T[];
function flatten<T>(array: any[], depth?: number): T[];

// 集合操作
function intersection<T>(...arrays: T[][]): T[];
function difference<T>(array: T[], ...others: T[][]): T[];

// 分組與分析
function groupBy<T, K>(array: T[], keyFn: (item: T) => K): Record<K, T[]>;
function partition<T>(array: T[], predicate: (item: T) => boolean): [T[], T[]];
```

### 物件工具
```typescript
// 物件操作
function deepMerge<T>(...objects: Partial<T>[]): T;
function deepClone<T>(obj: T): T;
function pick<T, K extends keyof T>(obj: T, keys: K[]): Pick<T, K>;
function omit<T, K extends keyof T>(obj: T, keys: K[]): Omit<T, K>;

// 巢狀操作
function get(obj: any, path: string, defaultValue?: any): any;
function set(obj: any, path: string, value: any): void;

// 比較
function deepEqual(a: any, b: any): boolean;
function diff(oldObj: any, newObj: any): any;
```

### 非同步工具
```typescript
// Promise 工具
function delay(ms: number): Promise<void>;
function timeout<T>(promise: Promise<T>, ms: number): Promise<T>;
function parallel<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency?: number): Promise<R[]>;

// 重試機制
interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}
function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;

// 節流控制
function throttle<T extends (...args: any[]) => any>(fn: T, wait: number): T;
function debounce<T extends (...args: any[]) => any>(fn: T, wait: number): T;
```

### 檔案工具
```typescript
// 路徑操作
function normalizePath(path: string): string;
function isAbsolutePath(path: string): boolean;
function relativePath(from: string, to: string): string;
function getExtension(path: string): string;

// Glob 工具
function globToRegex(glob: string): RegExp;
function matchGlob(path: string, pattern: string): boolean;
function filterByGlob(paths: string[], patterns: string[]): string[];
```

### 加密工具
```typescript
// 雜湊
function md5(data: string | Buffer): string;
function sha256(data: string | Buffer): string;
function hmac(data: string | Buffer, secret: string): string;

// 隨機數
function randomString(length: number, charset?: string): string;
function uuidv4(): string;
function secureRandom(min: number, max: number): number;
```

### 驗證工具
```typescript
interface Schema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  min?: number;
  max?: number;
  pattern?: RegExp;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function validate(value: any, schema: Schema): ValidationResult;
```

### 日誌工具
```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4
}

interface LoggerOptions {
  level?: LogLevel;
  console?: boolean;
  file?: string;
}

class Logger {
  constructor(options?: LoggerOptions);
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  fatal(...args: any[]): void;
}
```