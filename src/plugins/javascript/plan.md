# JavaScript Parser 插件開發計畫

## 模組目標
提供完整的 JavaScript/JSX 語法解析支援，使用 @babel/parser 實現現代 JavaScript 語法分析。

## 核心功能

### 1. 語法解析
- **ECMAScript 支援**：
  - ES5 到 ESNext 所有語法
  - Stage 0-4 提案
  - JSX 語法
  - Flow 型別標註（可選）
- **模組系統**：
  - ES6 Modules
  - CommonJS
  - AMD/UMD
  - 動態 import

### 2. Babel 整合
- **Parser 配置**：
  - 插件系統
  - 預設配置
  - 自定義語法
  - Source type 設定
- **AST 規範**：
  - ESTree 相容
  - Babel AST 擴展
  - 位置資訊保留
  - 註解處理

### 3. 符號提取
- **JavaScript 特定**：
  - 函式（普通、箭頭、生成器、異步）
  - 類別（ES6 Class）
  - 變數（var、let、const）
  - 物件屬性
  - 原型方法
- **作用域分析**：
  - 全域作用域
  - 函式作用域
  - 區塊作用域
  - 閉包識別

### 4. 依賴分析
- **Import 類型**：
  - ES6 import/export
  - CommonJS require/exports
  - AMD define/require
  - 動態 import()
- **特殊處理**：
  - 條件 require
  - 動態路徑
  - Webpack 特定語法
  - Node.js 內建模組

### 5. 重構支援
- **基礎重構**：
  - 變數重新命名
  - 函式提取
  - 程式碼移動
  - 解構轉換
- **ES6+ 轉換**：
  - 箭頭函式轉換
  - 模板字串轉換
  - 解構賦值
  - async/await 轉換

## 介面實作

### ParserPlugin 實作
```typescript
class JavaScriptParserPlugin implements ParserPlugin {
  readonly name = 'javascript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.js', '.jsx', '.mjs', '.cjs'];
  readonly supportedLanguages = ['javascript', 'javascriptreact'];
  
  private parserOptions: ParserOptions;
  private scopeManager: ScopeManager;
  
  async parse(code: string, filePath: string): Promise<AST> {
    // 使用 Babel Parser 解析
    const babelAST = parse(code, {
      sourceType: this.detectSourceType(code),
      plugins: this.getPlugins(filePath),
      ...this.parserOptions
    });
    
    return this.convertToUnifiedAST(babelAST);
  }
  
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];
    
    traverse(ast, {
      FunctionDeclaration: (path) => {
        symbols.push(this.extractFunctionSymbol(path));
      },
      ClassDeclaration: (path) => {
        symbols.push(this.extractClassSymbol(path));
      },
      VariableDeclarator: (path) => {
        symbols.push(this.extractVariableSymbol(path));
      }
    });
    
    return symbols;
  }
  
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    const references: Reference[] = [];
    const binding = this.scopeManager.getBinding(symbol.name);
    
    if (binding) {
      references.push(...this.collectReferences(binding));
    }
    
    return references;
  }
  
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    
    traverse(ast, {
      ImportDeclaration: (path) => {
        dependencies.push(this.extractESMDependency(path));
      },
      CallExpression: (path) => {
        if (this.isRequireCall(path)) {
          dependencies.push(this.extractCJSDependency(path));
        }
      }
    });
    
    return dependencies;
  }
}
```

## Babel 設定

### Parser 選項
```typescript
interface ParserOptions {
  // 基本選項
  sourceType: 'script' | 'module' | 'unambiguous';
  strictMode?: boolean;
  allowReturnOutsideFunction?: boolean;
  allowImportExportEverywhere?: boolean;
  
  // 插件配置
  plugins: BabelPlugin[];
  
  // 位置資訊
  ranges?: boolean;
  tokens?: boolean;
  comments?: boolean;
  attachComments?: boolean;
}

type BabelPlugin = 
  | 'jsx'
  | 'flow'
  | 'typescript'
  | 'decorators'
  | 'classProperties'
  | 'dynamicImport'
  | 'nullishCoalescingOperator'
  | 'optionalChaining'
  | ['decorators', { decoratorsBeforeExport: boolean }];
```

### AST 轉換
```typescript
class BabelASTConverter {
  convertToUnifiedAST(babelAST: BabelNode): AST {
    return {
      type: 'Program',
      root: this.convertNode(babelAST),
      sourceFile: babelAST.loc?.filename || '',
      metadata: this.extractMetadata(babelAST),
      errors: []
    };
  }
  
  convertNode(babelNode: BabelNode): ASTNode {
    const unifiedNode: ASTNode = {
      type: this.mapNodeType(babelNode.type),
      range: this.convertRange(babelNode),
      loc: this.convertLocation(babelNode.loc),
      children: [],
      // 保留 Babel 特定屬性
      babel: babelNode
    };
    
    // 遞迴轉換子節點
    this.visitChildren(babelNode, (child) => {
      unifiedNode.children.push(this.convertNode(child));
    });
    
    return unifiedNode;
  }
}
```

## 作用域分析

### 作用域管理
```typescript
class ScopeManager {
  private scopes: Map<string, Scope>;
  private bindings: Map<string, Binding>;
  
  analyze(ast: AST): void {
    traverse(ast, {
      Program: (path) => this.createScope(path, 'global'),
      FunctionDeclaration: (path) => this.createScope(path, 'function'),
      BlockStatement: (path) => this.createScope(path, 'block'),
      
      Identifier: (path) => {
        if (path.isBinding()) {
          this.registerBinding(path);
        } else if (path.isReferenced()) {
          this.registerReference(path);
        }
      }
    });
  }
  
  getBinding(name: string): Binding | undefined {
    return this.bindings.get(name);
  }
  
  getScope(node: ASTNode): Scope | undefined {
    // 找到包含節點的作用域
    return this.findContainingScope(node);
  }
}

interface Scope {
  type: 'global' | 'function' | 'block';
  parent?: Scope;
  bindings: Set<string>;
  references: Map<string, Reference[]>;
}

interface Binding {
  name: string;
  scope: Scope;
  node: ASTNode;
  kind: 'var' | 'let' | 'const' | 'function' | 'class' | 'param';
  references: Reference[];
}
```

## 特殊語法處理

### JSX 處理
```typescript
class JSXHandler {
  parseJSXElement(node: JSXElement): ComponentInfo {
    return {
      name: this.getComponentName(node.openingElement),
      props: this.extractProps(node.openingElement.attributes),
      children: this.parseChildren(node.children),
      isComponent: this.isComponent(node.openingElement.name)
    };
  }
  
  extractProps(attributes: JSXAttribute[]): PropInfo[] {
    return attributes.map(attr => ({
      name: attr.name.name,
      value: this.evaluateValue(attr.value),
      isSpread: false
    }));
  }
}
```

### 動態 Import 處理
```typescript
class DynamicImportHandler {
  analyzeDynamicImport(node: CallExpression): DynamicImportInfo {
    const source = this.extractSource(node.arguments[0]);
    
    return {
      source,
      isDynamic: !this.isStaticString(source),
      chunkName: this.extractChunkName(node),
      fallback: this.extractFallback(node)
    };
  }
  
  extractChunkName(node: CallExpression): string | undefined {
    // 處理 Webpack magic comments
    const comment = node.leadingComments?.find(c => 
      c.value.includes('webpackChunkName')
    );
    
    if (comment) {
      return this.parseWebpackComment(comment.value);
    }
  }
}
```

## 重構功能

### ES6 轉換
```typescript
class ES6Transformer {
  // 箭頭函式轉普通函式
  arrowToFunction(arrow: ArrowFunctionExpression): FunctionExpression {
    return t.functionExpression(
      null,
      arrow.params,
      t.isExpression(arrow.body) 
        ? t.blockStatement([t.returnStatement(arrow.body)])
        : arrow.body,
      arrow.generator,
      arrow.async
    );
  }
  
  // 模板字串轉普通字串
  templateToString(template: TemplateLiteral): BinaryExpression {
    // 將模板字串轉換為字串連接
    return this.buildConcatenation(
      template.quasis,
      template.expressions
    );
  }
  
  // 解構賦值轉換
  destructuringToAssignment(pattern: Pattern): Statement[] {
    // 將解構模式轉換為多個賦值語句
    return this.expandPattern(pattern);
  }
}
```

## 效能優化

### 快取策略
```typescript
class ParserCache {
  private astCache: LRUCache<string, AST>;
  private symbolCache: LRUCache<string, Symbol[]>;
  
  getCachedAST(code: string, options: ParserOptions): AST | null {
    const key = this.generateKey(code, options);
    return this.astCache.get(key);
  }
  
  setCachedAST(code: string, options: ParserOptions, ast: AST): void {
    const key = this.generateKey(code, options);
    this.astCache.set(key, ast);
  }
}
```

### 增量解析
```typescript
class IncrementalParser {
  parseIncremental(
    oldAST: AST,
    changes: TextChange[]
  ): AST {
    // 只重新解析變更的部分
    const affectedNodes = this.findAffectedNodes(oldAST, changes);
    const newNodes = this.reparseNodes(affectedNodes, changes);
    return this.mergeAST(oldAST, newNodes);
  }
}
```

## 測試計畫

### 語法測試
- ES5 基礎語法
- ES6+ 新特性
- JSX 語法
- 實驗性語法

### 功能測試
- 符號提取準確性
- 依賴分析完整性
- 重構正確性
- 作用域分析

### 相容性測試
- 不同 Babel 版本
- 各種配置組合
- 邊界情況處理

### 效能測試
- 大檔案解析速度
- 記憶體使用量
- 快取效率
- 增量解析效能

## 配置支援

### .babelrc 整合
```typescript
interface BabelConfigLoader {
  loadConfig(projectRoot: string): BabelConfig;
  mergeConfigs(configs: BabelConfig[]): BabelConfig;
  resolvePresets(presets: string[]): Plugin[];
  resolvePlugins(plugins: Array<string | [string, any]>): Plugin[];
}
```

## 風險評估
1. **語法變化快**：JavaScript 提案頻繁更新
   - 緩解：插件化架構和定期更新
2. **配置複雜**：Babel 配置選項繁多
   - 緩解：智能預設和配置驗證
3. **效能問題**：解析大檔案較慢
   - 緩解：快取和增量解析
4. **相容性問題**：不同環境的語法支援差異
   - 緩解：可配置的語法特性

## 里程碑
- Week 1：基礎 Parser 整合
- Week 2：符號提取實作
- Week 3：依賴分析功能
- Week 4：重構支援
- Week 5：效能優化
- Week 6：測試和文件