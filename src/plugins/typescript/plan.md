# TypeScript Parser 插件開發計畫

## 模組目標
提供完整的 TypeScript/TSX 語法解析支援，利用 TypeScript Compiler API 實現精確的語法分析。

## 核心功能

### 1. 語法解析
- **支援特性**：
  - TypeScript 所有語法
  - TSX/JSX 支援
  - 裝飾器（Decorators）
  - 型別標註
  - 泛型
  - 模組系統（ESM/CommonJS）
- **編譯選項**：
  - tsconfig.json 整合
  - 自定義編譯選項
  - 專案參考（Project References）
  - 路徑映射（Path Mapping）

### 2. 符號提取
- **符號類型**：
  - 類別/介面/型別別名
  - 函式/方法
  - 變數/常數
  - 枚舉/命名空間
  - 泛型參數
- **符號資訊**：
  - 型別資訊
  - 修飾符（public/private/protected）
  - 泛型約束
  - JSDoc 註解

### 3. 依賴分析
- **Import 類型**：
  - ES6 import/export
  - CommonJS require
  - 動態 import()
  - 型別 import
  - Re-export
- **路徑解析**：
  - 相對路徑
  - 絕對路徑
  - Node modules
  - TypeScript paths
  - Barrel exports

### 4. 重構支援
- **重構操作**：
  - 重新命名（含型別）
  - 提取函式/方法
  - 提取型別/介面
  - 移動檔案（更新 import）
  - 改變函式簽名
- **型別安全**：
  - 型別檢查
  - 型別推導
  - 泛型處理
  - 聯合/交集型別

### 5. 智能功能
- **程式碼補全**：
  - 成員補全
  - 型別補全
  - 路徑補全
  - 自動 import
- **診斷功能**：
  - 語法錯誤
  - 型別錯誤
  - 未使用檢測
  - 最佳實踐建議

## 介面實作

### ParserPlugin 實作
```typescript
class TypeScriptParserPlugin implements ParserPlugin {
  readonly name = 'typescript';
  readonly version = '1.0.0';
  readonly supportedExtensions = ['.ts', '.tsx', '.d.ts', '.mts', '.cts'];
  readonly supportedLanguages = ['typescript', 'typescriptreact'];
  
  private languageService: ts.LanguageService;
  private program: ts.Program;
  private typeChecker: ts.TypeChecker;
  
  async parse(code: string, filePath: string): Promise<AST> {
    // 使用 TypeScript Compiler API 解析
    const sourceFile = ts.createSourceFile(
      filePath,
      code,
      ts.ScriptTarget.Latest,
      true
    );
    
    return this.convertToUnifiedAST(sourceFile);
  }
  
  async extractSymbols(ast: AST): Promise<Symbol[]> {
    // 遍歷 AST 提取符號
    const symbols: Symbol[] = [];
    this.visitNode(ast.root, (node) => {
      if (this.isSymbolNode(node)) {
        symbols.push(this.extractSymbol(node));
      }
    });
    return symbols;
  }
  
  async findReferences(ast: AST, symbol: Symbol): Promise<Reference[]> {
    // 使用 Language Service 查找引用
    const references = this.languageService.findReferences(
      symbol.location.file,
      symbol.location.position
    );
    return this.convertReferences(references);
  }
  
  async extractDependencies(ast: AST): Promise<Dependency[]> {
    // 提取 import/export 語句
    const dependencies: Dependency[] = [];
    this.visitNode(ast.root, (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        dependencies.push(this.extractDependency(node));
      }
    });
    return dependencies;
  }
  
  async rename(ast: AST, position: Position, newName: string): Promise<CodeEdit[]> {
    // 使用 Language Service 重新命名
    const renameInfo = this.languageService.getRenameInfo(
      position.file,
      position.offset
    );
    
    if (!renameInfo.canRename) {
      throw new Error(renameInfo.localizedErrorMessage);
    }
    
    const locations = this.languageService.findRenameLocations(
      position.file,
      position.offset,
      false,
      false
    );
    
    return this.createRenameEdits(locations, newName);
  }
}
```

## 實作細節

### TypeScript Compiler API 整合
```typescript
interface CompilerHost {
  createLanguageService(options: CompilerOptions): ts.LanguageService;
  createProgram(files: string[], options: ts.CompilerOptions): ts.Program;
  getTypeChecker(program: ts.Program): ts.TypeChecker;
  
  // 檔案系統操作
  readFile(path: string): string | undefined;
  fileExists(path: string): boolean;
  getDirectories(path: string): string[];
}

interface CompilerOptions {
  projectPath?: string;
  tsConfigPath?: string;
  compilerOptions?: ts.CompilerOptions;
  includeLibs?: boolean;
}
```

### AST 轉換
```typescript
interface ASTConverter {
  convertToUnifiedAST(sourceFile: ts.SourceFile): AST;
  convertNode(tsNode: ts.Node): ASTNode;
  convertSymbol(tsSymbol: ts.Symbol): Symbol;
  convertType(tsType: ts.Type): TypeInfo;
}

interface TypeInfo {
  kind: 'primitive' | 'object' | 'union' | 'intersection' | 'generic';
  name: string;
  typeArguments?: TypeInfo[];
  members?: TypeMember[];
}
```

## 測試計畫

### 單元測試
- 基本語法解析
- 符號提取測試
- 依賴分析測試
- 型別推導測試

### 語法覆蓋測試
- ES6+ 語法
- TypeScript 特定語法
- JSX/TSX 語法
- 裝飾器語法

### 重構測試
- 重新命名測試
- 提取函式測試
- 移動檔案測試
- 型別安全測試

### 效能測試
- 大檔案解析
- 專案級解析
- 增量解析
- 記憶體使用

## 特殊處理

### TSX/JSX 支援
- JSX 元素解析
- Props 型別推導
- 事件處理器識別
- 組件引用追蹤

### 裝飾器處理
- 裝飾器解析
- 元資料提取
- 裝飾器參數分析
- 實驗性裝飾器支援

### 型別系統
- 泛型實例化
- 條件型別
- 映射型別
- 模板字面型別
- 型別守衛識別

### 模組解析
- Node 解析策略
- TypeScript 解析策略
- 路徑映射處理
- Monorepo 支援

## 配置管理

### tsconfig.json 支援
```typescript
interface TSConfigManager {
  loadTSConfig(path: string): ts.ParsedCommandLine;
  mergeTSConfigs(configs: ts.ParsedCommandLine[]): ts.CompilerOptions;
  resolvePaths(baseUrl: string, paths: Record<string, string[]>): PathMapping;
  handleProjectReferences(references: ts.ProjectReference[]): void;
}
```

### 自定義配置
```typescript
interface PluginConfig {
  // 編譯選項覆蓋
  compilerOptions?: Partial<ts.CompilerOptions>;
  
  // 包含/排除模式
  include?: string[];
  exclude?: string[];
  
  // 效能選項
  enableIncrementalParsing?: boolean;
  maxFileSize?: number;
  cacheStrategy?: 'memory' | 'disk' | 'hybrid';
}
```

## 效能優化

### 增量解析
- 檔案變更追蹤
- 部分 AST 更新
- 符號快取
- 型別快取

### 並行處理
- Worker 執行緒
- 批次處理
- 異步解析
- 結果串流

## 整合功能

### Language Service 功能
- 自動補全
- 快速修復
- 程式碼動作
- 簽名幫助
- 懸停資訊

### 診斷功能
- 編譯錯誤
- 型別錯誤
- Lint 規則
- 複雜度警告

## 風險評估
1. **效能問題**：TypeScript Compiler API 可能較慢
   - 緩解：快取和增量解析
2. **記憶體消耗**：大型專案佔用過多記憶體
   - 緩解：分片處理和垃圾回收優化
3. **版本相容**：TypeScript 版本更新頻繁
   - 緩解：多版本支援和向後相容
4. **配置複雜**：tsconfig 選項繁多
   - 緩解：智能預設值和配置驗證

## 里程碑
- Week 1：基礎解析功能
- Week 2：符號和依賴提取
- Week 3：重構功能實作
- Week 4：Language Service 整合
- Week 5：效能優化
- Week 6：測試和文件