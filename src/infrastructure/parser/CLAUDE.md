# Parser 框架開發規範

## 實作狀態 ✅

### 實際檔案結構
```
parser/
├── index.ts                    ✅ 框架入口
├── base.ts                     ✅ 基礎 Parser 類別
├── factory.ts                  ✅ Parser 工廠
├── interface.ts                ✅ 插件介面定義
├── registry.ts                 ✅ Parser 註冊中心
├── types.ts                    ✅ 型別定義
└── 其他進階功能              ⏳ 待實作
```

### 實作功能狀態
- ✅ Parser 框架核心架構
- ✅ 插件註冊與管理
- ✅ Parser 工廠模式
- ✅ 統一介面定義
- ⏳ 插件動態載入
- ⏳ AST 統一模型
- ⏳ 快取機制

## 模組職責
提供可擴展的 Parser 插件框架，統一不同語言的語法解析介面，管理插件生命週期，確保高效能和可靠性。

## 開發原則

### 1. 插件化架構
- **動態載入**：支援執行時載入插件
- **隔離執行**：插件錯誤不影響框架
- **版本管理**：處理插件版本相容性
- **熱更新**：支援插件熱重載

### 2. 統一介面
- 標準化 AST 模型
- 一致的 API 設計
- 通用錯誤處理
- 統一配置管理

### 3. 效能優先
- 智能快取機制
- 並行解析支援
- 增量解析能力
- 記憶體優化

## 實作規範

### 檔案結構
```
parser/
├── index.ts                 # 框架入口
├── registry.ts              # Parser 註冊中心
├── factory.ts               # Parser 工廠
├── interface.ts             # 插件介面定義
├── loader/
│   ├── plugin-loader.ts        # 插件載入器
│   ├── discovery.ts            # 插件發現
│   ├── validator.ts            # 插件驗證
│   └── sandbox.ts              # 插件沙箱
├── ast/
│   ├── unified-ast.ts          # 統一 AST 模型
│   ├── ast-converter.ts        # AST 轉換器
│   ├── ast-visitor.ts          # AST 訪問器
│   └── ast-transformer.ts      # AST 轉換器
├── cache/
│   ├── parser-cache.ts         # Parser 快取
│   ├── ast-cache.ts            # AST 快取
│   └── cache-strategy.ts       # 快取策略
├── error/
│   ├── error-handler.ts        # 錯誤處理
│   ├── error-recovery.ts       # 錯誤恢復
│   └── error-reporter.ts       # 錯誤報告
└── types.ts                 # 型別定義
```

## 插件管理系統

### 插件註冊中心
```typescript
class ParserRegistry {
  private parsers = new Map<string, ParserPlugin>();
  private metadata = new Map<string, PluginMetadata>();
  private priorities = new Map<string, number>();
  
  // 註冊插件
  register(plugin: ParserPlugin): void {
    // 1. 驗證插件
    this.validatePlugin(plugin);
    
    // 2. 檢查衝突
    this.checkConflicts(plugin);
    
    // 3. 註冊到映射表
    this.parsers.set(plugin.name, plugin);
    
    // 4. 更新擴展名映射
    this.updateExtensionMapping(plugin);
    
    // 5. 初始化插件
    plugin.initialize?.();
  }
  
  // 智能選擇 Parser
  selectParser(file: string): ParserPlugin | null {
    // 1. 按擴展名查找
    const byExtension = this.getParserByExtension(path.extname(file));
    
    // 2. 按內容檢測
    if (!byExtension) {
      const content = fs.readFileSync(file, 'utf8');
      return this.detectParserByContent(content);
    }
    
    // 3. 處理優先級
    if (Array.isArray(byExtension)) {
      return this.selectByPriority(byExtension);
    }
    
    return byExtension;
  }
  
  // 插件生命週期管理
  async unregister(pluginName: string): Promise<void> {
    const plugin = this.parsers.get(pluginName);
    
    if (plugin) {
      // 1. 清理資源
      await plugin.dispose?.();
      
      // 2. 移除註冊
      this.parsers.delete(pluginName);
      
      // 3. 更新映射
      this.removeExtensionMapping(plugin);
      
      // 4. 清理快取
      this.clearPluginCache(pluginName);
    }
  }
}
```

### 插件載入器
```typescript
class PluginLoader {
  private loadedPlugins = new Set<string>();
  private pluginPaths: string[] = [];
  
  // 載入插件
  async loadPlugin(path: string): Promise<ParserPlugin> {
    // 1. 檢查是否已載入
    if (this.loadedPlugins.has(path)) {
      return this.getLoadedPlugin(path);
    }
    
    // 2. 載入插件模組
    const module = await this.loadModule(path);
    
    // 3. 驗證插件介面
    this.validatePluginInterface(module);
    
    // 4. 建立插件實例
    const plugin = this.createPluginInstance(module);
    
    // 5. 初始化插件
    await plugin.initialize?.();
    
    // 6. 記錄載入狀態
    this.loadedPlugins.add(path);
    
    return plugin;
  }
  
  // 自動發現插件
  async discoverPlugins(): Promise<ParserPlugin[]> {
    const plugins: ParserPlugin[] = [];
    
    // 1. 內建插件目錄
    const builtIn = await this.scanDirectory('./src/plugins');
    plugins.push(...builtIn);
    
    // 2. 外部插件目錄
    const external = await this.scanDirectory('./plugins-external');
    plugins.push(...external);
    
    // 3. npm 插件
    const npm = await this.scanNpmPlugins();
    plugins.push(...npm);
    
    // 4. 全域插件
    const global = await this.scanGlobalPlugins();
    plugins.push(...global);
    
    return plugins;
  }
  
  // 插件沙箱執行
  async runInSandbox(plugin: ParserPlugin, code: string): Promise<AST> {
    const sandbox = this.createSandbox(plugin);
    
    try {
      return await sandbox.execute(() => plugin.parse(code));
    } catch (error) {
      this.handleSandboxError(error, plugin);
      throw error;
    } finally {
      sandbox.cleanup();
    }
  }
}
```

## 統一 AST 模型

### AST 設計
```typescript
// 基礎節點介面
interface ASTNode {
  type: string;
  range: Range;
  loc: Location;
  parent?: ASTNode;
  children: ASTNode[];
  
  // 訪問器模式
  accept(visitor: ASTVisitor): void;
  
  // 轉換器模式
  transform(transformer: ASTTransformer): ASTNode;
  
  // 查詢方法
  find(predicate: (node: ASTNode) => boolean): ASTNode | null;
  findAll(predicate: (node: ASTNode) => boolean): ASTNode[];
  
  // 導航方法
  getParent(): ASTNode | null;
  getChildren(): ASTNode[];
  getSiblings(): ASTNode[];
  
  // 工具方法
  clone(): ASTNode;
  equals(other: ASTNode): boolean;
  toString(): string;
}

// AST 根節點
interface AST {
  type: 'Program';
  root: ASTNode;
  sourceFile: string;
  language: string;
  parser: string;
  metadata: ASTMetadata;
  errors: ParseError[];
  comments: Comment[];
  tokens?: Token[];
}

// AST 轉換器
class ASTConverter {
  // 將特定語言的 AST 轉換為統一格式
  toUnified(nativeAST: any, language: string): AST {
    const converter = this.getConverter(language);
    return converter.convert(nativeAST);
  }
  
  // 從統一格式轉回特定語言格式
  fromUnified(ast: AST, language: string): any {
    const converter = this.getConverter(language);
    return converter.reverse(ast);
  }
}
```

### AST 訪問器
```typescript
abstract class ASTVisitor {
  // 訪問節點
  visit(node: ASTNode): void {
    const method = `visit${node.type}`;
    if (this[method]) {
      this[method](node);
    } else {
      this.visitGeneric(node);
    }
    
    // 遞迴訪問子節點
    for (const child of node.children) {
      this.visit(child);
    }
  }
  
  // 通用訪問方法
  protected visitGeneric(node: ASTNode): void {
    // 預設實作
  }
  
  // 特定節點類型的訪問方法
  protected visitFunctionDeclaration?(node: ASTNode): void;
  protected visitClassDeclaration?(node: ASTNode): void;
  protected visitVariableDeclaration?(node: ASTNode): void;
}

// 使用範例
class SymbolCollector extends ASTVisitor {
  symbols: Symbol[] = [];
  
  protected visitFunctionDeclaration(node: ASTNode): void {
    this.symbols.push({
      type: 'function',
      name: node.name,
      location: node.loc
    });
  }
}
```

## 快取系統

### 多層快取架構
```typescript
class ParserCacheSystem {
  private memoryCache: MemoryCache;
  private diskCache: DiskCache;
  private cacheStrategy: CacheStrategy;
  
  // 快取 AST
  async cacheAST(key: string, ast: AST): Promise<void> {
    // 1. 記憶體快取
    this.memoryCache.set(key, ast);
    
    // 2. 序列化到磁碟（異步）
    if (this.shouldPersist(ast)) {
      await this.diskCache.set(key, this.serialize(ast));
    }
    
    // 3. 更新統計
    this.updateStats(key, ast);
  }
  
  // 獲取快取的 AST
  async getCachedAST(key: string): Promise<AST | null> {
    // 1. 檢查記憶體快取
    const memCached = this.memoryCache.get(key);
    if (memCached) {
      this.hit('memory');
      return memCached;
    }
    
    // 2. 檢查磁碟快取
    const diskCached = await this.diskCache.get(key);
    if (diskCached) {
      this.hit('disk');
      const ast = this.deserialize(diskCached);
      
      // 提升到記憶體快取
      this.memoryCache.set(key, ast);
      
      return ast;
    }
    
    this.miss();
    return null;
  }
  
  // 快取失效策略
  invalidate(pattern: string): void {
    // 1. 找出匹配的快取項
    const keys = this.findMatchingKeys(pattern);
    
    // 2. 清理記憶體快取
    for (const key of keys) {
      this.memoryCache.delete(key);
    }
    
    // 3. 清理磁碟快取
    this.diskCache.deleteMany(keys);
    
    // 4. 更新索引
    this.updateIndex(keys);
  }
}
```

### 增量解析
```typescript
class IncrementalParser {
  private previousAST: AST | null = null;
  private editHistory: Edit[] = [];
  
  // 增量解析
  async parseIncremental(
    content: string,
    edits: Edit[],
    parser: ParserPlugin
  ): Promise<AST> {
    // 1. 如果沒有先前的 AST，執行完整解析
    if (!this.previousAST) {
      this.previousAST = await parser.parse(content);
      return this.previousAST;
    }
    
    // 2. 應用編輯到 AST
    let ast = this.previousAST;
    for (const edit of edits) {
      ast = await this.applyEdit(ast, edit, parser);
    }
    
    // 3. 驗證 AST 完整性
    if (!this.validateAST(ast)) {
      // 降級到完整解析
      ast = await parser.parse(content);
    }
    
    // 4. 更新快取
    this.previousAST = ast;
    this.editHistory.push(...edits);
    
    return ast;
  }
  
  // 應用單個編輯
  private async applyEdit(
    ast: AST,
    edit: Edit,
    parser: ParserPlugin
  ): Promise<AST> {
    // 1. 找出受影響的節點
    const affected = this.findAffectedNodes(ast, edit.range);
    
    // 2. 重新解析受影響的部分
    const reparsed = await parser.parseFragment(
      edit.text,
      affected[0].parent
    );
    
    // 3. 替換 AST 節點
    return this.replaceNodes(ast, affected, reparsed);
  }
}
```

## 錯誤處理

### 錯誤恢復機制
```typescript
class ErrorRecoverySystem {
  // 容錯解析
  async parseWithRecovery(
    content: string,
    parser: ParserPlugin
  ): Promise<AST> {
    try {
      // 1. 嘗試正常解析
      return await parser.parse(content);
    } catch (error) {
      // 2. 進入恢復模式
      return await this.recoverFromError(content, error, parser);
    }
  }
  
  // 錯誤恢復策略
  private async recoverFromError(
    content: string,
    error: ParseError,
    parser: ParserPlugin
  ): Promise<AST> {
    // 策略 1: 部分解析
    if (error.type === 'SyntaxError') {
      return await this.partialParse(content, error.location, parser);
    }
    
    // 策略 2: 降級解析
    if (parser.fallbackParser) {
      return await parser.fallbackParser.parse(content);
    }
    
    // 策略 3: 最小 AST
    return this.createMinimalAST(content, error);
  }
  
  // 部分解析
  private async partialParse(
    content: string,
    errorLocation: Location,
    parser: ParserPlugin
  ): Promise<AST> {
    // 1. 分割內容
    const before = content.slice(0, errorLocation.start);
    const after = content.slice(errorLocation.end);
    
    // 2. 分別解析
    const beforeAST = await parser.parse(before);
    const afterAST = await parser.parse(after);
    
    // 3. 合併 AST
    return this.mergeASTs(beforeAST, afterAST, errorLocation);
  }
}
```

## 效能監控

### 效能指標收集
```typescript
class PerformanceMonitor {
  private metrics: Map<string, Metric[]> = new Map();
  
  // 記錄解析效能
  recordParsing(
    parser: string,
    file: string,
    duration: number,
    astSize: number
  ): void {
    const metric: Metric = {
      timestamp: Date.now(),
      parser,
      file,
      duration,
      astSize,
      throughput: astSize / duration
    };
    
    this.addMetric('parsing', metric);
    
    // 檢查效能閾值
    if (duration > this.threshold) {
      this.reportSlowParsing(metric);
    }
  }
  
  // 生成效能報告
  generateReport(): PerformanceReport {
    return {
      averageParseTime: this.calculateAverage('duration'),
      p95ParseTime: this.calculatePercentile('duration', 95),
      cacheHitRate: this.calculateCacheHitRate(),
      memoryUsage: this.getMemoryUsage(),
      topSlowFiles: this.getTopSlowFiles(10)
    };
  }
}
```

## 開發檢查清單

### 框架完整性
- [ ] 插件載入機制
- [ ] 統一 AST 模型
- [ ] 快取系統完善
- [ ] 錯誤處理健全
- [ ] 效能監控完整

### 插件支援
- [ ] 版本管理
- [ ] 熱重載
- [ ] 沙箱隔離
- [ ] 配置管理

## 疑難排解

### 常見問題

1. **插件載入失敗**
   - 檢查插件路徑
   - 驗證插件介面
   - 查看版本相容性

2. **解析效能問題**
   - 啟用快取
   - 使用增量解析
   - 調整並行度

3. **記憶體洩漏**
   - 檢查快取大小
   - 清理未使用插件
   - 優化 AST 結構

## 未來改進
1. WebAssembly 插件支援
2. 分散式解析
3. AI 輔助錯誤恢復
4. 自適應快取策略