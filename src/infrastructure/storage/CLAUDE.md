# Storage 基礎設施開發規範

## 模組職責
提供統一的持久化儲存抽象層，支援多種儲存後端，確保資料一致性、可靠性和高效存取。

## 開發原則

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

## 實作規範

### 檔案結構
```
storage/
├── index.ts                 # 儲存入口
├── storage-manager.ts       # 儲存管理器
├── engines/
│   ├── file-storage.ts         # 檔案系統儲存
│   ├── sqlite-storage.ts       # SQLite 儲存
│   ├── leveldb-storage.ts      # LevelDB 儲存
│   ├── redis-storage.ts        # Redis 儲存
│   └── memory-storage.ts       # 記憶體儲存
├── models/
│   ├── key-value-store.ts      # 鍵值儲存
│   ├── document-store.ts       # 文件儲存
│   ├── object-store.ts         # 物件儲存
│   └── graph-store.ts          # 圖形儲存
├── transactions/
│   ├── transaction-manager.ts  # 事務管理器
│   ├── transaction-log.ts      # 事務日誌
│   └── rollback-handler.ts     # 回滾處理
├── migration/
│   ├── migrator.ts             # 遷移器
│   ├── schema-manager.ts       # Schema 管理
│   └── version-control.ts      # 版本控制
├── backup/
│   ├── backup-manager.ts       # 備份管理器
│   ├── restore-handler.ts      # 復原處理
│   └── snapshot.ts             # 快照管理
└── types.ts                 # 型別定義
```

## 儲存管理器

### 主管理器
```typescript
class StorageManager {
  private engines: Map<string, StorageEngine> = new Map();
  private defaultEngine: string;
  private transactionManager: TransactionManager;
  private backupManager: BackupManager;
  
  constructor(config: StorageConfig) {
    this.defaultEngine = config.defaultEngine || 'file';
    this.setupEngines(config);
    this.transactionManager = new TransactionManager(this);
    this.backupManager = new BackupManager(this);
  }
  
  // 設定儲存引擎
  private setupEngines(config: StorageConfig): void {
    // 檔案系統
    if (config.file) {
      this.engines.set('file', new FileStorage(config.file));
    }
    
    // SQLite
    if (config.sqlite) {
      this.engines.set('sqlite', new SQLiteStorage(config.sqlite));
    }
    
    // LevelDB
    if (config.leveldb) {
      this.engines.set('leveldb', new LevelDBStorage(config.leveldb));
    }
    
    // Redis
    if (config.redis) {
      this.engines.set('redis', new RedisStorage(config.redis));
    }
    
    // 記憶體（總是啟用）
    this.engines.set('memory', new MemoryStorage());
  }
  
  // 取得引擎
  getEngine(name?: string): StorageEngine {
    const engineName = name || this.defaultEngine;
    const engine = this.engines.get(engineName);
    
    if (!engine) {
      throw new Error(`Storage engine not found: ${engineName}`);
    }
    
    return engine;
  }
  
  // 開啟事務
  async beginTransaction(): Promise<Transaction> {
    return this.transactionManager.begin();
  }
  
  // 備份
  async backup(options?: BackupOptions): Promise<BackupResult> {
    return this.backupManager.backup(options);
  }
  
  // 復原
  async restore(backup: string | BackupInfo): Promise<void> {
    return this.backupManager.restore(backup);
  }
}
```

## 儲存引擎實作

### 基礎儲存引擎
```typescript
abstract class BaseStorageEngine implements StorageEngine {
  protected name: string;
  protected config: any;
  protected isConnected = false;
  
  constructor(name: string, config: any) {
    this.name = name;
    this.config = config;
  }
  
  // 連線
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }
    
    await this.doConnect();
    this.isConnected = true;
  }
  
  // 中斷連線
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }
    
    await this.doDisconnect();
    this.isConnected = false;
  }
  
  // 確保連線
  protected async ensureConnected(): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }
  }
  
  // 抽象方法
  protected abstract doConnect(): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  
  abstract get(key: string): Promise<any>;
  abstract set(key: string, value: any): Promise<void>;
  abstract delete(key: string): Promise<boolean>;
  abstract has(key: string): Promise<boolean>;
  abstract keys(pattern?: string): Promise<string[]>;
  abstract clear(): Promise<void>;
}
```

### 檔案系統儲存
```typescript
class FileStorage extends BaseStorageEngine {
  private basePath: string;
  private encoding: BufferEncoding;
  private locks: Map<string, Promise<void>> = new Map();
  
  constructor(config: FileStorageConfig) {
    super('file', config);
    this.basePath = config.basePath;
    this.encoding = config.encoding || 'utf-8';
  }
  
  protected async doConnect(): Promise<void> {
    // 確保目錄存在
    await fs.mkdir(this.basePath, { recursive: true });
  }
  
  protected async doDisconnect(): Promise<void> {
    // 清空鎖
    this.locks.clear();
  }
  
  async get(key: string): Promise<any> {
    await this.ensureConnected();
    
    const filePath = this.getFilePath(key);
    
    try {
      const data = await fs.readFile(filePath, this.encoding);
      return this.deserialize(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }
  
  async set(key: string, value: any): Promise<void> {
    await this.ensureConnected();
    
    const filePath = this.getFilePath(key);
    const data = this.serialize(value);
    
    // 使用檔案鎖
    await this.withLock(key, async () => {
      // 確保目錄存在
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      
      // 原子性寫入
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, data, this.encoding);
      await fs.rename(tempPath, filePath);
    });
  }
  
  async delete(key: string): Promise<boolean> {
    await this.ensureConnected();
    
    const filePath = this.getFilePath(key);
    
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }
  
  async has(key: string): Promise<boolean> {
    await this.ensureConnected();
    
    const filePath = this.getFilePath(key);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  async keys(pattern?: string): Promise<string[]> {
    await this.ensureConnected();
    
    const keys: string[] = [];
    await this.scanDirectory(this.basePath, '', keys, pattern);
    
    return keys;
  }
  
  // 遞迴掃描目錄
  private async scanDirectory(
    dirPath: string,
    prefix: string,
    keys: string[],
    pattern?: string
  ): Promise<void> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      if (entry.isDirectory()) {
        const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        await this.scanDirectory(fullPath, newPrefix, keys, pattern);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const key = prefix ? 
          `${prefix}/${entry.name.slice(0, -5)}` : 
          entry.name.slice(0, -5);
        
        if (!pattern || this.matchPattern(key, pattern)) {
          keys.push(key);
        }
      }
    }
  }
  
  // 取得檔案路徑
  private getFilePath(key: string): string {
    // 安全路徑處理
    const safePath = key.replace(/\\/g, '/').replace(/\.\.\//g, '');
    return path.join(this.basePath, `${safePath}.json`);
  }
  
  // 檔案鎖
  private async withLock<T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> {
    // 等待現有鎖
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock;
    }
    
    // 建立新鎖
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    
    this.locks.set(key, lockPromise);
    
    try {
      return await fn();
    } finally {
      releaseLock!();
      this.locks.delete(key);
    }
  }
  
  // 序列化
  private serialize(value: any): string {
    return JSON.stringify(value, null, 2);
  }
  
  // 反序列化
  private deserialize(data: string): any {
    return JSON.parse(data);
  }
}
```

### SQLite 儲存
```typescript
import Database from 'better-sqlite3';

class SQLiteStorage extends BaseStorageEngine {
  private db: Database.Database | null = null;
  private tableName: string;
  
  constructor(config: SQLiteStorageConfig) {
    super('sqlite', config);
    this.tableName = config.tableName || 'storage';
  }
  
  protected async doConnect(): Promise<void> {
    this.db = new Database(this.config.path, {
      verbose: this.config.verbose ? console.log : undefined
    });
    
    // 建立表格
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      )
    `);
    
    // 建立索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_updated 
      ON ${this.tableName}(updated_at)
    `);
  }
  
  protected async doDisconnect(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
  
  async get(key: string): Promise<any> {
    await this.ensureConnected();
    
    const stmt = this.db!.prepare(`
      SELECT value, type FROM ${this.tableName} WHERE key = ?
    `);
    
    const row = stmt.get(key) as any;
    
    if (!row) {
      return null;
    }
    
    return this.deserializeValue(row.value, row.type);
  }
  
  async set(key: string, value: any): Promise<void> {
    await this.ensureConnected();
    
    const { serialized, type } = this.serializeValue(value);
    const now = Date.now();
    
    const stmt = this.db!.prepare(`
      INSERT OR REPLACE INTO ${this.tableName} 
      (key, value, type, created_at, updated_at, metadata)
      VALUES (?, ?, ?, 
        COALESCE((SELECT created_at FROM ${this.tableName} WHERE key = ?), ?),
        ?, ?)
    `);
    
    stmt.run(key, serialized, type, key, now, now, null);
  }
  
  async delete(key: string): Promise<boolean> {
    await this.ensureConnected();
    
    const stmt = this.db!.prepare(`
      DELETE FROM ${this.tableName} WHERE key = ?
    `);
    
    const result = stmt.run(key);
    return result.changes > 0;
  }
  
  async has(key: string): Promise<boolean> {
    await this.ensureConnected();
    
    const stmt = this.db!.prepare(`
      SELECT 1 FROM ${this.tableName} WHERE key = ? LIMIT 1
    `);
    
    return stmt.get(key) !== undefined;
  }
  
  async keys(pattern?: string): Promise<string[]> {
    await this.ensureConnected();
    
    let query = `SELECT key FROM ${this.tableName}`;
    const params: any[] = [];
    
    if (pattern) {
      query += ' WHERE key LIKE ?';
      params.push(pattern.replace('*', '%'));
    }
    
    const stmt = this.db!.prepare(query);
    const rows = stmt.all(...params) as any[];
    
    return rows.map(row => row.key);
  }
  
  async clear(): Promise<void> {
    await this.ensureConnected();
    
    this.db!.exec(`DELETE FROM ${this.tableName}`);
  }
  
  // 序列化值
  private serializeValue(value: any): { serialized: string; type: string } {
    if (value === null) {
      return { serialized: 'null', type: 'null' };
    }
    
    if (typeof value === 'boolean') {
      return { serialized: String(value), type: 'boolean' };
    }
    
    if (typeof value === 'number') {
      return { serialized: String(value), type: 'number' };
    }
    
    if (typeof value === 'string') {
      return { serialized: value, type: 'string' };
    }
    
    if (value instanceof Date) {
      return { serialized: value.toISOString(), type: 'date' };
    }
    
    if (Buffer.isBuffer(value)) {
      return { serialized: value.toString('base64'), type: 'buffer' };
    }
    
    return { serialized: JSON.stringify(value), type: 'json' };
  }
  
  // 反序列化值
  private deserializeValue(serialized: string, type: string): any {
    switch (type) {
      case 'null':
        return null;
      case 'boolean':
        return serialized === 'true';
      case 'number':
        return Number(serialized);
      case 'string':
        return serialized;
      case 'date':
        return new Date(serialized);
      case 'buffer':
        return Buffer.from(serialized, 'base64');
      case 'json':
      default:
        return JSON.parse(serialized);
    }
  }
}
```

## 資料模型

### 鍵值儲存
```typescript
class KeyValueStore {
  private engine: StorageEngine;
  private prefix: string;
  
  constructor(engine: StorageEngine, prefix = '') {
    this.engine = engine;
    this.prefix = prefix;
  }
  
  // 取得值
  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    return this.engine.get(fullKey);
  }
  
  // 設定值
  async set<T>(key: string, value: T): Promise<void> {
    const fullKey = this.getFullKey(key);
    return this.engine.set(fullKey, value);
  }
  
  // 刪除值
  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    return this.engine.delete(fullKey);
  }
  
  // 檢查存在
  async has(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    return this.engine.has(fullKey);
  }
  
  // 批次取得
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const promises = keys.map(key => this.get<T>(key));
    return Promise.all(promises);
  }
  
  // 批次設定
  async mset<T>(entries: Array<[string, T]>): Promise<void> {
    const promises = entries.map(([key, value]) => this.set(key, value));
    await Promise.all(promises);
  }
  
  // 列出鍵
  async keys(pattern?: string): Promise<string[]> {
    const fullPattern = this.prefix ? 
      `${this.prefix}/${pattern || '*'}` : 
      pattern;
    
    const keys = await this.engine.keys(fullPattern);
    
    // 移除前綴
    return keys.map(key => 
      this.prefix ? key.substring(this.prefix.length + 1) : key
    );
  }
  
  // 清空
  async clear(): Promise<void> {
    const keys = await this.keys();
    const promises = keys.map(key => this.delete(key));
    await Promise.all(promises);
  }
  
  // 取得完整鍵
  private getFullKey(key: string): string {
    return this.prefix ? `${this.prefix}/${key}` : key;
  }
}
```

### 文件儲存
```typescript
class DocumentStore {
  private kvStore: KeyValueStore;
  private indexManager: IndexManager;
  
  constructor(engine: StorageEngine, collection: string) {
    this.kvStore = new KeyValueStore(engine, `docs/${collection}`);
    this.indexManager = new IndexManager(engine, collection);
  }
  
  // 插入文件
  async insert(doc: Document): Promise<string> {
    const id = doc.id || this.generateId();
    const docWithId = { ...doc, id };
    
    await this.kvStore.set(id, docWithId);
    await this.indexManager.indexDocument(docWithId);
    
    return id;
  }
  
  // 更新文件
  async update(id: string, updates: Partial<Document>): Promise<void> {
    const doc = await this.kvStore.get<Document>(id);
    
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }
    
    const updated = { ...doc, ...updates, id };
    
    await this.kvStore.set(id, updated);
    await this.indexManager.reindexDocument(updated);
  }
  
  // 刪除文件
  async delete(id: string): Promise<boolean> {
    const deleted = await this.kvStore.delete(id);
    
    if (deleted) {
      await this.indexManager.removeDocument(id);
    }
    
    return deleted;
  }
  
  // 查詢文件
  async find(query: Query): Promise<Document[]> {
    const ids = await this.indexManager.search(query);
    const docs = await this.kvStore.mget<Document>(ids);
    
    return docs.filter(doc => doc !== null) as Document[];
  }
  
  // 取得單個文件
  async findOne(query: Query): Promise<Document | null> {
    const docs = await this.find({ ...query, limit: 1 });
    return docs[0] || null;
  }
  
  // 產生 ID
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

## 事務管理

### 事務管理器
```typescript
class TransactionManager {
  private storageManager: StorageManager;
  private activeTransactions: Map<string, Transaction> = new Map();
  
  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }
  
  // 開啟事務
  async begin(): Promise<Transaction> {
    const id = this.generateTransactionId();
    const transaction = new Transaction(id, this.storageManager);
    
    this.activeTransactions.set(id, transaction);
    await transaction.begin();
    
    return transaction;
  }
  
  // 提交事務
  async commit(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    try {
      await transaction.commit();
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }
  
  // 回滾事務
  async rollback(transactionId: string): Promise<void> {
    const transaction = this.activeTransactions.get(transactionId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }
    
    try {
      await transaction.rollback();
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }
  
  // 產生事務 ID
  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 事務實作
```typescript
class Transaction {
  private id: string;
  private storageManager: StorageManager;
  private operations: Operation[] = [];
  private snapshot: Map<string, any> = new Map();
  private status: 'pending' | 'committed' | 'rolled_back' = 'pending';
  
  constructor(id: string, storageManager: StorageManager) {
    this.id = id;
    this.storageManager = storageManager;
  }
  
  // 開始事務
  async begin(): Promise<void> {
    // 記錄開始時間
    this.operations.push({
      type: 'begin',
      timestamp: Date.now()
    });
  }
  
  // 取得值
  async get(key: string): Promise<any> {
    // 檢查本地修改
    const localValue = this.getLocalValue(key);
    if (localValue !== undefined) {
      return localValue;
    }
    
    // 從儲存讀取
    const value = await this.storageManager.getEngine().get(key);
    
    // 記錄快照
    if (!this.snapshot.has(key)) {
      this.snapshot.set(key, value);
    }
    
    return value;
  }
  
  // 設定值
  async set(key: string, value: any): Promise<void> {
    // 記錄快照
    if (!this.snapshot.has(key)) {
      const oldValue = await this.storageManager.getEngine().get(key);
      this.snapshot.set(key, oldValue);
    }
    
    // 記錄操作
    this.operations.push({
      type: 'set',
      key,
      value,
      timestamp: Date.now()
    });
  }
  
  // 刪除值
  async delete(key: string): Promise<void> {
    // 記錄快照
    if (!this.snapshot.has(key)) {
      const oldValue = await this.storageManager.getEngine().get(key);
      this.snapshot.set(key, oldValue);
    }
    
    // 記錄操作
    this.operations.push({
      type: 'delete',
      key,
      timestamp: Date.now()
    });
  }
  
  // 提交事務
  async commit(): Promise<void> {
    if (this.status !== 'pending') {
      throw new Error('Transaction already completed');
    }
    
    const engine = this.storageManager.getEngine();
    
    // 執行所有操作
    for (const op of this.operations) {
      switch (op.type) {
        case 'set':
          await engine.set(op.key!, op.value);
          break;
        case 'delete':
          await engine.delete(op.key!);
          break;
      }
    }
    
    this.status = 'committed';
    
    // 記錄提交
    this.operations.push({
      type: 'commit',
      timestamp: Date.now()
    });
  }
  
  // 回滾事務
  async rollback(): Promise<void> {
    if (this.status !== 'pending') {
      throw new Error('Transaction already completed');
    }
    
    const engine = this.storageManager.getEngine();
    
    // 復原快照
    for (const [key, value] of this.snapshot) {
      if (value === null) {
        await engine.delete(key);
      } else {
        await engine.set(key, value);
      }
    }
    
    this.status = 'rolled_back';
    
    // 記錄回滾
    this.operations.push({
      type: 'rollback',
      timestamp: Date.now()
    });
  }
  
  // 取得本地值
  private getLocalValue(key: string): any {
    // 從後向前查找
    for (let i = this.operations.length - 1; i >= 0; i--) {
      const op = this.operations[i];
      
      if (op.key === key) {
        if (op.type === 'set') {
          return op.value;
        } else if (op.type === 'delete') {
          return null;
        }
      }
    }
    
    return undefined;
  }
}
```

## 備份與復原

### 備份管理器
```typescript
class BackupManager {
  private storageManager: StorageManager;
  private backupPath: string;
  
  constructor(storageManager: StorageManager, backupPath = './backups') {
    this.storageManager = storageManager;
    this.backupPath = backupPath;
  }
  
  // 備份
  async backup(options?: BackupOptions): Promise<BackupResult> {
    const backupId = this.generateBackupId();
    const backupDir = path.join(this.backupPath, backupId);
    
    // 建立備份目錄
    await fs.mkdir(backupDir, { recursive: true });
    
    // 備份元資料
    const metadata: BackupMetadata = {
      id: backupId,
      timestamp: Date.now(),
      engine: options?.engine || 'all',
      compressed: options?.compress || false,
      encrypted: options?.encrypt || false
    };
    
    await fs.writeFile(
      path.join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // 備份資料
    const engines = options?.engine ? 
      [this.storageManager.getEngine(options.engine)] :
      Array.from(this.storageManager['engines'].values());
    
    for (const engine of engines) {
      await this.backupEngine(engine, backupDir, options);
    }
    
    return {
      id: backupId,
      path: backupDir,
      size: await this.calculateBackupSize(backupDir),
      metadata
    };
  }
  
  // 復原
  async restore(backup: string | BackupInfo): Promise<void> {
    const backupDir = typeof backup === 'string' ? 
      backup : backup.path;
    
    // 讀取元資料
    const metadataPath = path.join(backupDir, 'metadata.json');
    const metadata = JSON.parse(
      await fs.readFile(metadataPath, 'utf-8')
    ) as BackupMetadata;
    
    // 復原資料
    const dataFiles = await fs.readdir(backupDir);
    
    for (const file of dataFiles) {
      if (file === 'metadata.json') continue;
      
      const engineName = file.replace('.backup', '');
      const engine = this.storageManager.getEngine(engineName);
      
      await this.restoreEngine(
        engine,
        path.join(backupDir, file),
        metadata
      );
    }
  }
  
  // 備份引擎
  private async backupEngine(
    engine: StorageEngine,
    backupDir: string,
    options?: BackupOptions
  ): Promise<void> {
    const keys = await engine.keys();
    const data: Record<string, any> = {};
    
    // 收集所有資料
    for (const key of keys) {
      data[key] = await engine.get(key);
    }
    
    let content = JSON.stringify(data);
    
    // 壓縮
    if (options?.compress) {
      content = await this.compress(content);
    }
    
    // 加密
    if (options?.encrypt) {
      content = await this.encrypt(content, options.encryptKey!);
    }
    
    // 寫入檔案
    await fs.writeFile(
      path.join(backupDir, `${engine['name']}.backup`),
      content
    );
  }
  
  // 產生備份 ID
  private generateBackupId(): string {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    return `backup_${date}`;
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] 多種儲存引擎支援
- [ ] 事務管理
- [ ] 備份與復原
- [ ] 資料遷移
- [ ] 索引管理

### 可靠性
- [ ] 錯誤重試
- [ ] 資料完整性檢查
- [ ] 原子性操作
- [ ] 並發控制

### 效能
- [ ] 批次操作優化
- [ ] 連線池管理
- [ ] 非同步 I/O
- [ ] 查詢優化

## 疑難排解

### 常見問題

1. **資料不一致**
   - 檢查事務狀態
   - 驗證鎖機制
   - 確認備份完整性

2. **效能瓶頸**
   - 優化索引結構
   - 使用批次操作
   - 啟用連線池

3. **儲存空間不足**
   - 實施資料壓縮
   - 清理過期資料
   - 使用外部儲存

## 未來改進
1. 雲端儲存支援
2. 分散式儲存
3. 加密儲存
4. 時序資料庫支援