# API 文件

Agent IDE 提供完整的程式設計介面，支援索引、搜尋、重構、依賴分析等功能。

## 核心模組

### IndexEngine - 程式碼索引

```typescript
const indexEngine = new IndexEngine({
  extensions: ['.ts', '.tsx', '.js', '.jsx'],
  excludePatterns: ['node_modules/**', 'dist/**']
});

// 建立索引
const result = await indexEngine.createIndex(['./src']);
// => { fileCount, symbolCount, dependencyCount, duration }

// 增量更新
await indexEngine.updateIndex(['./src/modified-file.ts']);

// 搜尋符號
const symbols = await indexEngine.searchSymbols({
  name: 'getUserById',
  type: SymbolType.Function
});
```

### RenameEngine - 智能重新命名

```typescript
const renameEngine = new RenameEngine(indexEngine);

// 重新命名（預覽）
const preview = await renameEngine.previewRename({
  symbol: targetSymbol,
  newName: 'newFunctionName',
  filePaths: ['./src'],
  dryRun: true
});

// 執行重新命名
const result = await renameEngine.rename({
  symbol: targetSymbol,
  newName: 'newFunctionName',
  filePaths: ['./src']
});
// => { success, operations, affectedFiles, renameId, conflicts? }

// 撤銷
await renameEngine.undo(result.renameId);
```

### MoveService - 檔案移動

```typescript
const moveService = new MoveService(indexEngine);

// 移動檔案並更新 import
const result = await moveService.moveFile(
  './src/old/location.ts',
  './src/new/location.ts'
);
// => { success, movedFiles, updatedFiles, errors? }

// 預覽移動
const preview = await moveService.previewMove(from, to);
```

### SearchService - 程式碼搜尋

```typescript
const searchService = new SearchService();

// 文字搜尋
const result = await searchService.searchText({
  query: 'function getUserById',
  paths: ['./src'],
  options: {
    regex: false,
    caseSensitive: true,
    maxResults: 100
  }
});
// => { matches, totalCount, duration, suggestions? }

// 符號搜尋
const symbolResults = await searchService.searchSymbol({
  name: 'UserService',
  type: SymbolType.Class
});
```

### DependencyAnalyzer - 依賴分析

```typescript
const analyzer = new DependencyAnalyzer(indexEngine);

// 分析依賴
const graph = await analyzer.analyzeDependencies(['./src']);
// => { nodes, edges, cycles, statistics }

// 檢測循環依賴
const cycles = analyzer.detectCycles();

// 影響範圍分析
const impacted = analyzer.getImpactedFiles('./src/user.ts');
```

## Parser 系統

### ParserRegistry - Parser 管理

```typescript
const registry = ParserRegistry.getInstance();

// 註冊 Parser
registry.register(new TypeScriptParser());
registry.register(new JavaScriptParser());

// 取得 Parser
const parser = registry.getParser('.ts');
if (parser) {
  const ast = await parser.parse(code, filePath);
}

// 列出支援的副檔名
const extensions = registry.getSupportedExtensions();
```

### ParserPlugin 介面

```typescript
interface ParserPlugin {
  readonly name: string;
  readonly version: string;
  readonly supportedExtensions: string[];
  readonly supportedLanguages: string[];

  parse(code: string, filePath: string): Promise<AST>;
  extractSymbols(ast: AST): Promise<Symbol[]>;
  findReferences(ast: AST, symbol: Symbol): Promise<Reference[]>;
  extractDependencies(ast: AST): Promise<Dependency[]>;
  rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]>;
  findDefinition(ast: AST, position: Position): Promise<Definition | null>;
  findUsages(ast: AST, symbol: Symbol): Promise<Usage[]>;
  validate(): Promise<ValidationResult>;
  dispose(): Promise<void>;
}
```

### 自定義 Parser 範例

```typescript
export class MyLanguageParser implements ParserPlugin {
  readonly name = 'my-language';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.my'];
  readonly supportedLanguages = ['mylang'];

  async parse(code: string, filePath: string): Promise<AST> {
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

// 註冊
const registry = ParserRegistry.getInstance();
registry.register(new MyLanguageParser());
```

## 核心型別

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
  Enum = 'enum'
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

// 程式碼編輯
interface CodeEdit {
  filePath: string;
  range: Range;
  newText: string;
  oldText?: string;
  editType: 'insert' | 'delete' | 'replace' | 'rename';
}
```

## 錯誤處理

```typescript
// 自定義錯誤基類
abstract class AgentIDEError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;

  constructor(message: string, public readonly context?: any) {
    super(message);
    this.name = this.constructor.name;
  }
}

// 具體錯誤類別
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

class RenameError extends AgentIDEError {
  readonly code = 'RENAME_ERROR';
  readonly category = ErrorCategory.Rename;
}

// 錯誤處理
try {
  const result = await renameEngine.rename(options);
} catch (error) {
  if (error instanceof RenameError) {
    console.error('重新命名失敗：', error.message);
    console.error('錯誤代碼：', error.code);
    console.error('上下文：', error.context);
  } else if (error instanceof ParseError) {
    console.error(`解析錯誤在 ${error.filePath}:${error.position?.line}`);
  }
}
```

## 完整範例

```typescript
import {
  IndexEngine,
  RenameEngine,
  SearchService,
  ParserRegistry,
  TypeScriptParser,
  SymbolType
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
  // 預覽重新命名
  const preview = await renameEngine.previewRename({
    symbol: symbols[0],
    newName: 'fetchUserById',
    filePaths: ['./src'],
    dryRun: true
  });

  console.log(`將影響 ${preview.affectedFiles.length} 個檔案`);

  // 執行重新命名
  const result = await renameEngine.rename({
    symbol: symbols[0],
    newName: 'fetchUserById',
    filePaths: ['./src']
  });

  console.log(`重新命名成功，影響 ${result.affectedFiles.length} 個檔案`);
}
```

## 效能優化

```typescript
// 快取設定
const indexEngine = new IndexEngine({
  cachePath: './cache',
  maxCacheSize: 100 * 1024 * 1024 // 100MB
});

// 並行處理
const projects = ['./project1', './project2', './project3'];
const results = await Promise.all(
  projects.map(project => new IndexEngine().createIndex([project]))
);

// 增量更新
const changedFiles = await getChangedFiles();
if (changedFiles.length > 0) {
  await indexEngine.updateIndex(changedFiles);
}
```

完整 API 參考請查看對應模組的原始碼和測試檔案。
