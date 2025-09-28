# Swift Parser 插件開發規範

## 實作狀態 ⏳

### 實際檔案結構
```
swift/
├── index.ts (如需要)           ⏳ 插件入口
├── parser.ts (如需要)          ⏳ 主要 Parser 實作
├── symbol-extractor.ts (如需要)  ⏳ 符號提取器
├── dependency-analyzer.ts (如需要) ⏳ 依賴分析器
└── types.ts (如需要)            ⏳ 型別定義
```

### 實作功能狀態
- ⏳ 基本 Swift 解析功能
- ⏳ SwiftUI DSL 支援
- ⏳ Async/Await 支援
- ⏳ Property Wrappers 支援
- ⏳ 符號提取與索引
- ⏳ 依賴關係分析
- ⏳ 增量解析支援

## 模組職責
使用 tree-sitter-swift 提供高效的 Swift 語法解析，支援最新 Swift 語言特性，轉換為框架統一 AST 格式。

## 核心開發原則

### 1. Tree-sitter 優勢
- **高效能**：增量解析和錯誤復原
- **跨平台**：支援 Node.js 和瀏覽器
- **統一 API**：一致的查詢和遍歷介面
- **容錯性**：部分錯誤不影響整體解析

### 2. Swift 特性支援
- Swift 5.x 完整語法
- SwiftUI DSL
- Property Wrappers
- Result Builders
- Async/Await
- Actors
- Macros

### 3. 效能考量
- 增量解析優先
- 查詢結果快取
- 並行處理大檔案
- 記憶體效率管理

### 4. 語言特性處理
- 完整的泛型支援
- Protocol-oriented 程式設計
- Optional 類型處理
- Closures 和高階函數

### 5. 錯誤處理策略
- 語法錯誤容忍
- 部分解析支援
- 錯誤定位精確
- 漸進式修復

## 實作檔案

### 核心架構
```
swift/
├── index.ts                 # 插件入口
├── plugin.ts                # SwiftParserPlugin 實作
├── tree-sitter/
│   ├── parser-wrapper.ts       # Tree-sitter 封裝
│   ├── language-loader.ts      # 語言載入器
│   ├── query-builder.ts        # 查詢建造器
│   └── incremental.ts          # 增量解析
├── ast/
│   ├── converter.ts            # AST 轉換器
│   ├── node-types.ts           # Swift 節點類型
│   ├── traverser.ts            # AST 遍歷器
│   └── symbol-table.ts         # 符號表建構
├── features/
│   ├── swiftui-handler.ts      # SwiftUI 處理
│   ├── async-analyzer.ts       # Async/Await 分析
│   ├── protocol-resolver.ts    # Protocol 解析
│   ├── generic-extractor.ts    # 泛型提取
│   └── macro-processor.ts      # Macro 處理
├── queries/
│   ├── declarations.scm        # 宣告查詢
│   ├── references.scm          # 引用查詢
│   ├── highlights.scm          # 語法高亮
│   └── patterns.scm            # 模式匹配
└── types.ts                 # 型別定義
```

## 主要功能介面

### Parser 封裝介面
```typescript
import Parser from 'tree-sitter';
import Swift from 'tree-sitter-swift';

class TreeSitterWrapper {
  private parser: Parser;
  private language: any;

  constructor();
  parse(code: string, oldTree?: Parser.Tree): Parser.Tree;
  query(tree: Parser.Tree, queryString: string): QueryResult[];
  parseIncremental(code: string, oldTree: Parser.Tree, edits: Edit[]): Parser.Tree;
}
```

### 查詢建造器介面
```typescript
class QueryBuilder {
  buildDeclarationQuery(): string;
  buildReferenceQuery(symbolName: string): string;
  buildSwiftUIQuery(): string;
  buildAsyncQuery(): string;
  buildProtocolQuery(): string;
}
```

### AST 轉換器介面
```typescript
class SwiftASTConverter {
  convert(tree: Parser.Tree, source: string): UnifiedAST;
  convertNode(node: Parser.SyntaxNode): UnifiedASTNode;
  mapNodeType(treeSitterType: string): string;
  attachNodeInfo(node: Parser.SyntaxNode, unified: UnifiedASTNode): void;
}
```

### SwiftUI 處理器介面
```typescript
class SwiftUIHandler {
  processView(node: Parser.SyntaxNode): SwiftUIView;
  extractViewName(node: Parser.SyntaxNode): string;
  extractModifiers(node: Parser.SyntaxNode): ViewModifier[];
  extractStateProperties(node: Parser.SyntaxNode): StateProperty[];
  extractBindings(node: Parser.SyntaxNode): Binding[];
}
```

### Async 分析器介面
```typescript
class AsyncAnalyzer {
  analyzeAsync(tree: Parser.Tree): AsyncAnalysis;
  findAsyncFunctions(tree: Parser.Tree): AsyncFunction[];
  findAwaitExpressions(tree: Parser.Tree): AwaitExpression[];
  findActors(tree: Parser.Tree): Actor[];
  detectConcurrencyIssues(tree: Parser.Tree): ConcurrencyIssue[];
}
```

### Protocol 解析器介面
```typescript
class ProtocolResolver {
  resolveProtocol(node: Parser.SyntaxNode): ProtocolInfo;
  extractRequirements(node: Parser.SyntaxNode): ProtocolRequirement[];
  extractAssociatedTypes(node: Parser.SyntaxNode): AssociatedType[];
  extractConformances(node: Parser.SyntaxNode): ProtocolConformance[];
}
```

### 泛型提取器介面
```typescript
class GenericExtractor {
  extractGenerics(node: Parser.SyntaxNode): GenericInfo;
  extractGenericParameters(node: Parser.SyntaxNode): GenericParameter[];
  extractGenericConstraints(node: Parser.SyntaxNode): GenericConstraint[];
  extractWhereClause(node: Parser.SyntaxNode): WhereClause | null;
}
```

### 增量解析器介面
```typescript
class IncrementalParser {
  parseIncremental(fileName: string, newContent: string, changes: TextChange[]): Parser.Tree;
  convertToTreeSitterEdits(changes: TextChange[]): TreeSitterEdit[];
  computeChangedNodes(oldTree: Parser.Tree, newTree: Parser.Tree): ChangedNode[];
  invalidateCache(fileName: string): void;
}
```

### 符號表建構器介面
```typescript
class SymbolTableBuilder {
  build(tree: Parser.Tree): SymbolTable;
  traverse(node: Parser.SyntaxNode): void;
  handleClassDeclaration(node: Parser.SyntaxNode): void;
  handleFunctionDeclaration(node: Parser.SyntaxNode): void;
  handleProtocolDeclaration(node: Parser.SyntaxNode): void;
  createScope(type: string, name: string): Scope;
}
```

### 錯誤處理介面
```typescript
class ErrorExtractor {
  extractErrors(tree: Parser.Tree): ParseError[];
  traverseForErrors(node: Parser.SyntaxNode, errors: ParseError[]): void;
  getErrorMessage(node: Parser.SyntaxNode): string;
  classifyError(node: Parser.SyntaxNode): ErrorType;
}
```

## 核心型別定義

### 基本型別
```typescript
interface SwiftParserPlugin extends ParserPlugin {
  readonly name: 'swift';
  readonly supportedExtensions: readonly ['.swift'];
  readonly supportedLanguages: readonly ['swift'];
}

interface SwiftNode extends UnifiedASTNode {
  swiftType?: string;
  modifiers?: string[];
  generics?: GenericInfo;
  attributes?: Attribute[];
}

interface SwiftSymbol extends Symbol {
  swiftType: 'class' | 'struct' | 'protocol' | 'enum' | 'function' | 'property';
  modifiers: string[];
  generics?: GenericInfo;
  conformances?: string[];
}
```

### Swift 特色型別
```typescript
interface SwiftUIView {
  type: 'SwiftUIView';
  name: string;
  modifiers: ViewModifier[];
  body: string;
  state: StateProperty[];
  bindings: Binding[];
}

interface AsyncFunction {
  name: string;
  parameters: Parameter[];
  returnType?: string;
  throws: boolean;
  isAsync: boolean;
}

interface Actor {
  name: string;
  isolated: boolean;
  members: ActorMember[];
}

interface ProtocolInfo {
  name: string;
  conformances: string[];
  requirements: ProtocolRequirement[];
  associatedTypes: AssociatedType[];
}
```

### 查詢結果型別
```typescript
interface QueryResult {
  pattern: number;
  captures: QueryCapture[];
}

interface QueryCapture {
  name: string;
  node: Parser.SyntaxNode;
  text: string;
}

interface ParseError {
  type: 'SyntaxError' | 'MissingNode' | 'InvalidNode';
  message: string;
  location: Location;
  node?: string;
  text?: string;
}
```