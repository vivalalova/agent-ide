# Storage 基礎設施開發規範

## 實作狀態 ✅

### 實際檔案結構
```
storage/
├── index.ts                    ✅ 儲存入口
├── file-system.ts              ✅ 檔案系統運作
├── file-watcher.ts             ✅ 檔案監控
├── path-utils.ts               ✅ 路徑工具
├── types.ts                    ✅ 型別定義
└── 其他進階功能              ⏳ 待實作
```

### 實作功能狀態
- ✅ 檔案系統基本運作
- ✅ 檔案監控功能
- ✅ 路徑處理工具
- ✅ 基本型別定義
- ⏳ 多儲存引擎支援
- ⏳ 事務管理功能
- ⏳ 數據編移功能

## 模組職責
提供統一的持久化儲存抽象層，支援多種儲存後端，確保資料一致性、可靠性和高效存取。

## 核心開發原則

### 1. 抽象化設計
- **統一介面**：所有儲存後端使用相同 API
- **可插拔架構**：支援新增儲存引擎
- **透明切換**：更換後端不影響業務邏輯
- **資料無關**：支援任何資料類型

### 2. 可靠性保證
- ACID 事務支援
- 資料備份與復原
- 錯誤重試機制
- 資料完整性檢查

### 3. 效能優化
- 批次操作
- 非同步 I/O
- 連線池管理
- 查詢優化

### 4. 資料一致性
- 併發控制機制
- 版本衝突處理
- 原子性操作保證
- 隔離級別管理

### 5. 可擴展性
- 支援分散式儲存
- 水平擴展能力
- 負載平衡機制
- 容量自動調整

## 實作檔案

### 核心架構
```
storage/
├── index.ts                 # 儲存入口
├── interfaces/
│   ├── storage-engine.ts       # 儲存引擎介面
│   ├── transaction.ts          # 事務介面
│   └── query-builder.ts        # 查詢建造器介面
├── engines/
│   ├── file-system.ts          # 檔案系統引擎
│   ├── sqlite.ts               # SQLite 引擎
│   ├── memory.ts               # 記憶體引擎
│   └── distributed.ts          # 分散式儲存引擎
├── managers/
│   ├── connection-manager.ts   # 連線管理器
│   ├── transaction-manager.ts  # 事務管理器
│   ├── migration-manager.ts    # 遷移管理器
│   └── backup-manager.ts       # 備份管理器
├── utils/
│   ├── path-utils.ts           # 路徑工具
│   ├── serializer.ts           # 序列化工具
│   ├── compression.ts          # 壓縮工具
│   └── validation.ts           # 驗證工具
├── watchers/
│   ├── file-watcher.ts         # 檔案監控器
│   ├── change-detector.ts      # 變更檢測器
│   └── event-emitter.ts        # 事件發射器
└── types.ts                 # 型別定義
```

## 主要功能介面

### 儲存引擎介面
```typescript
interface StorageEngine {
  readonly name: string;
  readonly version: string;
  readonly capabilities: StorageCapabilities;

  // 基本操作
  connect(config: StorageConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // CRUD 操作
  create<T>(key: string, data: T): Promise<void>;
  read<T>(key: string): Promise<T | null>;
  update<T>(key: string, data: T): Promise<void>;
  delete(key: string): Promise<void>;

  // 批次操作
  batch(operations: BatchOperation[]): Promise<void>;

  // 查詢操作
  query<T>(query: Query): Promise<T[]>;

  // 事務支援
  beginTransaction(): Promise<Transaction>;
}
```

### 事務管理介面
```typescript
interface Transaction {
  readonly id: string;
  readonly timestamp: Date;
  readonly status: TransactionStatus;

  // 事務操作
  create<T>(key: string, data: T): Promise<void>;
  read<T>(key: string): Promise<T | null>;
  update<T>(key: string, data: T): Promise<void>;
  delete(key: string): Promise<void>;

  // 事務控制
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
}
```

### 檔案系統介面
```typescript
interface FileSystemEngine extends StorageEngine {
  // 檔案操作
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;

  // 目錄操作
  createDirectory(path: string): Promise<void>;
  readDirectory(path: string): Promise<string[]>;
  deleteDirectory(path: string): Promise<void>;

  // 檔案資訊
  getStats(path: string): Promise<FileStats>;
  getSize(path: string): Promise<number>;
  getModifiedTime(path: string): Promise<Date>;
}
```

### 檔案監控介面
```typescript
interface FileWatcher {
  // 監控控制
  watch(path: string, options?: WatchOptions): Promise<void>;
  unwatch(path: string): Promise<void>;
  unwatchAll(): Promise<void>;

  // 事件處理
  on(event: 'change', listener: (path: string, stats: FileStats) => void): void;
  on(event: 'create', listener: (path: string) => void): void;
  on(event: 'delete', listener: (path: string) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;

  // 狀態查詢
  isWatching(path: string): boolean;
  getWatchedPaths(): string[];
}
```

### 連線管理介面
```typescript
interface ConnectionManager {
  // 連線池管理
  createPool(config: PoolConfig): Promise<ConnectionPool>;
  destroyPool(poolName: string): Promise<void>;
  getPool(poolName: string): ConnectionPool | null;

  // 連線操作
  acquire(poolName: string): Promise<Connection>;
  release(connection: Connection): Promise<void>;

  // 健康檢查
  healthCheck(): Promise<HealthStatus>;
  validateConnection(connection: Connection): Promise<boolean>;
}
```

### 查詢建造器介面
```typescript
interface QueryBuilder {
  // 查詢建構
  select(...fields: string[]): QueryBuilder;
  from(table: string): QueryBuilder;
  where(condition: WhereCondition): QueryBuilder;
  orderBy(field: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;

  // 執行查詢
  execute<T>(): Promise<T[]>;
  count(): Promise<number>;
  exists(): Promise<boolean>;

  // 查詢優化
  explain(): Promise<QueryPlan>;
  optimize(): QueryBuilder;
}
```

### 遷移管理介面
```typescript
interface MigrationManager {
  // 遷移操作
  migrate(version?: string): Promise<void>;
  rollback(steps?: number): Promise<void>;
  reset(): Promise<void>;

  // 遷移狀態
  getCurrentVersion(): Promise<string>;
  getPendingMigrations(): Promise<Migration[]>;
  getAppliedMigrations(): Promise<Migration[]>;

  // 遷移文件
  createMigration(name: string): Promise<string>;
  loadMigrations(): Promise<Migration[]>;
}
```

## 核心型別定義

### 基本型別
```typescript
interface StorageConfig {
  engine: string;
  connectionString?: string;
  options?: Record<string, any>;
  pool?: PoolConfig;
  timeout?: number;
  retries?: number;
}

interface StorageCapabilities {
  transactions: boolean;
  queries: boolean;
  indexing: boolean;
  backup: boolean;
  encryption: boolean;
  compression: boolean;
}

interface BatchOperation {
  type: 'create' | 'read' | 'update' | 'delete';
  key: string;
  data?: any;
}

enum TransactionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMMITTED = 'committed',
  ROLLED_BACK = 'rolled_back',
  FAILED = 'failed'
}
```

### 查詢型別
```typescript
interface Query {
  table: string;
  fields?: string[];
  where?: WhereCondition[];
  orderBy?: OrderByClause[];
  limit?: number;
  offset?: number;
}

interface WhereCondition {
  field: string;
  operator: ComparisonOperator;
  value: any;
  logic?: LogicOperator;
}

type ComparisonOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN';
type LogicOperator = 'AND' | 'OR';
```

### 檔案型別
```typescript
interface FileStats {
  size: number;
  mtime: Date;
  ctime: Date;
  atime: Date;
  isFile: boolean;
  isDirectory: boolean;
  permissions: number;
}

interface WatchOptions {
  recursive?: boolean;
  ignored?: string | RegExp | ((path: string) => boolean);
  persistent?: boolean;
  ignoreInitial?: boolean;
}
```

### 連線池型別
```typescript
interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis?: number;
  idleTimeoutMillis?: number;
  reapIntervalMillis?: number;
  createRetryIntervalMillis?: number;
}

interface ConnectionPool {
  size: number;
  available: number;
  pending: number;
  acquire(): Promise<Connection>;
  release(connection: Connection): Promise<void>;
  destroy(): Promise<void>;
}
```