# Move 模組開發規範

## 模組職責
負責檔案和目錄的移動操作，自動更新所有相關的 import/export 路徑，確保專案結構重組的安全性。

## 開發原則

### 1. 路徑正確性
- **精確計算**：所有路徑計算必須精確無誤
- **相對路徑優先**：盡可能使用相對路徑
- **路徑正規化**：統一路徑格式（Unix 風格）
- **跨平台相容**：處理不同作業系統的路徑差異

### 2. 原子性保證
- 所有移動操作必須是原子的
- 失敗時完全回滾
- 確保檔案系統一致性
- 避免部分更新

### 3. 智能路徑處理
- 自動選擇最短路徑
- 保持路徑可讀性
- 支援路徑別名
- 處理循環依賴

## 實作規範

### 檔案結構
```
move/
├── index.ts              # 模組入口
├── service.ts            # MoveService 實作
├── path-calculator.ts    # 路徑計算核心
├── file-mover.ts        # 檔案移動執行器
├── directory-mover.ts   # 目錄移動執行器
├── reference-updater.ts # 引用更新器
├── validators/
│   ├── path-validator.ts    # 路徑驗證
│   ├── conflict-checker.ts  # 衝突檢查
│   └── permission-checker.ts # 權限檢查
├── resolvers/
│   ├── import-resolver.ts   # import 路徑解析
│   ├── alias-resolver.ts    # 別名解析
│   └── module-resolver.ts   # 模組解析
├── utils/
│   ├── path-utils.ts        # 路徑工具
│   └── fs-utils.ts          # 檔案系統工具
└── types.ts              # 型別定義
```

### 移動流程
```typescript
class MoveFlow {
  // 1. 預檢查
  async preCheck(operation: MoveOperation): Promise<PreCheckResult> {
    await this.checkPermissions(operation);
    await this.checkConflicts(operation);
    await this.validatePaths(operation);
    return { canProceed: true };
  }
  
  // 2. 影響分析
  async analyzeImpact(operation: MoveOperation): Promise<ImpactAnalysis> {
    const affected = await this.findAffectedFiles(operation);
    const updates = await this.calculateUpdates(affected, operation);
    return { affected, updates };
  }
  
  // 3. 執行移動
  async execute(operation: MoveOperation, impact: ImpactAnalysis): Promise<MoveResult> {
    // 先更新引用，再移動檔案
    await this.updateReferences(impact.updates);
    await this.moveFiles(operation);
    return { success: true };
  }
  
  // 4. 驗證結果
  async verify(result: MoveResult): Promise<void> {
    await this.verifyFileSystem();
    await this.verifyReferences();
  }
}
```

## 路徑計算演算法

### 相對路徑計算
```typescript
class PathCalculator {
  // 計算最優路徑
  calculateOptimalPath(from: string, to: string): string {
    const relative = this.getRelativePath(from, to);
    const aliased = this.checkAliasPath(from, to);
    
    // 選擇最短且最清晰的路徑
    return this.selectBestPath([relative, aliased]);
  }
  
  // 處理特殊情況
  handleSpecialCases(path: string): string {
    // index 檔案可以省略
    if (path.endsWith('/index')) {
      return path.slice(0, -6);
    }
    
    // 同目錄使用 ./
    if (!path.startsWith('.') && !path.startsWith('/')) {
      return './' + path;
    }
    
    return path;
  }
}
```

### 路徑更新策略
```typescript
interface PathUpdateStrategy {
  // ES6 import/export
  updateESModules(ast: AST, pathMapping: PathMapping): void;
  
  // CommonJS require
  updateCommonJS(ast: AST, pathMapping: PathMapping): void;
  
  // 動態 import
  updateDynamicImports(ast: AST, pathMapping: PathMapping): void;
  
  // 資源路徑（圖片、樣式等）
  updateResourcePaths(content: string, pathMapping: PathMapping): string;
}
```

## 特殊處理

### TypeScript 路徑映射
```typescript
class TypeScriptPathHandler {
  // 處理 tsconfig paths
  async updateTsConfigPaths(
    tsConfig: TsConfig,
    moveOperation: MoveOperation
  ): Promise<TsConfig> {
    const paths = tsConfig.compilerOptions?.paths || {};
    
    for (const [alias, targets] of Object.entries(paths)) {
      paths[alias] = targets.map(target => 
        this.updatePathTarget(target, moveOperation)
      );
    }
    
    return tsConfig;
  }
  
  // 解析別名路徑
  resolveAliasPath(importPath: string, tsConfig: TsConfig): string {
    const paths = tsConfig.compilerOptions?.paths || {};
    
    for (const [alias, targets] of Object.entries(paths)) {
      if (this.matchesAlias(importPath, alias)) {
        return this.resolveToActualPath(importPath, alias, targets);
      }
    }
    
    return importPath;
  }
}
```

### 目錄移動優化
```typescript
class DirectoryMover {
  // 批次移動優化
  async moveDirectory(
    sourceDir: string,
    targetDir: string
  ): Promise<void> {
    // 1. 收集所有檔案
    const files = await this.collectFiles(sourceDir);
    
    // 2. 計算所有新路徑
    const pathMappings = this.calculateMappings(files, sourceDir, targetDir);
    
    // 3. 批次更新內部引用（保持相對路徑不變）
    await this.updateInternalReferences(files, pathMappings);
    
    // 4. 批次更新外部引用
    await this.updateExternalReferences(pathMappings);
    
    // 5. 執行實際移動
    await this.performMove(sourceDir, targetDir);
  }
}
```

## 衝突處理

### 衝突類型
```typescript
enum ConflictType {
  FileExists = 'FILE_EXISTS',
  DirectoryExists = 'DIRECTORY_EXISTS',
  CircularDependency = 'CIRCULAR_DEPENDENCY',
  PermissionDenied = 'PERMISSION_DENIED',
  PathTooLong = 'PATH_TOO_LONG'
}

class ConflictResolver {
  async resolve(conflict: Conflict): Promise<Resolution> {
    switch (conflict.type) {
      case ConflictType.FileExists:
        return this.handleFileConflict(conflict);
      case ConflictType.CircularDependency:
        return this.breakCircularDependency(conflict);
      default:
        throw new UnresolvableConflict(conflict);
    }
  }
  
  // 提供解決建議
  suggest(conflict: Conflict): Suggestion[] {
    return [
      { action: 'rename', description: '重新命名目標檔案' },
      { action: 'merge', description: '合併到現有目錄' },
      { action: 'replace', description: '替換現有檔案' }
    ];
  }
}
```

## 效能優化

### 批次處理
```typescript
class BatchMoveOptimizer {
  // 優化多檔案移動
  optimizeBatchMove(operations: MoveOperation[]): OptimizedPlan {
    // 1. 依賴排序
    const sorted = this.topologicalSort(operations);
    
    // 2. 合併相同目錄的操作
    const merged = this.mergeDirectoryOps(sorted);
    
    // 3. 並行分組
    const parallel = this.groupParallel(merged);
    
    return { steps: parallel };
  }
  
  // 並行執行
  async executePlan(plan: OptimizedPlan): Promise<void> {
    for (const step of plan.steps) {
      await Promise.all(
        step.operations.map(op => this.executeOperation(op))
      );
    }
  }
}
```

### 快取策略
```typescript
class MoveCache {
  // 快取路徑解析結果
  private pathCache = new Map<string, ResolvedPath>();
  
  // 快取檔案內容（用於回滾）
  private contentCache = new Map<string, string>();
  
  // 智能預載入
  async preload(operation: MoveOperation): Promise<void> {
    const affected = await this.predictAffectedFiles(operation);
    await Promise.all(
      affected.map(file => this.cacheFile(file))
    );
  }
}
```

## Git 整合

### Git 操作
```typescript
class GitIntegration {
  // 使用 git mv 保留歷史
  async gitMove(source: string, target: string): Promise<void> {
    try {
      await this.exec(`git mv "${source}" "${target}"`);
    } catch {
      // 降級到普通移動
      await this.fallbackMove(source, target);
      await this.exec(`git add "${target}"`);
      await this.exec(`git rm "${source}"`);
    }
  }
  
  // 檢查 Git 狀態
  async checkGitStatus(path: string): Promise<GitStatus> {
    const status = await this.exec(`git status --porcelain "${path}"`);
    return this.parseStatus(status);
  }
}
```

## 測試策略

### 測試場景
1. **基本移動**
   - 單檔案移動
   - 目錄移動
   - 跨目錄移動

2. **路徑更新**
   - 相對路徑更新
   - 絕對路徑更新
   - 別名路徑更新

3. **特殊情況**
   - 循環依賴
   - 自引用
   - 符號連結

### 測試工具
```typescript
class MoveTestUtils {
  // 建立測試專案結構
  createTestProject(): TestProject {
    return {
      files: this.generateFiles(),
      dependencies: this.generateDependencies()
    };
  }
  
  // 驗證移動結果
  assertMoveResult(
    project: TestProject,
    operation: MoveOperation,
    expected: ExpectedState
  ): void {
    this.assertFilesExist(expected.files);
    this.assertPathsUpdated(expected.updates);
    this.assertNoDeadLinks();
  }
}
```

## 錯誤處理

### 錯誤恢復
```typescript
class MoveErrorRecovery {
  private rollbackPlan: RollbackPlan;
  
  // 記錄每個操作
  record(action: Action): void {
    this.rollbackPlan.push(action.reverse());
  }
  
  // 執行回滾
  async rollback(): Promise<void> {
    for (const action of this.rollbackPlan.reverse()) {
      try {
        await action.execute();
      } catch (e) {
        console.error('Rollback failed:', e);
        // 繼續回滾其他操作
      }
    }
  }
}
```

## 開發檢查清單

### 功能實作
- [ ] 支援所有路徑格式
- [ ] 處理所有 import 類型
- [ ] 實作衝突檢測
- [ ] 加入預覽功能
- [ ] 支援批次移動
- [ ] Git 整合

### 品質保證
- [ ] 測試覆蓋率 > 90%
- [ ] 路徑計算正確性驗證
- [ ] 效能基準測試
- [ ] 跨平台測試
- [ ] 回滾機制測試

## 疑難排解

### 常見問題

1. **路徑更新錯誤**
   - 檢查路徑計算邏輯
   - 確認相對路徑基準
   - 驗證別名配置

2. **檔案遺失**
   - 檢查權限問題
   - 確認路徑長度限制
   - 查看 Git 狀態

3. **循環依賴**
   - 分析依賴圖
   - 分階段移動
   - 使用臨時路徑

## 未來改進
1. 智能目錄結構建議
2. 自動化重構規則
3. 雲端同步支援
4. 版本控制深度整合