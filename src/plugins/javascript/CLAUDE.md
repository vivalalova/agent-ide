# JavaScript Parser 插件開發規範

## 實作狀態 ⏳

### 實際檔案結構
```
javascript/
├── index.ts (如需要)           ⏳ 插件入口
├── parser.ts (如需要)          ⏳ 主要 Parser 實作
├── symbol-extractor.ts (如需要)  ⏳ 符號提取器
├── dependency-analyzer.ts (如需要) ⏳ 依賴分析器
└── types.ts (如需要)            ⏳ 型別定義
```

### 實作功能狀態
- ⏳ 基本 JavaScript 解析功能
- ⏳ JSX 支援
- ⏳ ES6+ 語法支援
- ⏳ Flow 型別註解支援
- ⏳ 符號提取與索引
- ⏳ 依賴關係分析
- ⏳ 增量解析支援

## 模組職責
使用 Babel 提供完整的 JavaScript 語法解析，支援最新 ECMAScript 標準和實驗性特性，轉換為統一 AST 格式。

## 核心開發原則

### 1. Babel 生態系統
- **@babel/parser**：作為核心解析器
- **@babel/traverse**：用於 AST 遍歷
- **@babel/types**：用於 AST 節點操作
- **@babel/generator**：用於程式碼生成

### 2. 支援廣泛性
- ES2015 至最新標準
- JSX 語法
- Flow 類型註解
- 實驗性語法提案

### 3. 效能考量
- AST 結果快取
- 插件化架構
- 漸進式解析
- Source Map 支援

### 4. 容錯處理
- 語法錯誤恢復
- 部分解析支援
- 漸進式修復機制
- 錯誤位置精確定位

### 5. 現代 JavaScript 特性
- 完整的 ES2023+ 支援
- Decorators 和 Private Fields
- Top-level await
- 動態 import

## 實作檔案

### 核心架構
```
javascript/
├── index.ts                 # 插件入口
├── plugin.ts                # JavaScriptParserPlugin 實作
├── babel/
│   ├── parser-wrapper.ts       # Babel Parser 封裝
│   ├── traverser.ts            # AST 遍歷器
│   ├── generator.ts            # 程式碼生成器
│   └── plugin-loader.ts        # Babel 插件載入器
├── ast/
│   ├── converter.ts            # AST 轉換器
│   ├── node-mapper.ts          # 節點類型映射
│   ├── scope-analyzer.ts       # 作用域分析器
│   └── symbol-extractor.ts     # 符號提取器
├── features/
│   ├── jsx-handler.ts          # JSX 處理器
│   ├── flow-handler.ts         # Flow 類型處理器
│   ├── import-analyzer.ts      # Import 分析器
│   ├── export-analyzer.ts      # Export 分析器
│   └── modern-syntax.ts        # 現代語法處理器
├── dependencies/
│   ├── dependency-tracker.ts   # 依賴追蹤器
│   ├── module-resolver.ts      # 模組解析器
│   └── import-mapper.ts        # Import 映射器
└── types.ts                 # 型別定義
```

## 主要功能介面

### Babel Parser 封裝介面
```typescript
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

class BabelWrapper {
  private options: BabelParseOptions;

  constructor(options?: BabelParseOptions);
  parse(code: string, filename?: string): BabelAST;
  traverse(ast: BabelAST, visitor: TraversalVisitor): void;
  generate(ast: BabelAST, options?: GeneratorOptions): GeneratedCode;
}
```

### AST 轉換器介面
```typescript
class JavaScriptASTConverter {
  convert(ast: BabelAST, source: string): UnifiedAST;
  convertNode(node: BabelNode): UnifiedASTNode;
  mapNodeType(babelType: string): string;
  extractMetadata(node: BabelNode): NodeMetadata;
}
```

### 符號提取器介面
```typescript
class JavaScriptSymbolExtractor {
  extractSymbols(ast: BabelAST): JavaScriptSymbol[];
  extractFunctions(ast: BabelAST): FunctionSymbol[];
  extractClasses(ast: BabelAST): ClassSymbol[];
  extractVariables(ast: BabelAST): VariableSymbol[];
  extractImports(ast: BabelAST): ImportSymbol[];
  extractExports(ast: BabelAST): ExportSymbol[];
}
```

### JSX 處理器介面
```typescript
class JSXHandler {
  processJSXElements(ast: BabelAST): JSXElement[];
  extractComponents(ast: BabelAST): ReactComponent[];
  analyzeProps(element: JSXElement): PropInfo[];
  findComponentUsages(ast: BabelAST, componentName: string): ComponentUsage[];
}
```

### Flow 處理器介面
```typescript
class FlowHandler {
  extractTypeAnnotations(ast: BabelAST): TypeAnnotation[];
  extractInterfaces(ast: BabelAST): FlowInterface[];
  extractTypeAliases(ast: BabelAST): TypeAlias[];
  analyzeTypeUsage(ast: BabelAST): TypeUsageInfo[];
}
```

### 依賴分析器介面
```typescript
class DependencyTracker {
  analyzeDependencies(ast: BabelAST): DependencyInfo[];
  extractImports(ast: BabelAST): ImportDeclaration[];
  extractRequires(ast: BabelAST): RequireCall[];
  extractDynamicImports(ast: BabelAST): DynamicImport[];
  buildDependencyGraph(files: string[]): DependencyGraph;
}
```

### 作用域分析器介面
```typescript
class ScopeAnalyzer {
  analyzeScopes(ast: BabelAST): ScopeTree;
  extractBindings(scope: Scope): Binding[];
  findReferences(binding: Binding): Reference[];
  analyzeClosures(ast: BabelAST): ClosureInfo[];
}
```

## 核心型別定義

### 基本型別
```typescript
interface JavaScriptParserPlugin extends ParserPlugin {
  readonly name: 'javascript';
  readonly supportedExtensions: readonly ['.js', '.jsx', '.mjs', '.cjs'];
  readonly supportedLanguages: readonly ['javascript', 'jsx'];
}

interface BabelParseOptions {
  sourceType?: 'module' | 'script' | 'unambiguous';
  allowImportExportEverywhere?: boolean;
  allowAwaitOutsideFunction?: boolean;
  allowReturnOutsideFunction?: boolean;
  plugins?: BabelParserPlugin[];
  strictMode?: boolean;
  ranges?: boolean;
  tokens?: boolean;
}

interface BabelAST {
  type: 'File';
  program: Program;
  comments?: Comment[];
  tokens?: Token[];
  loc?: SourceLocation;
}
```

### JavaScript 符號型別
```typescript
interface JavaScriptSymbol extends Symbol {
  jsType: 'function' | 'class' | 'variable' | 'import' | 'export';
  scope: string;
  hoisted?: boolean;
  kind?: 'var' | 'let' | 'const' | 'function' | 'class';
}

interface FunctionSymbol extends JavaScriptSymbol {
  jsType: 'function';
  parameters: Parameter[];
  returnType?: TypeAnnotation;
  isAsync: boolean;
  isGenerator: boolean;
  isArrow: boolean;
}

interface ClassSymbol extends JavaScriptSymbol {
  jsType: 'class';
  superClass?: string;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  isAbstract?: boolean;
}

interface VariableSymbol extends JavaScriptSymbol {
  jsType: 'variable';
  kind: 'var' | 'let' | 'const';
  typeAnnotation?: TypeAnnotation;
  initializer?: Expression;
}
```

### JSX 型別
```typescript
interface JSXElement {
  type: 'JSXElement';
  openingElement: JSXOpeningElement;
  closingElement?: JSXClosingElement;
  children: JSXChild[];
  location: SourceLocation;
}

interface ReactComponent {
  name: string;
  type: 'functional' | 'class';
  props: PropInfo[];
  hooks?: HookUsage[];
  state?: StateInfo[];
  lifecycle?: LifecycleMethod[];
}

interface PropInfo {
  name: string;
  type?: TypeAnnotation;
  required: boolean;
  defaultValue?: any;
}

interface HookUsage {
  name: string;
  arguments: any[];
  dependencies?: string[];
  location: SourceLocation;
}
```

### Flow 型別
```typescript
interface FlowInterface {
  name: string;
  properties: InterfaceProperty[];
  extends?: string[];
  location: SourceLocation;
}

interface TypeAlias {
  name: string;
  type: FlowType;
  typeParameters?: TypeParameter[];
  location: SourceLocation;
}

interface TypeAnnotation {
  type: string;
  raw: string;
  flowType?: FlowType;
  location: SourceLocation;
}
```

### 依賴型別
```typescript
interface DependencyInfo {
  source: string;
  type: 'import' | 'require' | 'dynamic-import';
  imports: ImportSpecifier[];
  location: SourceLocation;
  resolved?: string;
}

interface ImportSpecifier {
  type: 'default' | 'named' | 'namespace';
  imported?: string;
  local: string;
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  cycles: DependencyCycle[];
}

interface DependencyNode {
  id: string;
  path: string;
  type: 'internal' | 'external';
  size?: number;
}
```

### 作用域型別
```typescript
interface ScopeTree {
  global: Scope;
  functions: Map<string, Scope>;
  blocks: Map<string, Scope>;
}

interface Scope {
  type: 'global' | 'function' | 'block' | 'module';
  bindings: Map<string, Binding>;
  references: Reference[];
  parent?: Scope;
  children: Scope[];
}

interface Binding {
  name: string;
  kind: 'var' | 'let' | 'const' | 'function' | 'class' | 'param';
  path: NodePath;
  referenced: boolean;
  constant: boolean;
}
```

### 錯誤處理型別
```typescript
interface ParseError {
  type: 'SyntaxError' | 'ReferenceError' | 'TypeError';
  message: string;
  location: SourceLocation;
  code?: string;
  suggestions?: string[];
}

interface ErrorRecoveryInfo {
  recovered: boolean;
  partialAST?: BabelAST;
  errors: ParseError[];
  warnings: ParseWarning[];
}
```