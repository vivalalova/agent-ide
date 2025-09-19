# Cache 基礎設施開發規範

## 模組職責
提供統一、高效的快取機制，支援多層快取架構，優化系統效能，減少重複計算和 I/O 操作。

## 開發原則

### 1. 多層架構
- **L1 記憶體快取**：最快速存取
- **L2 磁碟快取**：持久化存儲
- **L3 分散式快取**：可擴展性
- **智能提升**：熱資料自動提升

### 2. 快取策略
- LRU (Least Recently Used)
- LFU (Least Frequently Used)
- TTL (Time To Live)
- 自適應策略

### 3. 一致性保證
- 快取失效機制
- 版本控制
- 事件通知
- 事務支援

## 實作規範

### 檔案結構
```
cache/
├── index.ts                 # 快取入口
├── cache-manager.ts         # 快取管理器
├── layers/
│   ├── memory-cache.ts         # 記憶體快取
│   ├── disk-cache.ts           # 磁碟快取
│   ├── redis-cache.ts          # Redis 快取
│   └── hybrid-cache.ts         # 混合快取
├── strategies/
│   ├── lru-strategy.ts         # LRU 策略
│   ├── lfu-strategy.ts         # LFU 策略
│   ├── ttl-strategy.ts         # TTL 策略
│   └── adaptive-strategy.ts    # 自適應策略
├── invalidation/
│   ├── invalidator.ts          # 失效管理器
│   ├── dependency-tracker.ts   # 依賴追蹤
│   └── event-bus.ts            # 事件匯流排
├── serialization/
│   ├── serializer.ts           # 序列化器
│   ├── compressor.ts           # 壓縮器
│   └── encoder.ts              # 編碼器
└── types.ts                 # 型別定義
```

## 快取管理器

### 主管理器
```typescript
class CacheManager {
  private layers: CacheLayer[] = [];
  private strategies: Map<string, CacheStrategy> = new Map();
  private invalidator: Invalidator;
  private metrics: CacheMetrics;
  
  constructor(config: CacheConfig) {
    this.setupLayers(config);
    this.setupStrategies(config);
    this.invalidator = new Invalidator();
    this.metrics = new CacheMetrics();
  }
  
  // 取得快取
  async get<T>(key: string, options?: GetOptions): Promise<T | null> {
    const startTime = Date.now();
    
    // 逐層查找
    for (const layer of this.layers) {
      const value = await layer.get<T>(key);
      
      if (value !== null) {
        this.metrics.recordHit(layer.name, Date.now() - startTime);
        
        // 提升到上層
        await this.promote(key, value, layer);
        
        return value;
      }
    }
    
    this.metrics.recordMiss(Date.now() - startTime);
    return null;
  }
  
  // 設定快取
  async set<T>(
    key: string,
    value: T,
    options?: SetOptions
  ): Promise<void> {
    const strategy = this.getStrategy(options?.strategy);
    const ttl = options?.ttl || strategy.getDefaultTTL();
    
    // 寫入所有層
    const promises = this.layers.map(layer => 
      layer.set(key, value, { ttl, metadata: options?.metadata })
    );
    
    await Promise.all(promises);
    
    // 註冊依賴
    if (options?.dependencies) {
      this.invalidator.registerDependencies(key, options.dependencies);
    }
  }
  
  // 失效快取
  async invalidate(pattern: string | RegExp): Promise<number> {
    const keys = await this.findKeys(pattern);
    let invalidated = 0;
    
    for (const key of keys) {
      // 失效所有層
      await Promise.all(
        this.layers.map(layer => layer.delete(key))
      );
      
      // 失效依賴
      await this.invalidator.invalidateDependents(key);
      
      invalidated++;
    }
    
    return invalidated;
  }
  
  // 提升資料到上層
  private async promote<T>(
    key: string,
    value: T,
    currentLayer: CacheLayer
  ): Promise<void> {
    const currentIndex = this.layers.indexOf(currentLayer);
    
    // 提升到所有上層
    for (let i = 0; i < currentIndex; i++) {
      await this.layers[i].set(key, value);
    }
  }
}
```

## 快取層實作

### 記憶體快取
```typescript
class MemoryCache implements CacheLayer {
  name = 'memory';
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private strategy: CacheStrategy;
  
  constructor(config: MemoryCacheConfig) {
    this.maxSize = config.maxSize || 1000;
    this.strategy = config.strategy || new LRUStrategy();
  }
  
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // 檢查 TTL
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return null;
    }
    
    // 更新存取時間
    entry.lastAccess = Date.now();
    entry.accessCount++;
    
    return entry.value as T;
  }
  
  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    // 檢查容量
    if (this.cache.size >= this.maxSize) {
      await this.evict();
    }
    
    const entry: CacheEntry = {
      key,
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      accessCount: 1,
      ttl: options?.ttl,
      size: this.calculateSize(value),
      metadata: options?.metadata
    };
    
    this.cache.set(key, entry);
  }
  
  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }
  
  // 淘汰算法
  private async evict(): Promise<void> {
    const victimKey = this.strategy.selectVictim(
      Array.from(this.cache.values())
    );
    
    if (victimKey) {
      this.cache.delete(victimKey);
    }
  }
  
  // 計算物件大小
  private calculateSize(value: any): number {
    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }
    
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    
    // 估算 JSON 大小
    return JSON.stringify(value).length * 2;
  }
}
```

### 磁碟快取
```typescript
class DiskCache implements CacheLayer {
  name = 'disk';
  private basePath: string;
  private index: Map<string, DiskCacheMetadata>;
  private serializer: Serializer;
  private compressor: Compressor;
  
  constructor(config: DiskCacheConfig) {
    this.basePath = config.basePath;
    this.serializer = new Serializer();
    this.compressor = new Compressor();
    this.index = new Map();
    
    this.loadIndex();
  }
  
  async get<T>(key: string): Promise<T | null> {
    const metadata = this.index.get(key);
    
    if (!metadata) {
      return null;
    }
    
    // 檢查 TTL
    if (this.isExpired(metadata)) {
      await this.delete(key);
      return null;
    }
    
    try {
      // 讀取檔案
      const filePath = this.getFilePath(key);
      const compressed = await fs.readFile(filePath);
      
      // 解壓縮
      const data = await this.compressor.decompress(compressed);
      
      // 反序列化
      const value = this.serializer.deserialize<T>(data);
      
      // 更新存取時間
      metadata.lastAccess = Date.now();
      metadata.accessCount++;
      
      return value;
    } catch (error) {
      // 檔案可能損壞
      await this.delete(key);
      return null;
    }
  }
  
  async set<T>(key: string, value: T, options?: SetOptions): Promise<void> {
    // 序列化
    const data = this.serializer.serialize(value);
    
    // 壓縮
    const compressed = await this.compressor.compress(data);
    
    // 寫入檔案
    const filePath = this.getFilePath(key);
    await this.ensureDirectory(path.dirname(filePath));
    await fs.writeFile(filePath, compressed);
    
    // 更新索引
    const metadata: DiskCacheMetadata = {
      key,
      filePath,
      size: compressed.length,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      accessCount: 1,
      ttl: options?.ttl,
      compressed: true
    };
    
    this.index.set(key, metadata);
    await this.saveIndex();
  }
  
  // 生成檔案路徑
  private getFilePath(key: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const dir1 = hash.substring(0, 2);
    const dir2 = hash.substring(2, 4);
    return path.join(this.basePath, dir1, dir2, hash);
  }
}
```

## 快取策略

### LRU 策略
```typescript
class LRUStrategy implements CacheStrategy {
  name = 'lru';
  
  // 選擇淘汰對象
  selectVictim(entries: CacheEntry[]): string | null {
    if (entries.length === 0) {
      return null;
    }
    
    // 找出最久未使用的
    let oldest = entries[0];
    for (const entry of entries) {
      if (entry.lastAccess < oldest.lastAccess) {
        oldest = entry;
      }
    }
    
    return oldest.key;
  }
  
  // 計算優先級
  calculatePriority(entry: CacheEntry): number {
    const age = Date.now() - entry.lastAccess;
    return -age; // 越新優先級越高
  }
  
  // 預設 TTL
  getDefaultTTL(): number {
    return 3600 * 1000; // 1 小時
  }
}
```

### LFU 策略
```typescript
class LFUStrategy implements CacheStrategy {
  name = 'lfu';
  private decayRate = 0.99;
  
  // 選擇淘汰對象
  selectVictim(entries: CacheEntry[]): string | null {
    if (entries.length === 0) {
      return null;
    }
    
    // 找出使用頻率最低的
    let leastFrequent = entries[0];
    for (const entry of entries) {
      const frequency = this.calculateFrequency(entry);
      const currentFrequency = this.calculateFrequency(leastFrequent);
      
      if (frequency < currentFrequency) {
        leastFrequent = entry;
      }
    }
    
    return leastFrequent.key;
  }
  
  // 計算使用頻率（考慮衰減）
  private calculateFrequency(entry: CacheEntry): number {
    const age = Date.now() - entry.createdAt;
    const decayFactor = Math.pow(this.decayRate, age / 1000);
    return entry.accessCount * decayFactor;
  }
}
```

### 自適應策略
```typescript
class AdaptiveStrategy implements CacheStrategy {
  name = 'adaptive';
  private strategies: CacheStrategy[];
  private weights: Map<string, number>;
  private performance: Map<string, PerformanceMetrics>;
  
  constructor() {
    this.strategies = [
      new LRUStrategy(),
      new LFUStrategy(),
      new TTLStrategy()
    ];
    
    this.weights = new Map();
    this.performance = new Map();
    
    // 初始化權重
    for (const strategy of this.strategies) {
      this.weights.set(strategy.name, 1 / this.strategies.length);
      this.performance.set(strategy.name, {
        hits: 0,
        misses: 0,
        evictions: 0
      });
    }
  }
  
  // 動態選擇策略
  selectVictim(entries: CacheEntry[]): string | null {
    // 根據權重選擇策略
    const strategy = this.selectStrategy();
    const victim = strategy.selectVictim(entries);
    
    // 更新效能指標
    if (victim) {
      const metrics = this.performance.get(strategy.name)!;
      metrics.evictions++;
    }
    
    // 調整權重
    this.adjustWeights();
    
    return victim;
  }
  
  // 選擇策略
  private selectStrategy(): CacheStrategy {
    const random = Math.random();
    let cumulative = 0;
    
    for (const strategy of this.strategies) {
      cumulative += this.weights.get(strategy.name) || 0;
      if (random < cumulative) {
        return strategy;
      }
    }
    
    return this.strategies[0];
  }
  
  // 調整權重
  private adjustWeights(): void {
    // 計算命中率
    const hitRates = new Map<string, number>();
    
    for (const [name, metrics] of this.performance) {
      const total = metrics.hits + metrics.misses;
      const hitRate = total > 0 ? metrics.hits / total : 0;
      hitRates.set(name, hitRate);
    }
    
    // 正規化權重
    const totalHitRate = Array.from(hitRates.values()).reduce((a, b) => a + b, 0);
    
    if (totalHitRate > 0) {
      for (const [name, hitRate] of hitRates) {
        this.weights.set(name, hitRate / totalHitRate);
      }
    }
  }
}
```

## 失效管理

### 失效管理器
```typescript
class Invalidator {
  private dependencies = new Map<string, Set<string>>();
  private dependents = new Map<string, Set<string>>();
  private eventBus: EventBus;
  
  constructor() {
    this.eventBus = new EventBus();
  }
  
  // 註冊依賴
  registerDependencies(key: string, dependencies: string[]): void {
    // 記錄依賴關係
    if (!this.dependencies.has(key)) {
      this.dependencies.set(key, new Set());
    }
    
    for (const dep of dependencies) {
      this.dependencies.get(key)!.add(dep);
      
      // 反向記錄
      if (!this.dependents.has(dep)) {
        this.dependents.set(dep, new Set());
      }
      this.dependents.get(dep)!.add(key);
    }
  }
  
  // 失效依賴者
  async invalidateDependents(key: string): Promise<void> {
    const dependents = this.dependents.get(key);
    
    if (!dependents) {
      return;
    }
    
    // 遞迴失效
    for (const dependent of dependents) {
      await this.invalidate(dependent);
    }
  }
  
  // 失效單個鍵
  private async invalidate(key: string): Promise<void> {
    // 發送失效事件
    await this.eventBus.emit('cache:invalidate', { key });
    
    // 清理依賴關係
    this.dependencies.delete(key);
    
    // 遞迴失效依賴者
    await this.invalidateDependents(key);
  }
}
```

### 事件匯流排
```typescript
class EventBus {
  private listeners = new Map<string, Set<EventListener>>();
  
  // 訂閱事件
  on(event: string, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(listener);
    
    // 返回取消訂閱函數
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }
  
  // 發送事件
  async emit(event: string, data: any): Promise<void> {
    const listeners = this.listeners.get(event);
    
    if (!listeners) {
      return;
    }
    
    const promises = Array.from(listeners).map(listener => 
      Promise.resolve(listener(data))
    );
    
    await Promise.all(promises);
  }
}
```

## 序列化

### 序列化器
```typescript
class Serializer {
  // 序列化
  serialize(value: any): Buffer {
    if (Buffer.isBuffer(value)) {
      return value;
    }
    
    if (typeof value === 'string') {
      return Buffer.from(value, 'utf-8');
    }
    
    // JSON 序列化
    const json = JSON.stringify(value, this.replacer);
    return Buffer.from(json, 'utf-8');
  }
  
  // 反序列化
  deserialize<T>(data: Buffer): T {
    const str = data.toString('utf-8');
    
    try {
      return JSON.parse(str, this.reviver) as T;
    } catch {
      // 可能是原始字串
      return str as unknown as T;
    }
  }
  
  // JSON replacer
  private replacer(key: string, value: any): any {
    // 處理特殊類型
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    
    if (value instanceof RegExp) {
      return { __type: 'RegExp', source: value.source, flags: value.flags };
    }
    
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    
    if (value instanceof Set) {
      return { __type: 'Set', values: Array.from(value.values()) };
    }
    
    return value;
  }
  
  // JSON reviver
  private reviver(key: string, value: any): any {
    if (value && value.__type) {
      switch (value.__type) {
        case 'Date':
          return new Date(value.value);
        case 'RegExp':
          return new RegExp(value.source, value.flags);
        case 'Map':
          return new Map(value.entries);
        case 'Set':
          return new Set(value.values);
      }
    }
    
    return value;
  }
}
```

### 壓縮器
```typescript
import * as zlib from 'zlib';
import { promisify } from 'util';

class Compressor {
  private gzip = promisify(zlib.gzip);
  private gunzip = promisify(zlib.gunzip);
  private brotli = promisify(zlib.brotliCompress);
  private unbrotli = promisify(zlib.brotliDecompress);
  
  // 壓縮
  async compress(data: Buffer, algorithm: 'gzip' | 'brotli' = 'gzip'): Promise<Buffer> {
    if (data.length < 1024) {
      // 小檔案不壓縮
      return data;
    }
    
    switch (algorithm) {
      case 'brotli':
        return this.brotli(data);
      case 'gzip':
      default:
        return this.gzip(data);
    }
  }
  
  // 解壓縮
  async decompress(data: Buffer): Promise<Buffer> {
    // 檢測壓縮格式
    if (this.isGzip(data)) {
      return this.gunzip(data);
    }
    
    if (this.isBrotli(data)) {
      return this.unbrotli(data);
    }
    
    // 未壓縮
    return data;
  }
  
  // 檢測 Gzip
  private isGzip(data: Buffer): boolean {
    return data[0] === 0x1f && data[1] === 0x8b;
  }
  
  // 檢測 Brotli
  private isBrotli(data: Buffer): boolean {
    return data[0] === 0xce && data[1] === 0xb2;
  }
}
```

## 效能監控

### 快取指標
```typescript
class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private hitLatency: number[] = [];
  private missLatency: number[] = [];
  
  // 記錄命中
  recordHit(layer: string, latency: number): void {
    this.hits++;
    this.hitLatency.push(latency);
    
    // 保留最近 1000 筆
    if (this.hitLatency.length > 1000) {
      this.hitLatency.shift();
    }
  }
  
  // 記錄未命中
  recordMiss(latency: number): void {
    this.misses++;
    this.missLatency.push(latency);
    
    if (this.missLatency.length > 1000) {
      this.missLatency.shift();
    }
  }
  
  // 取得統計
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
      avgHitLatency: this.average(this.hitLatency),
      avgMissLatency: this.average(this.missLatency),
      p95HitLatency: this.percentile(this.hitLatency, 95),
      p95MissLatency: this.percentile(this.missLatency, 95)
    };
  }
  
  // 計算平均值
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  
  // 計算百分位數
  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    
    return sorted[index];
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] 多層快取架構
- [ ] 多種快取策略
- [ ] 失效機制完善
- [ ] 依賴追蹤
- [ ] 事件通知

### 效能要求
- [ ] 記憶體快取 < 1ms
- [ ] 磁碟快取 < 10ms
- [ ] 命中率 > 80%
- [ ] 並行處理支援

### 可靠性
- [ ] 錯誤復原
- [ ] 資料一致性
- [ ] 過期檢查
- [ ] 容量限制

## 疑難排解

### 常見問題

1. **快取未命中**
   - 檢查鍵值格式
   - 驗證 TTL 設定
   - 確認失效策略

2. **記憶體溢出**
   - 調整快取大小
   - 優化淘汰策略
   - 使用磁碟快取

3. **效能下降**
   - 檢查序列化效率
   - 優化壓縮設定
   - 使用非同步 I/O

## 未來改進
1. 分散式快取支援
2. 智能預熱機制
3. 機器學習策略優化
4. 即時監控儀表板