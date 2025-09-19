# API 文件

Agent IDE 提供完整的程式設計介面，讓開發者可以將其整合到自己的工具和應用程式中。

## 📚 目錄

- [核心模組 API](#核心模組-api)
  - [IndexEngine](#indexengine)
  - [RenameEngine](#renameengine)
  - [MoveService](#moveservice)
  - [SearchService](#searchservice)
  - [DependencyAnalyzer](#dependencyanalyzer)
- [Parser 系統 API](#parser-系統-api)
  - [ParserRegistry](#parserregistry)
  - [ParserPlugin 介面](#parserplugin-介面)
- [型別定義](#型別定義)
- [錯誤處理](#錯誤處理)
- [使用範例](#使用範例)

## 核心模組 API

### IndexEngine

程式碼索引引擎，負責建立和管理程式碼索引。

#### 建構函式

```typescript
constructor(options?: IndexEngineOptions)
```

#### 介面定義

```typescript
interface IndexEngineOptions {
  cachePath?: string;
  maxCacheSize?: number;
  extensions?: string[];
  excludePatterns?: string[];
}
```

#### 主要方法

##### `createIndex(paths: string[]): Promise<IndexResult>`

建立程式碼索引。

```typescript
const indexEngine = new IndexEngine();
const result = await indexEngine.createIndex(['./src']);

console.log(`已索引 ${result.fileCount} 個檔案`);
console.log(`找到 ${result.symbolCount} 個符號`);
```

**參數：**
- `paths: string[]` - 要索引的路徑陣列

**返回值：**
```typescript
interface IndexResult {
  success: boolean;
  fileCount: number;
  symbolCount: number;
  dependencyCount: number;
  duration: number;
  errors?: IndexError[];
}
```

##### `updateIndex(changedFiles: string[]): Promise<IndexResult>`

增量更新索引。

```typescript
await indexEngine.updateIndex(['./src/modified-file.ts']);
```

##### `searchSymbols(query: SymbolQuery): Promise<Symbol[]>`

搜尋符號。

```typescript
const symbols = await indexEngine.searchSymbols({
  name: 'getUserById',
  type: SymbolType.Function
});
```

##### `getStats(): IndexStats`

獲取索引統計資訊。

```typescript
interface IndexStats {
  fileCount: number;
  symbolCount: number;
  dependencyCount: number;
  lastUpdated: Date;
  cacheSize: number;
}
```

### RenameEngine

智能重新命名引擎。

#### 建構函式

```typescript
constructor(indexEngine: IndexEngine)
```

#### 主要方法

##### `rename(options: RenameOptions): Promise<RenameResult>`

執行重新命名操作。

```typescript
const renameEngine = new RenameEngine(indexEngine);

const result = await renameEngine.rename({
  symbol: targetSymbol,
  newName: 'newFunctionName',
  filePaths: ['./src']
});
```

**參數：**
```typescript
interface RenameOptions {
  symbol: Symbol;
  newName: string;
  filePaths: string[];
  safeMode?: boolean;
  dryRun?: boolean;
}
```

**返回值：**
```typescript
interface RenameResult {
  success: boolean;
  operations: RenameOperation[];
  affectedFiles: string[];
  renameId: string;
  conflicts?: RenameConflict[];
}
```

##### `validateRename(options: RenameOptions): Promise<ValidationResult>`

驗證重新命名的有效性。

```typescript
const validation = await renameEngine.validateRename(options);
if (!validation.isValid) {
  console.log('衝突：', validation.conflicts);
}
```

##### `previewRename(options: RenameOptions): Promise<RenamePreview>`

預覽重新命名操作。

```typescript
const preview = await renameEngine.previewRename(options);
console.log(`將影響 ${preview.affectedFiles.length} 個檔案`);
```

##### `undo(renameId: string): Promise<void>`

撤銷重新命名操作。

```typescript
await renameEngine.undo(result.renameId);
```

### MoveService

檔案移動服務。

#### 建構函式

```typescript
constructor(indexEngine: IndexEngine)
```

#### 主要方法

##### `moveFile(from: string, to: string): Promise<MoveResult>`

移動單一檔案。

```typescript
const moveService = new MoveService(indexEngine);

const result = await moveService.moveFile(
  './src/old/location.ts',
  './src/new/location.ts'
);
```

##### `moveDirectory(from: string, to: string): Promise<MoveResult>`

移動整個目錄。

```typescript
const result = await moveService.moveDirectory(
  './src/components',
  './src/ui/components'
);
```

**返回值：**
```typescript
interface MoveResult {
  success: boolean;
  movedFiles: string[];
  updatedFiles: string[];
  errors?: MoveError[];
}
```

##### `previewMove(from: string, to: string): Promise<MovePreview>`

預覽移動操作。

```typescript
const preview = await moveService.previewMove(from, to);
console.log(`需要更新 ${preview.affectedImports.length} 個 import`);
```

### SearchService

程式碼搜尋服務。

#### 建構函式

```typescript
constructor(options?: SearchServiceOptions)
```

#### 主要方法

##### `searchText(query: TextQuery): Promise<SearchResult>`

文字搜尋。

```typescript
const searchService = new SearchService();

const result = await searchService.searchText({
  query: 'function getUserById',
  paths: ['./src'],
  options: {
    regex: false,
    caseSensitive: true,
    wholeWord: false
  }
});
```

**參數：**
```typescript
interface TextQuery {
  query: string;
  paths: string[];
  options?: TextSearchOptions;
}

interface TextSearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  context?: number;
  maxResults?: number;
}
```

##### `searchSymbol(query: SymbolQuery): Promise<SearchResult>`

符號搜尋。

```typescript
const result = await searchService.searchSymbol({
  name: 'UserService',
  type: SymbolType.Class,
  scope: ScopeType.Module
});
```

##### `searchDependency(query: DependencyQuery): Promise<SearchResult>`

依賴搜尋。

```typescript
const result = await searchService.searchDependency({
  path: './utils',
  type: DependencyType.Import,
  isRelative: true
});
```

**返回值：**
```typescript
interface SearchResult {
  matches: Match[];
  totalCount: number;
  duration: number;
  suggestions?: string[];
}

interface Match {
  file: string;
  line: number;
  column: number;
  content: string;
  context: MatchContext;
  score: number;
  length: number;
  range: Range;
}
```

### DependencyAnalyzer

依賴關係分析器。

#### 建構函式

```typescript
constructor(indexEngine: IndexEngine)
```

#### 主要方法

##### `analyzeDependencies(paths: string[]): Promise<DependencyGraph>`

分析依賴關係。

```typescript
const analyzer = new DependencyAnalyzer(indexEngine);
const graph = await analyzer.analyzeDependencies(['./src']);
```

##### `detectCycles(): CircularDependency[]`

檢測循環依賴。

```typescript
const cycles = analyzer.detectCycles();
cycles.forEach(cycle => {
  console.log('循環依賴：', cycle.files);
});
```

##### `getImpactedFiles(filePath: string): string[]`

獲取檔案變更的影響範圍。

```typescript
const impacted = analyzer.getImpactedFiles('./src/user.ts');
console.log('受影響的檔案：', impacted);
```

##### `optimizeImports(filePath: string): Promise<ImportOptimization[]>`

優化 import 語句。

```typescript
const optimizations = await analyzer.optimizeImports('./src/app.ts');
```

**返回值：**
```typescript
interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: CircularDependency[];
  statistics: DependencyStats;
}

interface CircularDependency {
  files: string[];
  severity: 'warning' | 'error';
  suggestion?: string;
}
```

## Parser 系統 API

### ParserRegistry

Parser 註冊中心，管理所有 Parser 插件。

#### 單例模式

```typescript
const registry = ParserRegistry.getInstance();
```

#### 主要方法

##### `register(plugin: ParserPlugin): void`

註冊 Parser 插件。

```typescript
const tsParser = new TypeScriptParser();
registry.register(tsParser);
```

##### `unregister(pluginName: string): void`

取消註冊 Parser 插件。

```typescript
registry.unregister('typescript');
```

##### `getParser(extension: string): ParserPlugin | null`

根據檔案副檔名獲取 Parser。

```typescript
const parser = registry.getParser('.ts');
if (parser) {
  const ast = await parser.parse(code, filePath);
}
```

##### `getSupportedExtensions(): string[]`

獲取所有支援的檔案副檔名。

```typescript
const extensions = registry.getSupportedExtensions();
console.log('支援的副檔名：', extensions);
```

##### `listParsers(): ParserInfo[]`

列出所有已註冊的 Parser。

```typescript
interface ParserInfo {
  name: string;
  version: string;
  supportedExtensions: string[];
  supportedLanguages: string[];
  enabled: boolean;
}
```

### ParserPlugin 介面

所有 Parser 插件必須實作的介面。

```typescript
interface ParserPlugin {
  // 基本資訊
  readonly name: string;
  readonly version: string;
  readonly supportedExtensions: readonly string[];
  readonly supportedLanguages: readonly string[];
  
  // 核心功能
  parse(code: string, filePath: string): Promise<AST>;
  extractSymbols(ast: AST): Promise<Symbol[]>;
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
  extractDependencies(ast: AST): Promise<Dependency[]>;
  
  // 重構支援
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
  extractFunction?(ast: AST, selection: Range): Promise<CodeEdit[]>;
  
  // 查詢支援
  findDefinition(ast: AST, position: Position): Promise<Definition | null>;
  findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;
  
  // 驗證和清理
  validate(): Promise<ValidationResult>;
  dispose(): Promise<void>;
}
```

#### 實作範例

```typescript
export class MyLanguageParser implements ParserPlugin {
  readonly name = 'my-language';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.my'];
  readonly supportedLanguages = ['mylang'];

  async parse(code: string, filePath: string): Promise<AST> {
    // 實作語法解析邏輯
    const tokens = this.tokenize(code);
    const ast = this.buildAST(tokens);
    return {
      type: 'Program',
      root: ast,
      sourceFile: filePath,
      metadata: { language: 'mylang' }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    // 實作符號提取邏輯
    const symbols: Symbol[] = [];
    this.traverseAST(ast.root, (node) => {
      if (this.isSymbolNode(node)) {
        symbols.push(this.createSymbol(node));
      }
    });
    return symbols;
  }

  // ... 其他方法實作
}
```

## 型別定義

### 核心型別

```typescript
// 位置和範圍
interface Position {
  line: number;
  column: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Location {
  filePath: string;
  range: Range;
}

// 符號
enum SymbolType {
  Variable = 'variable',
  Function = 'function',
  Class = 'class',
  Interface = 'interface',
  Type = 'type',
  Enum = 'enum',
  Namespace = 'namespace',
  Module = 'module'
}

interface Symbol {
  name: string;
  type: SymbolType;
  location: Location;
  scope?: Scope;
  modifiers?: string[];
  documentation?: string;
}

// 依賴
enum DependencyType {
  Import = 'import',
  Require = 'require',
  Include = 'include',
  Reference = 'reference'
}

interface Dependency {
  path: string;
  type: DependencyType;
  isRelative: boolean;
  importedSymbols: string[];
  location: Location;
}

// AST
interface AST {
  type: string;
  root: ASTNode;
  sourceFile: string;
  metadata: ASTMetadata;
}

interface ASTNode {
  type: string;
  start: number;
  end: number;
  children?: ASTNode[];
  [key: string]: any;
}

// 程式碼編輯
interface CodeEdit {
  filePath: string;
  range: Range;
  newText: string;
  oldText?: string;
  editType: 'insert' | 'delete' | 'replace' | 'rename';
}
```

### 查詢型別

```typescript
interface SymbolQuery {
  name?: string;
  type?: SymbolType;
  scope?: ScopeType;
  modifiers?: string[];
  filePath?: string;
}

interface DependencyQuery {
  path?: string;
  type?: DependencyType;
  isRelative?: boolean;
  importedSymbol?: string;
}

interface TextQuery {
  query: string;
  paths: string[];
  options?: TextSearchOptions;
}
```

### 結果型別

```typescript
interface OperationResult {
  success: boolean;
  message?: string;
  errors?: Error[];
  warnings?: Warning[];
}

interface IndexResult extends OperationResult {
  fileCount: number;
  symbolCount: number;
  dependencyCount: number;
  duration: number;
}

interface RenameResult extends OperationResult {
  operations: RenameOperation[];
  affectedFiles: string[];
  renameId: string;
  conflicts?: RenameConflict[];
}

interface SearchResult {
  matches: Match[];
  totalCount: number;
  duration: number;
  suggestions?: string[];
}
```

## 錯誤處理

Agent IDE 使用自定義錯誤類別來提供詳細的錯誤資訊。

### 錯誤基類

```typescript
abstract class AgentIDEError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  
  constructor(message: string, public readonly context?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

### 具體錯誤類別

```typescript
// 解析錯誤
class ParseError extends AgentIDEError {
  readonly code = 'PARSE_ERROR';
  readonly category = ErrorCategory.Parse;
  
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly position?: Position
  ) {
    super(message, { filePath, position });
  }
}

// 索引錯誤
class IndexError extends AgentIDEError {
  readonly code = 'INDEX_ERROR';
  readonly category = ErrorCategory.Index;
}

// 重新命名錯誤
class RenameError extends AgentIDEError {
  readonly code = 'RENAME_ERROR';
  readonly category = ErrorCategory.Rename;
}

// 檔案操作錯誤
class FileOperationError extends AgentIDEError {
  readonly code = 'FILE_OPERATION_ERROR';
  readonly category = ErrorCategory.FileOperation;
}
```

### 錯誤處理範例

```typescript
try {
  const result = await renameEngine.rename(options);
} catch (error) {
  if (error instanceof RenameError) {
    console.error('重新命名失敗：', error.message);
    console.error('錯誤代碼：', error.code);
    console.error('上下文：', error.context);
  } else if (error instanceof ParseError) {
    console.error(`解析錯誤在 ${error.filePath}:${error.position?.line}`);
  } else {
    console.error('未知錯誤：', error);
  }
}
```

## 使用範例

### 基本整合範例

```typescript
import {
  IndexEngine,
  RenameEngine,
  SearchService,
  ParserRegistry,
  TypeScriptParser
} from 'agent-ide';

// 初始化
const registry = ParserRegistry.getInstance();
registry.register(new TypeScriptParser());

const indexEngine = new IndexEngine({
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**']
});

const renameEngine = new RenameEngine(indexEngine);
const searchService = new SearchService();

// 建立索引
await indexEngine.createIndex(['./src']);

// 搜尋符號
const symbols = await indexEngine.searchSymbols({
  name: 'getUserById',
  type: SymbolType.Function
});

if (symbols.length > 0) {
  // 重新命名
  const result = await renameEngine.rename({
    symbol: symbols[0],
    newName: 'fetchUserById',
    filePaths: ['./src']
  });
  
  console.log(`重新命名成功，影響 ${result.affectedFiles.length} 個檔案`);
}
```

### 自定義 Parser 範例

```typescript
import { ParserPlugin, AST, Symbol } from 'agent-ide';

class CustomParser implements ParserPlugin {
  readonly name = 'custom-lang';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.custom'];
  readonly supportedLanguages = ['custom'];

  async parse(code: string, filePath: string): Promise<AST> {
    // 實作自定義語言解析
    return {
      type: 'Program',
      root: this.parseCustomSyntax(code),
      sourceFile: filePath,
      metadata: { parser: this.name }
    };
  }

  async extractSymbols(ast: AST): Promise<Symbol[]> {
    // 提取符號
    return this.findSymbolsInAST(ast);
  }

  // 實作其他必要方法...
}

// 註冊自定義 Parser
const registry = ParserRegistry.getInstance();
registry.register(new CustomParser());
```

### 批次操作範例

```typescript
// 批次重新命名
const operations = [
  { symbol: symbol1, newName: 'newName1', filePaths: ['./src'] },
  { symbol: symbol2, newName: 'newName2', filePaths: ['./src'] },
];

const results = await Promise.all(
  operations.map(op => renameEngine.rename(op))
);

// 批次搜尋
const queries = ['function', 'class', 'interface'];
const searchResults = await Promise.all(
  queries.map(query => searchService.searchText({
    query,
    paths: ['./src'],
    options: { regex: false }
  }))
);
```

### 監聽檔案變更範例

```typescript
import { FileWatcher } from 'agent-ide';

const watcher = new FileWatcher(['./src'], {
  ignore: ['node_modules/**']
});

watcher.on('change', async (filePath) => {
  console.log(`檔案變更：${filePath}`);
  await indexEngine.updateIndex([filePath]);
});

watcher.on('add', async (filePath) => {
  console.log(`新增檔案：${filePath}`);
  await indexEngine.updateIndex([filePath]);
});

watcher.on('unlink', async (filePath) => {
  console.log(`刪除檔案：${filePath}`);
  await indexEngine.removeFromIndex([filePath]);
});

// 開始監聽
await watcher.start();
```

## 效能最佳化

### 快取策略

```typescript
// 設定快取選項
const indexEngine = new IndexEngine({
  cachePath: './cache',
  maxCacheSize: 100 * 1024 * 1024, // 100MB
});

// 清除快取
await indexEngine.clearCache();

// 獲取快取統計
const cacheStats = indexEngine.getCacheStats();
```

### 並行處理

```typescript
// 並行建立多個專案的索引
const projects = ['./project1', './project2', './project3'];

const results = await Promise.all(
  projects.map(project => 
    new IndexEngine().createIndex([project])
  )
);
```

### 增量更新

```typescript
// 監聽檔案變更並增量更新
const changedFiles = await getChangedFiles();
if (changedFiles.length > 0) {
  await indexEngine.updateIndex(changedFiles);
}
```

## 設定選項

### 全域設定

```typescript
import { configure } from 'agent-ide';

configure({
  logLevel: 'info',
  maxWorkers: 4,
  timeout: 30000,
  cacheEnabled: true
});
```

### 模組設定

```typescript
// 索引引擎設定
const indexOptions: IndexEngineOptions = {
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**', '**/*.test.*'],
  maxDepth: 10,
  followSymlinks: false
};

// 搜尋服務設定
const searchOptions: SearchServiceOptions = {
  maxResults: 1000,
  fuzzyThreshold: 0.8,
  rankingEnabled: true
};
```

這份 API 文件涵蓋了 Agent IDE 的所有主要介面和使用方法。如需更詳細的資訊，請參考對應模組的原始碼和測試檔案。