# Swift Parser 插件開發規範

## 模組職責
使用 tree-sitter-swift 提供高效的 Swift 語法解析，支援最新 Swift 語言特性，轉換為框架統一 AST 格式。

## 開發原則

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

## 實作規範

### 檔案結構
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

## Tree-sitter 整合

### Parser 封裝
```typescript
import Parser from 'tree-sitter';
import Swift from 'tree-sitter-swift';

class TreeSitterWrapper {
  private parser: Parser;
  private language: any;
  
  constructor() {
    this.parser = new Parser();
    this.language = Swift;
    this.parser.setLanguage(this.language);
  }
  
  // 解析 Swift 程式碼
  parse(code: string, oldTree?: Parser.Tree): Parser.Tree {
    return this.parser.parse(code, oldTree);
  }
  
  // 查詢 AST
  query(tree: Parser.Tree, queryString: string): QueryResult[] {
    const query = this.language.query(queryString);
    const matches = query.matches(tree.rootNode);
    
    return matches.map(match => ({
      pattern: match.pattern,
      captures: match.captures.map(capture => ({
        name: capture.name,
        node: capture.node,
        text: capture.node.text
      }))
    }));
  }
  
  // 增量解析
  parseIncremental(
    code: string,
    oldTree: Parser.Tree,
    edits: Edit[]
  ): Parser.Tree {
    // 應用編輯
    for (const edit of edits) {
      oldTree.edit({
        startIndex: edit.startIndex,
        oldEndIndex: edit.oldEndIndex,
        newEndIndex: edit.newEndIndex,
        startPosition: edit.startPosition,
        oldEndPosition: edit.oldEndPosition,
        newEndPosition: edit.newEndPosition
      });
    }
    
    // 增量解析
    return this.parser.parse(code, oldTree);
  }
}
```

### 查詢建造器
```typescript
class QueryBuilder {
  // 建構宣告查詢
  buildDeclarationQuery(): string {
    return `
      ; 類別宣告
      (class_declaration
        name: (type_identifier) @class.name
        body: (class_body) @class.body) @class
      
      ; 結構宣告
      (struct_declaration
        name: (type_identifier) @struct.name
        body: (struct_body) @struct.body) @struct
      
      ; 協議宣告
      (protocol_declaration
        name: (type_identifier) @protocol.name
        body: (protocol_body) @protocol.body) @protocol
      
      ; 枚舉宣告
      (enum_declaration
        name: (type_identifier) @enum.name
        body: (enum_body) @enum.body) @enum
      
      ; 函式宣告
      (function_declaration
        name: (simple_identifier) @function.name
        parameters: (parameter_clause) @function.params
        result: (type_annotation)? @function.return) @function
      
      ; 變數宣告
      (property_declaration
        (pattern
          (simple_identifier) @variable.name)
        (type_annotation)? @variable.type) @variable
      
      ; 常數宣告
      (constant_declaration
        (pattern
          (simple_identifier) @constant.name)
        (type_annotation)? @constant.type) @constant
    `;
  }
  
  // 建構引用查詢
  buildReferenceQuery(symbolName: string): string {
    return `
      ; 函式呼叫
      (call_expression
        (simple_identifier) @call
        (#eq? @call "${symbolName}"))
      
      ; 變數引用
      (simple_identifier) @reference
      (#eq? @reference "${symbolName}")
      
      ; 成員存取
      (navigation_expression
        (simple_identifier) @member
        (#eq? @member "${symbolName}"))
    `;
  }
  
  // 建構 SwiftUI 查詢
  buildSwiftUIQuery(): string {
    return `
      ; View 建造器
      (call_expression
        (simple_identifier) @view
        (#match? @view "^[A-Z]"))
      
      ; ViewModifier
      (navigation_expression
        (call_expression) @modifier)
      
      ; @ViewBuilder
      (function_declaration
        (modifiers
          (attribute
            (user_type) @attribute
            (#eq? @attribute "ViewBuilder"))))
      
      ; Property Wrapper
      (property_declaration
        (modifiers
          (attribute
            (user_type) @wrapper
            (#match? @wrapper "^@"))))
    `;
  }
}
```

## AST 轉換

### Tree-sitter AST 轉換器
```typescript
class SwiftASTConverter {
  // 轉換 Tree-sitter AST 到統一格式
  convert(tree: Parser.Tree, source: string): UnifiedAST {
    return {
      type: 'Program',
      root: this.convertNode(tree.rootNode),
      sourceFile: 'unknown.swift',
      language: 'swift',
      parser: 'tree-sitter-swift',
      metadata: {
        swiftVersion: this.detectSwiftVersion(source),
        hasSwiftUI: this.detectSwiftUI(tree),
        hasAsync: this.detectAsync(tree),
        hasActors: this.detectActors(tree)
      },
      errors: this.extractErrors(tree),
      comments: this.extractComments(tree),
      tokens: [] // Tree-sitter 不提供 tokens
    };
  }
  
  // 遞迴轉換節點
  private convertNode(node: Parser.SyntaxNode): UnifiedASTNode {
    const unified: UnifiedASTNode = {
      type: this.mapNodeType(node.type),
      range: {
        start: node.startIndex,
        end: node.endIndex
      },
      loc: {
        start: {
          line: node.startPosition.row + 1,
          column: node.startPosition.column
        },
        end: {
          line: node.endPosition.row + 1,
          column: node.endPosition.column
        }
      },
      children: []
    };
    
    // 處理特定節點資訊
    this.attachNodeInfo(node, unified);
    
    // 轉換子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && !this.isTrivia(child)) {
        unified.children.push(this.convertNode(child));
      }
    }
    
    return unified;
  }
  
  // 節點類型映射
  private mapNodeType(treeSitterType: string): string {
    const mapping: Record<string, string> = {
      'source_file': 'Program',
      'class_declaration': 'ClassDeclaration',
      'struct_declaration': 'StructDeclaration',
      'protocol_declaration': 'ProtocolDeclaration',
      'enum_declaration': 'EnumDeclaration',
      'function_declaration': 'FunctionDeclaration',
      'property_declaration': 'PropertyDeclaration',
      'constant_declaration': 'ConstantDeclaration',
      'type_alias_declaration': 'TypeAliasDeclaration',
      'import_declaration': 'ImportDeclaration',
      'call_expression': 'CallExpression',
      'navigation_expression': 'MemberExpression',
      'simple_identifier': 'Identifier',
      'type_identifier': 'TypeIdentifier',
      'closure_expression': 'ClosureExpression',
      'if_statement': 'IfStatement',
      'guard_statement': 'GuardStatement',
      'switch_statement': 'SwitchStatement',
      'for_statement': 'ForStatement',
      'while_statement': 'WhileStatement',
      'do_statement': 'DoStatement',
      'async_function': 'AsyncFunction',
      'await_expression': 'AwaitExpression',
      'actor_declaration': 'ActorDeclaration'
    };
    
    return mapping[treeSitterType] || `Swift_${treeSitterType}`;
  }
  
  // 附加節點資訊
  private attachNodeInfo(node: Parser.SyntaxNode, unified: UnifiedASTNode): void {
    // 函式資訊
    if (node.type === 'function_declaration') {
      unified.functionInfo = this.extractFunctionInfo(node);
    }
    
    // 類別資訊
    if (node.type === 'class_declaration') {
      unified.classInfo = this.extractClassInfo(node);
    }
    
    // 協議資訊
    if (node.type === 'protocol_declaration') {
      unified.protocolInfo = this.extractProtocolInfo(node);
    }
  }
}
```

## Swift 特性處理

### SwiftUI 處理器
```typescript
class SwiftUIHandler {
  // 處理 SwiftUI View
  processView(node: Parser.SyntaxNode): SwiftUIView {
    return {
      type: 'SwiftUIView',
      name: this.extractViewName(node),
      modifiers: this.extractModifiers(node),
      body: this.extractBody(node),
      state: this.extractStateProperties(node),
      bindings: this.extractBindings(node)
    };
  }
  
  // 提取 View 名稱
  private extractViewName(node: Parser.SyntaxNode): string {
    const nameNode = node.childForFieldName('name');
    return nameNode ? nameNode.text : 'UnknownView';
  }
  
  // 提取 ViewModifier
  private extractModifiers(node: Parser.SyntaxNode): ViewModifier[] {
    const modifiers: ViewModifier[] = [];
    const query = `
      (navigation_expression
        (simple_identifier) @modifier)
    `;
    
    const matches = this.query(node, query);
    for (const match of matches) {
      const modifierNode = match.captures.find(c => c.name === 'modifier');
      if (modifierNode) {
        modifiers.push({
          name: modifierNode.node.text,
          arguments: this.extractArguments(modifierNode.node.parent)
        });
      }
    }
    
    return modifiers;
  }
  
  // 提取 @State 屬性
  private extractStateProperties(node: Parser.SyntaxNode): StateProperty[] {
    const properties: StateProperty[] = [];
    const query = `
      (property_declaration
        (modifiers
          (attribute
            (user_type) @wrapper
            (#match? @wrapper "^(State|Binding|ObservedObject|StateObject|EnvironmentObject)$")))
        (pattern
          (simple_identifier) @name)
        (type_annotation
          (type) @type)?) @property
    `;
    
    const matches = this.query(node, query);
    for (const match of matches) {
      properties.push({
        wrapper: match.captures.find(c => c.name === 'wrapper')?.node.text,
        name: match.captures.find(c => c.name === 'name')?.node.text,
        type: match.captures.find(c => c.name === 'type')?.node.text
      });
    }
    
    return properties;
  }
}
```

### Async/Await 分析器
```typescript
class AsyncAnalyzer {
  // 分析非同步函式
  analyzeAsync(tree: Parser.Tree): AsyncAnalysis {
    const asyncFunctions = this.findAsyncFunctions(tree);
    const awaitExpressions = this.findAwaitExpressions(tree);
    const actors = this.findActors(tree);
    const tasks = this.findTasks(tree);
    
    return {
      asyncFunctions,
      awaitExpressions,
      actors,
      tasks,
      concurrencyIssues: this.detectConcurrencyIssues(tree)
    };
  }
  
  // 找出 async 函式
  private findAsyncFunctions(tree: Parser.Tree): AsyncFunction[] {
    const functions: AsyncFunction[] = [];
    const query = `
      (function_declaration
        (modifiers
          (modifier) @modifier
          (#eq? @modifier "async"))
        name: (simple_identifier) @name
        parameters: (parameter_clause) @params
        result: (type_annotation)? @return) @function
    `;
    
    const matches = this.query(tree, query);
    for (const match of matches) {
      functions.push({
        name: match.captures.find(c => c.name === 'name')?.node.text,
        parameters: this.parseParameters(match.captures.find(c => c.name === 'params')?.node),
        returnType: match.captures.find(c => c.name === 'return')?.node.text,
        throws: this.hasThrows(match.captures.find(c => c.name === 'function')?.node)
      });
    }
    
    return functions;
  }
  
  // 找出 await 表達式
  private findAwaitExpressions(tree: Parser.Tree): AwaitExpression[] {
    const expressions: AwaitExpression[] = [];
    const query = `
      (await_expression
        (call_expression) @call) @await
    `;
    
    const matches = this.query(tree, query);
    for (const match of matches) {
      const callNode = match.captures.find(c => c.name === 'call')?.node;
      expressions.push({
        expression: callNode?.text,
        location: this.getLocation(callNode),
        context: this.getContextType(callNode)
      });
    }
    
    return expressions;
  }
  
  // 找出 Actors
  private findActors(tree: Parser.Tree): Actor[] {
    const actors: Actor[] = [];
    const query = `
      (actor_declaration
        name: (type_identifier) @name
        body: (actor_body) @body) @actor
    `;
    
    const matches = this.query(tree, query);
    for (const match of matches) {
      actors.push({
        name: match.captures.find(c => c.name === 'name')?.node.text,
        isolated: this.isIsolated(match.captures.find(c => c.name === 'actor')?.node),
        members: this.extractActorMembers(match.captures.find(c => c.name === 'body')?.node)
      });
    }
    
    return actors;
  }
}
```

### Protocol 解析器
```typescript
class ProtocolResolver {
  // 解析協議
  resolveProtocol(node: Parser.SyntaxNode): ProtocolInfo {
    return {
      name: this.extractProtocolName(node),
      conformances: this.extractConformances(node),
      requirements: this.extractRequirements(node),
      associatedTypes: this.extractAssociatedTypes(node),
      extensions: this.findExtensions(node)
    };
  }
  
  // 提取協議要求
  private extractRequirements(node: Parser.SyntaxNode): ProtocolRequirement[] {
    const requirements: ProtocolRequirement[] = [];
    
    // 方法要求
    const methodQuery = `
      (protocol_body
        (protocol_method_declaration
          name: (simple_identifier) @name
          parameters: (parameter_clause) @params
          result: (type_annotation)? @return) @method)
    `;
    
    const methodMatches = this.query(node, methodQuery);
    for (const match of methodMatches) {
      requirements.push({
        type: 'method',
        name: match.captures.find(c => c.name === 'name')?.node.text,
        signature: this.buildMethodSignature(match)
      });
    }
    
    // 屬性要求
    const propertyQuery = `
      (protocol_body
        (protocol_property_declaration
          (variable_declaration
            (pattern
              (simple_identifier) @name))
          (type_annotation) @type
          (protocol_property_requirements) @requirements) @property)
    `;
    
    const propertyMatches = this.query(node, propertyQuery);
    for (const match of propertyMatches) {
      requirements.push({
        type: 'property',
        name: match.captures.find(c => c.name === 'name')?.node.text,
        propertyType: match.captures.find(c => c.name === 'type')?.node.text,
        requirements: this.parsePropertyRequirements(
          match.captures.find(c => c.name === 'requirements')?.node
        )
      });
    }
    
    return requirements;
  }
  
  // 提取關聯類型
  private extractAssociatedTypes(node: Parser.SyntaxNode): AssociatedType[] {
    const associatedTypes: AssociatedType[] = [];
    const query = `
      (protocol_body
        (protocol_associated_type_declaration
          name: (type_identifier) @name
          (type_constraint)? @constraint) @associatedType)
    `;
    
    const matches = this.query(node, query);
    for (const match of matches) {
      associatedTypes.push({
        name: match.captures.find(c => c.name === 'name')?.node.text,
        constraint: match.captures.find(c => c.name === 'constraint')?.node.text
      });
    }
    
    return associatedTypes;
  }
}
```

### 泛型提取器
```typescript
class GenericExtractor {
  // 提取泛型資訊
  extractGenerics(node: Parser.SyntaxNode): GenericInfo {
    return {
      parameters: this.extractGenericParameters(node),
      constraints: this.extractGenericConstraints(node),
      whereClause: this.extractWhereClause(node)
    };
  }
  
  // 提取泛型參數
  private extractGenericParameters(node: Parser.SyntaxNode): GenericParameter[] {
    const parameters: GenericParameter[] = [];
    const query = `
      (generic_parameter_clause
        (generic_parameter
          (type_identifier) @name
          (type_constraint)? @constraint) @parameter)
    `;
    
    const matches = this.query(node, query);
    for (const match of matches) {
      parameters.push({
        name: match.captures.find(c => c.name === 'name')?.node.text,
        constraint: match.captures.find(c => c.name === 'constraint')?.node.text
      });
    }
    
    return parameters;
  }
  
  // 提取 where 子句
  private extractWhereClause(node: Parser.SyntaxNode): WhereClause | null {
    const query = `
      (generic_where_clause
        (requirement) @requirement) @where
    `;
    
    const matches = this.query(node, query);
    if (matches.length === 0) return null;
    
    const requirements = matches.map(match => 
      match.captures.find(c => c.name === 'requirement')?.node.text
    ).filter(Boolean);
    
    return {
      requirements
    };
  }
}
```

## 增量解析

### 增量解析器
```typescript
class IncrementalParser {
  private treeCache = new Map<string, Parser.Tree>();
  
  // 增量解析
  parseIncremental(
    fileName: string,
    newContent: string,
    changes: TextChange[]
  ): Parser.Tree {
    const oldTree = this.treeCache.get(fileName);
    
    if (!oldTree) {
      // 第一次解析
      const tree = this.parser.parse(newContent);
      this.treeCache.set(fileName, tree);
      return tree;
    }
    
    // 轉換變更為 Tree-sitter 格式
    const edits = this.convertToTreeSitterEdits(changes);
    
    // 增量解析
    const newTree = this.parser.parseIncremental(newContent, oldTree, edits);
    
    // 更新快取
    this.treeCache.set(fileName, newTree);
    
    // 計算變更的節點
    this.computeChangedNodes(oldTree, newTree);
    
    return newTree;
  }
  
  // 轉換變更格式
  private convertToTreeSitterEdits(changes: TextChange[]): TreeSitterEdit[] {
    return changes.map(change => ({
      startIndex: change.rangeOffset,
      oldEndIndex: change.rangeOffset + change.rangeLength,
      newEndIndex: change.rangeOffset + change.text.length,
      startPosition: this.offsetToPosition(change.rangeOffset),
      oldEndPosition: this.offsetToPosition(change.rangeOffset + change.rangeLength),
      newEndPosition: this.offsetToPosition(change.rangeOffset + change.text.length)
    }));
  }
  
  // 計算變更的節點
  private computeChangedNodes(
    oldTree: Parser.Tree,
    newTree: Parser.Tree
  ): ChangedNode[] {
    const changed: ChangedNode[] = [];
    
    // 使用 Tree-sitter 的 getChangedRanges
    const ranges = oldTree.getChangedRanges(newTree);
    
    for (const range of ranges) {
      // 找出受影響的節點
      const oldNodes = this.getNodesInRange(oldTree, range);
      const newNodes = this.getNodesInRange(newTree, range);
      
      changed.push({
        range,
        oldNodes,
        newNodes,
        type: this.determineChangeType(oldNodes, newNodes)
      });
    }
    
    return changed;
  }
}
```

## 符號表建構

### 符號表建構器
```typescript
class SymbolTableBuilder {
  private symbols = new Map<string, Symbol>();
  private scopes: Scope[] = [];
  private currentScope: Scope | null = null;
  
  // 建構符號表
  build(tree: Parser.Tree): SymbolTable {
    this.traverse(tree.rootNode);
    
    return {
      symbols: this.symbols,
      scopes: this.scopes,
      globals: this.findGlobalSymbols()
    };
  }
  
  // 遍歷 AST 建構符號表
  private traverse(node: Parser.SyntaxNode): void {
    switch (node.type) {
      case 'class_declaration':
        this.handleClassDeclaration(node);
        break;
      case 'function_declaration':
        this.handleFunctionDeclaration(node);
        break;
      case 'property_declaration':
      case 'constant_declaration':
        this.handleVariableDeclaration(node);
        break;
      case 'protocol_declaration':
        this.handleProtocolDeclaration(node);
        break;
      case 'enum_declaration':
        this.handleEnumDeclaration(node);
        break;
    }
    
    // 遞迴處理子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverse(child);
      }
    }
  }
  
  // 處理類別宣告
  private handleClassDeclaration(node: Parser.SyntaxNode): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    
    const symbol: ClassSymbol = {
      type: 'class',
      name: nameNode.text,
      scope: this.currentScope,
      node,
      modifiers: this.extractModifiers(node),
      generics: this.extractGenerics(node),
      superclass: this.extractSuperclass(node),
      protocols: this.extractProtocols(node),
      members: []
    };
    
    this.symbols.set(symbol.name, symbol);
    
    // 建立新作用域
    const classScope = this.createScope('class', symbol.name);
    this.pushScope(classScope);
    
    // 處理成員
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      this.traverse(bodyNode);
      symbol.members = this.collectScopeSymbols(classScope);
    }
    
    this.popScope();
  }
  
  // 處理函式宣告
  private handleFunctionDeclaration(node: Parser.SyntaxNode): void {
    const nameNode = node.childForFieldName('name');
    if (!nameNode) return;
    
    const symbol: FunctionSymbol = {
      type: 'function',
      name: nameNode.text,
      scope: this.currentScope,
      node,
      modifiers: this.extractModifiers(node),
      generics: this.extractGenerics(node),
      parameters: this.extractParameters(node),
      returnType: this.extractReturnType(node),
      throws: this.hasThrows(node),
      async: this.hasAsync(node)
    };
    
    this.symbols.set(symbol.name, symbol);
    
    // 建立函式作用域
    const functionScope = this.createScope('function', symbol.name);
    this.pushScope(functionScope);
    
    // 處理函式體
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      this.traverse(bodyNode);
    }
    
    this.popScope();
  }
}
```

## 錯誤處理

### 錯誤提取器
```typescript
class ErrorExtractor {
  // 提取解析錯誤
  extractErrors(tree: Parser.Tree): ParseError[] {
    const errors: ParseError[] = [];
    
    this.traverseForErrors(tree.rootNode, errors);
    
    return errors;
  }
  
  // 遍歷找出錯誤節點
  private traverseForErrors(
    node: Parser.SyntaxNode,
    errors: ParseError[]
  ): void {
    if (node.hasError()) {
      errors.push({
        type: 'SyntaxError',
        message: this.getErrorMessage(node),
        location: {
          start: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column
          },
          end: {
            line: node.endPosition.row + 1,
            column: node.endPosition.column
          }
        },
        node: node.type,
        text: node.text
      });
    }
    
    // 檢查缺失的節點
    if (node.isMissing()) {
      errors.push({
        type: 'MissingNode',
        message: `Missing ${node.type}`,
        location: this.getNodeLocation(node)
      });
    }
    
    // 遞迴檢查子節點
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        this.traverseForErrors(child, errors);
      }
    }
  }
  
  // 產生錯誤訊息
  private getErrorMessage(node: Parser.SyntaxNode): string {
    if (node.type === 'ERROR') {
      return `Syntax error at ${node.text}`;
    }
    
    if (node.isMissing()) {
      return `Expected ${node.type}`;
    }
    
    // 根據上下文產生更具體的錯誤訊息
    const parent = node.parent;
    if (parent) {
      return `Invalid ${node.type} in ${parent.type}`;
    }
    
    return `Parse error in ${node.type}`;
  }
}
```

## 效能優化

### 查詢快取
```typescript
class QueryCache {
  private cache = new LRUCache<string, CompiledQuery>(100);
  
  // 編譯並快取查詢
  getCompiledQuery(queryString: string): CompiledQuery {
    let compiled = this.cache.get(queryString);
    
    if (!compiled) {
      compiled = this.language.query(queryString);
      this.cache.set(queryString, compiled);
    }
    
    return compiled;
  }
  
  // 執行快取的查詢
  executeQuery(
    tree: Parser.Tree,
    queryString: string
  ): QueryResult[] {
    const compiled = this.getCompiledQuery(queryString);
    return compiled.matches(tree.rootNode);
  }
}
```

### 並行處理
```typescript
class ParallelProcessor {
  private workerPool: Worker[] = [];
  
  // 並行解析多個檔案
  async parseFiles(files: string[]): Promise<Map<string, Parser.Tree>> {
    const chunkSize = Math.ceil(files.length / this.workerPool.length);
    const chunks = this.chunkArray(files, chunkSize);
    
    const promises = chunks.map((chunk, index) => 
      this.parseInWorker(this.workerPool[index], chunk)
    );
    
    const results = await Promise.all(promises);
    
    // 合併結果
    const combined = new Map<string, Parser.Tree>();
    for (const result of results) {
      for (const [file, tree] of result) {
        combined.set(file, tree);
      }
    }
    
    return combined;
  }
}
```

## 開發檢查清單

### 功能完整性
- [ ] Tree-sitter 完整整合
- [ ] Swift 5.x 語法支援
- [ ] SwiftUI DSL 處理
- [ ] Async/Await 分析
- [ ] Protocol 解析完整
- [ ] 泛型處理準確

### 效能指標
- [ ] 單檔案解析 < 20ms
- [ ] 增量更新 < 5ms
- [ ] 查詢執行 < 10ms
- [ ] 記憶體使用 < 30MB

## 疑難排解

### 常見問題

1. **解析失敗**
   - 檢查 Swift 版本
   - 確認語法正確性
   - 更新 tree-sitter-swift

2. **SwiftUI 無法識別**
   - 確保查詢模式正確
   - 檢查 DSL 語法
   - 驗證節點結構

3. **增量解析不準**
   - 驗證編輯轉換
   - 檢查節點範圍
   - 確保 Tree 狀態一致

## 未來改進
1. SourceKit-LSP 整合
2. Swift Package Manager 支援  
3. DocC 註釋解析
4. Macro 完整支援