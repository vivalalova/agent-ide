# Swift Parser 插件開發計畫

## 模組目標
提供完整的 Swift 語法解析支援，使用 tree-sitter-swift 實現高效的語法分析，支援 Swift 5.x 的所有特性。

## 核心功能

### 1. 語法解析
- **Swift 特性**：
  - 類別、結構、枚舉
  - Protocol 和 Extension
  - 泛型和關聯型別
  - Property Wrapper
  - Result Builder
  - Actor 和並發
  - Macro（Swift 5.9+）
- **語法支援**：
  - Optional 和解包
  - 閉包和尾隨閉包
  - 屬性觀察器
  - 下標和運算子
  - async/await
  - 錯誤處理

### 2. Tree-sitter 整合
- **Parser 配置**：
  - 語法樹生成
  - 增量解析
  - 錯誤恢復
  - 查詢系統
- **效能優化**：
  - C++ binding
  - WASM 支援
  - 並行解析
  - 記憶體管理

### 3. 符號提取
- **Swift 符號**：
  - 型別定義（class、struct、enum、protocol）
  - 函式和方法
  - 屬性和變數
  - Extension 成員
  - 型別別名
  - 關聯型別
- **存取控制**：
  - open、public
  - internal
  - fileprivate、private
  - @available 標記

### 4. 依賴分析
- **Import 類型**：
  - 模組 import
  - 子模組 import
  - @_exported import
  - 條件編譯 import
- **Swift Package Manager**：
  - Package.swift 解析
  - 目標依賴
  - 產品定義
  - 平台需求

### 5. Swift 特定功能
- **Protocol 一致性**：
  - 實作追蹤
  - 預設實作
  - 關聯型別推導
  - Protocol 組合
- **泛型分析**：
  - 型別參數
  - 約束條件
  - Where 子句
  - 特化處理

## 介面實作

### ParserPlugin 實作
```typescript
class SwiftParserPlugin implements ParserPlugin {
  readonly name = 'swift';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.swift'];
  readonly supportedLanguages = ['swift'];
  
  private parser: TreeSitterParser;
  private queryEngine: QueryEngine;
  
  async parse(code: string, filePath: string): Promise<AST> {
    // 使用 tree-sitter 解析
    const tree = this.parser.parse(code);
    
    // 處理解析錯誤
    if (tree.rootNode.hasError()) {
      this.handleParseErrors(tree);
    }
    
    return this.convertToUnifiedAST(tree);
  }
  
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    const symbols: Symbol[] = [];
    
    // 使用 tree-sitter 查詢語言
    const query = this.queryEngine.query(`
      (class_declaration name: (type_identifier) @class)
      (struct_declaration name: (type_identifier) @struct)
      (enum_declaration name: (type_identifier) @enum)
      (protocol_declaration name: (type_identifier) @protocol)
      (function_declaration name: (simple_identifier) @function)
      (variable_declaration pattern: (identifier_pattern) @variable)
    `);
    
    const matches = query.matches(ast.root);
    
    for (const match of matches) {
      symbols.push(this.extractSwiftSymbol(match));
    }
    
    return symbols;
  }
  
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    // 查找符號引用
    const references: Reference[] = [];
    
    const query = this.queryEngine.query(`
      (type_identifier) @type_ref
      (simple_identifier) @identifier_ref
      (member_access) @member_ref
    `);
    
    const matches = query.matches(ast.root);
    
    for (const match of matches) {
      if (this.matchesSymbol(match, symbol)) {
        references.push(this.createReference(match));
      }
    }
    
    return references;
  }
  
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    
    // 提取 import 語句
    const importQuery = this.queryEngine.query(`
      (import_declaration module: (_) @module)
    `);
    
    const imports = importQuery.matches(ast.root);
    
    for (const imp of imports) {
      dependencies.push({
        path: this.extractModulePath(imp),
        type: 'import',
        isRelative: false,
        importedSymbols: this.extractImportedSymbols(imp)
      });
    }
    
    return dependencies;
  }
}
```

## Tree-sitter 設定

### Parser 初始化
```typescript
class TreeSitterManager {
  private parser: Parser;
  private language: Language;
  
  async initialize(): Promise<void> {
    // 載入 Swift 語言
    await Parser.init();
    this.parser = new Parser();
    
    const Swift = await Parser.Language.load('tree-sitter-swift.wasm');
    this.parser.setLanguage(Swift);
  }
  
  parse(code: string): Tree {
    return this.parser.parse(code);
  }
  
  parseIncremental(oldTree: Tree, edit: Edit): Tree {
    oldTree.edit(edit);
    return this.parser.parse(code, oldTree);
  }
}
```

### 查詢系統
```typescript
class QueryEngine {
  private language: Language;
  private queries: Map<string, Query>;
  
  query(pattern: string): Query {
    if (!this.queries.has(pattern)) {
      this.queries.set(pattern, 
        this.language.query(pattern)
      );
    }
    return this.queries.get(pattern)!;
  }
  
  // 預定義查詢
  getSymbolQuery(): Query {
    return this.query(SWIFT_SYMBOL_QUERY);
  }
  
  getImportQuery(): Query {
    return this.query(SWIFT_IMPORT_QUERY);
  }
  
  getProtocolConformanceQuery(): Query {
    return this.query(SWIFT_PROTOCOL_QUERY);
  }
}

// 查詢模板
const SWIFT_SYMBOL_QUERY = `
  ;; 型別定義
  (class_declaration
    modifiers: (modifiers)? @modifiers
    name: (type_identifier) @name
    generic_parameters: (generic_parameter_clause)? @generics
    type_inheritance_clause: (type_inheritance_clause)? @inheritance
  ) @class
  
  ;; 函式定義
  (function_declaration
    modifiers: (modifiers)? @modifiers
    name: (simple_identifier) @name
    generic_parameters: (generic_parameter_clause)? @generics
    parameters: (parameter_clause) @params
    return_type: (_)? @return
    generic_where_clause: (generic_where_clause)? @where
  ) @function
  
  ;; Protocol 定義
  (protocol_declaration
    modifiers: (modifiers)? @modifiers
    name: (type_identifier) @name
    inheritance_clause: (type_inheritance_clause)? @inheritance
    generic_where_clause: (generic_where_clause)? @where
  ) @protocol
`;
```

## Swift 特定處理

### Protocol 一致性分析
```typescript
class ProtocolConformanceAnalyzer {
  analyzeConformance(
    type: TypeDeclaration,
    protocol: ProtocolDeclaration
  ): ConformanceResult {
    const required = this.getRequiredMembers(protocol);
    const implemented = this.getImplementedMembers(type);
    
    return {
      conforms: this.checkConformance(required, implemented),
      missing: this.findMissingMembers(required, implemented),
      defaults: this.findDefaultImplementations(protocol)
    };
  }
  
  findProtocolExtensions(protocol: string): Extension[] {
    // 查找所有 protocol extension
    const query = this.queryEngine.query(`
      (extension_declaration
        type: (user_type (type_identifier) @protocol_name)
        (#eq? @protocol_name "${protocol}")
      ) @extension
    `);
    
    return query.matches(this.ast.root)
      .map(match => this.parseExtension(match));
  }
}
```

### 泛型處理
```typescript
class GenericAnalyzer {
  analyzeGenerics(node: ASTNode): GenericInfo {
    const parameters = this.extractTypeParameters(node);
    const constraints = this.extractConstraints(node);
    const whereClause = this.extractWhereClause(node);
    
    return {
      parameters,
      constraints,
      whereClause,
      associatedTypes: this.findAssociatedTypes(node)
    };
  }
  
  resolveGenericType(
    type: string,
    context: GenericContext
  ): ResolvedType {
    // 解析泛型型別
    if (context.typeParameters.has(type)) {
      return context.getConcreteType(type);
    }
    
    // 處理關聯型別
    if (type.includes('.')) {
      return this.resolveAssociatedType(type, context);
    }
    
    return { type, isGeneric: false };
  }
}
```

### Actor 和並發支援
```typescript
class ConcurrencyAnalyzer {
  analyzeConcurrency(ast: AST): ConcurrencyInfo {
    const actors = this.findActors(ast);
    const asyncFunctions = this.findAsyncFunctions(ast);
    const tasks = this.findTasks(ast);
    const mainActorUsage = this.findMainActorUsage(ast);
    
    return {
      actors,
      asyncFunctions,
      tasks,
      mainActorUsage,
      dataraces: this.detectPotentialDataraces(ast)
    };
  }
  
  findActors(ast: AST): ActorDeclaration[] {
    const query = this.queryEngine.query(`
      (actor_declaration
        name: (type_identifier) @name
      ) @actor
    `);
    
    return query.matches(ast.root)
      .map(match => this.parseActor(match));
  }
}
```

### SwiftUI 支援
```typescript
class SwiftUIAnalyzer {
  analyzeView(node: StructDeclaration): ViewInfo {
    // 檢查是否符合 View protocol
    if (!this.conformsToView(node)) {
      return null;
    }
    
    return {
      name: node.name,
      body: this.findBodyProperty(node),
      state: this.findStateProperties(node),
      bindings: this.findBindings(node),
      environmentValues: this.findEnvironmentValues(node)
    };
  }
  
  findPropertyWrappers(node: ASTNode): PropertyWrapper[] {
    const wrappers = ['State', 'Binding', 'ObservedObject', 
                      'StateObject', 'EnvironmentObject', 'Environment'];
    
    const query = this.queryEngine.query(`
      (property_declaration
        attributes: (attribute
          (user_type (type_identifier) @wrapper)
          (#match? @wrapper "^(${wrappers.join('|')})$")
        )
      ) @property
    `);
    
    return query.matches(node)
      .map(match => this.parsePropertyWrapper(match));
  }
}
```

## 重構支援

### Swift 重構操作
```typescript
class SwiftRefactor {
  // 提取 Protocol
  extractProtocol(
    members: Member[],
    protocolName: string
  ): RefactorResult {
    const protocolDeclaration = this.createProtocol(protocolName, members);
    const conformance = this.addConformance(originalType, protocolName);
    
    return {
      changes: [
        { type: 'create', content: protocolDeclaration },
        { type: 'modify', target: originalType, change: conformance }
      ]
    };
  }
  
  // 轉換為 async
  convertToAsync(function: FunctionDeclaration): RefactorResult {
    const asyncFunction = this.addAsyncModifier(function);
    const updatedCalls = this.updateCallSites(function.name);
    
    return {
      changes: [
        { type: 'modify', target: function, change: asyncFunction },
        ...updatedCalls
      ]
    };
  }
  
  // 簡化 Optional 鏈
  simplifyOptionalChaining(expression: Expression): RefactorResult {
    // 使用 guard let 或 if let 簡化
    const simplified = this.createGuardStatement(expression);
    
    return {
      changes: [
        { type: 'replace', target: expression, replacement: simplified }
      ]
    };
  }
}
```

## Package.swift 支援

### SPM 整合
```typescript
class SwiftPackageManager {
  async parsePackageManifest(path: string): Promise<PackageInfo> {
    const content = await this.readFile(path);
    const ast = await this.parseSwift(content);
    
    return {
      name: this.extractPackageName(ast),
      products: this.extractProducts(ast),
      dependencies: this.extractDependencies(ast),
      targets: this.extractTargets(ast),
      platforms: this.extractPlatforms(ast)
    };
  }
  
  resolveDependencyGraph(package: PackageInfo): DependencyGraph {
    // 解析套件依賴關係
    const graph = new DependencyGraph();
    
    for (const target of package.targets) {
      for (const dep of target.dependencies) {
        graph.addEdge(target.name, dep);
      }
    }
    
    return graph;
  }
}
```

## 效能優化

### 增量解析
```typescript
class IncrementalSwiftParser {
  private trees: Map<string, Tree>;
  
  parseIncremental(
    filePath: string,
    newContent: string,
    edit: Edit
  ): Tree {
    const oldTree = this.trees.get(filePath);
    
    if (oldTree) {
      oldTree.edit(edit);
      const newTree = this.parser.parse(newContent, oldTree);
      this.trees.set(filePath, newTree);
      return newTree;
    }
    
    return this.parseFullFile(filePath, newContent);
  }
}
```

## 測試計畫

### 語法測試
- Swift 5.x 所有語法
- SwiftUI 語法
- Concurrency 語法
- Macro 語法

### 功能測試
- 符號提取
- Protocol 一致性
- 泛型解析
- 依賴分析

### 效能測試
- 大檔案解析
- 增量解析
- 並行處理
- 記憶體使用

### 整合測試
- Xcode 專案支援
- SPM 專案支援
- 混合語言專案

## 風險評估
1. **Swift 版本更新快**：語言特性頻繁更新
   - 緩解：版本相容層和定期更新
2. **Tree-sitter 限制**：可能不支援最新語法
   - 緩解：貢獻上游或自定義擴展
3. **型別推導複雜**：Swift 型別系統複雜
   - 緩解：簡化處理和漸進式支援
4. **平台差異**：macOS/Linux 差異
   - 緩解：抽象平台相關功能

## 里程碑
- Week 1：Tree-sitter 整合
- Week 2：基礎符號提取
- Week 3：Protocol 和泛型支援
- Week 4：重構功能
- Week 5：SPM 支援
- Week 6：測試和優化